import { VersionVector, type LoroDoc } from "loro-crdt";
import { addTombstone, deleteDraft, listDrafts, listTombstones, type Store } from "./library";
import { coveredBy, decodeVersion, loadDraft, mergeDraft } from "./merge";
import type { Transport } from "./transport";

/**
 * Brings two devices' libraries level over one transport. Both sides do the
 * same thing, so there is no leader:
 *
 *   INDEX    the drafts I have, and the drafts I deleted (with how far each
 *            had got when it was deleted)
 *   HELLO    for one draft, what I already have (a version vector); the other
 *            side answers with exactly what I am missing
 *   UPDATE   changes to one draft, as a Loro update
 *   UPTODATE the answer to a HELLO when nothing is missing, so each side
 *            knows when it is truly level
 *
 * A device lists its drafts and says hello for each one it has; when the other
 * side lists a draft it has never seen, it says hello with nothing, and so
 * receives the whole draft. Drafts merge with Loro, so edits made on both sides
 * since they last met come together without losing either.
 *
 * Deleting follows one rule: a deletion wins, unless the other device holds
 * writing in that draft which the deleting device never saw. Then the draft
 * is kept on both, because that writing would otherwise be lost unseen.
 */
const INDEX = 0;
const HELLO = 1;
const UPDATE = 2;
const UPTODATE = 3;

/** Ids become storage keys, so only plain ones are accepted from the other device. */
export const VALID_ID = /^[\w-]{1,64}$/;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function frame(kind: number, id: string, body: Uint8Array): Uint8Array {
  const name = encoder.encode(id);
  const out = new Uint8Array(2 + name.length + body.length);
  out[0] = kind;
  out[1] = name.length;
  out.set(name, 2);
  out.set(body, 2 + name.length);
  return out;
}

function parse(data: Uint8Array): { kind: number; id: string; body: Uint8Array } | undefined {
  if (data.length < 2 || data.length < 2 + data[1]) return undefined;
  return { kind: data[0], id: decoder.decode(data.subarray(2, 2 + data[1])), body: data.subarray(2 + data[1]) };
}

interface IndexMessage {
  ids: string[];
  /** Deleted draft ids, each with its version vector (base64) when deleted, or "" if unknown. */
  deleted: Record<string, string>;
}

function readIndex(body: Uint8Array): IndexMessage | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(body));
  } catch {
    return undefined;
  }
  if (Array.isArray(parsed)) return { ids: parsed.filter((x): x is string => typeof x === "string"), deleted: {} };
  if (!parsed || typeof parsed !== "object") return undefined;
  const { ids, deleted } = parsed as Partial<IndexMessage>;
  return {
    ids: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [],
    deleted: deleted && typeof deleted === "object" ? Object.fromEntries(Object.entries(deleted).filter(([, v]) => typeof v === "string")) : {},
  };
}

/** A saved draft's version vector, for a tombstone. */
export function draftVersion(store: Store, id: string): Uint8Array | undefined {
  return loadDraft(store, id)?.oplogVersion().encode();
}

export interface SyncHooks {
  /** A draft arrived or changed here. `created` is true when this device had not seen it before. */
  onUpdate?(id: string, created: boolean): void;
  /** A draft was deleted here because the other device deleted it. */
  onDeleted?(id: string): void;
  /** A draft could not be saved, because this device's storage is full or blocked. */
  onStorageFull?(id: string): void;
  /** Both sides have answered every request: the libraries are level. */
  onSettled?(): void;
  /** Any message from the other device was handled. */
  onActivity?(): void;
}

export class LibrarySync {
  private stopListening: () => void = () => {};
  /** Drafts this side has said hello for and not yet heard back about. */
  private waiting = new Set<string>();
  private theirIndexSeen = false;
  private settled = false;

  constructor(
    private store: Store,
    private transport: Transport,
    private hooks: SyncHooks = {},
    /** Called after a draft is saved, so other tabs of this browser can be told. */
    private onSaved: (id: string, update: Uint8Array) => void = () => {},
  ) {}

  start(): void {
    this.stopListening = this.transport.onMessage((data) => this.receive(data));
    const ids = listDrafts(this.store).map((d) => d.id);
    const deleted = Object.fromEntries(Object.entries(listTombstones(this.store)).map(([id, t]) => [id, t.version ?? ""]));
    this.transport.send(frame(INDEX, "", encoder.encode(JSON.stringify({ ids, deleted } satisfies IndexMessage))));
    for (const id of ids) this.hello(id);
  }

  stop(): void {
    this.stopListening();
  }

  private load(id: string): LoroDoc | undefined {
    return loadDraft(this.store, id);
  }

  private hello(id: string, version?: VersionVector): void {
    this.waiting.add(id);
    const v = version ?? this.load(id)?.oplogVersion() ?? new VersionVector(null);
    this.transport.send(frame(HELLO, id, v.encode()));
  }

  private answered(id: string): void {
    this.waiting.delete(id);
    this.checkSettled();
  }

  private checkSettled(): void {
    if (this.settled || !this.theirIndexSeen || this.waiting.size > 0) return;
    this.settled = true;
    this.hooks.onSettled?.();
  }

  /** Send a whole draft unasked: the other device deleted it, but this one holds writing it never saw. */
  private offerWhole(id: string): void {
    const doc = this.load(id);
    if (doc) this.transport.send(frame(UPDATE, id, doc.export({ mode: "update" })));
  }

  private receive(data: Uint8Array): void {
    // A fault here is a bug, not a message that failed to open: say so, and carry on.
    try {
      this.handle(data);
    } catch (error) {
      console.error("Rampai: could not handle a message from the other device", error);
    }
  }

  private handle(data: Uint8Array): void {
    const message = parse(data);
    if (!message) return;
    this.hooks.onActivity?.();
    if (message.kind === INDEX) return this.receiveIndex(message.body);
    if (!VALID_ID.test(message.id)) return;
    if (message.kind === HELLO) return this.receiveHello(message.id, message.body);
    if (message.kind === UPDATE) return this.receiveUpdate(message.id, message.body);
    if (message.kind === UPTODATE) return this.answered(message.id);
  }

  private receiveIndex(body: Uint8Array): void {
    const index = readIndex(body);
    if (!index) return;
    const known = new Set(listDrafts(this.store).map((d) => d.id));
    const mine = listTombstones(this.store);

    for (const [id, version] of Object.entries(index.deleted)) {
      if (!VALID_ID.test(id)) continue;
      const theirs = decodeVersion(version);
      if (known.has(id)) {
        const doc = this.load(id);
        const ours = doc?.oplogVersion() ?? new VersionVector(null);
        if (theirs && coveredBy(ours, theirs)) {
          // Nothing here that the other device had not seen when it deleted the draft.
          deleteDraft(this.store, id, ours.encode());
          known.delete(id);
          this.waiting.delete(id);
          this.hooks.onDeleted?.(id);
        } else {
          // Writing here that the other device never saw: keep the draft, and give it back.
          this.offerWhole(id);
        }
      } else if (!(id in mine)) {
        // Remember the deletion, so a third device that still has the draft hears of it from here.
        addTombstone(this.store, id, theirs?.encode());
      }
    }

    for (const id of index.ids) {
      // Say hello with nothing for each draft this device has never seen, to receive all of it.
      // A draft this device deleted is not asked for; the other side decides from the tombstone.
      if (VALID_ID.test(id) && !known.has(id) && !(id in mine)) this.hello(id, new VersionVector(null));
    }
    this.theirIndexSeen = true;
    this.checkSettled();
  }

  private receiveHello(id: string, body: Uint8Array): void {
    const doc = this.load(id);
    let theirs: VersionVector;
    try {
      theirs = VersionVector.decode(body);
    } catch {
      return;
    }
    // Loro writes a small header even when nothing is missing, so compare versions instead of bytes.
    if (!doc || coveredBy(doc.oplogVersion(), theirs)) {
      this.transport.send(frame(UPTODATE, id, new Uint8Array()));
      return;
    }
    this.transport.send(frame(UPDATE, id, doc.export({ mode: "update", from: theirs })));
  }

  private receiveUpdate(id: string, body: Uint8Array): void {
    const result = mergeDraft(this.store, id, body);
    if (result === "storage-full") this.hooks.onStorageFull?.(id);
    if (result === "created" || result === "merged") {
      this.onSaved(id, body);
      this.hooks.onUpdate?.(id, result === "created");
    }
    this.answered(id);
  }
}


import { VersionVector, type LoroDoc } from "loro-crdt";
import { adoptDraft, draftKey, listDrafts, updateDraft, type Store } from "./library";
import { createDoc, wordsOf } from "./model";
import { getTitle, isFinished } from "./meta";
import { readSnapshot, writeSnapshot } from "./storage";
import type { Transport } from "./transport";

/**
 * Brings two devices' libraries level over one transport. Both sides do the
 * same thing, so there is no leader:
 *
 *   INDEX  the ids of the drafts I have
 *   HELLO  for one draft, what I already have (a version vector); the other
 *          side answers with exactly what I am missing
 *   UPDATE changes to one draft, as a Loro update
 *
 * A device lists its drafts and says hello for each one it has; when the other
 * side lists a draft it has never seen, it says hello with nothing, and so
 * receives the whole draft. Drafts merge with Loro, so edits made on both sides
 * since they last met come together without losing either.
 *
 * Deleting a draft is not synced: a deletion is not something a CRDT can say
 * about a document that another device may still be editing.
 */
const INDEX = 0;
const HELLO = 1;
const UPDATE = 2;

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

export interface SyncHooks {
  /** A draft arrived or changed here. `created` is true when this device had not seen it before. */
  onUpdate?(id: string, created: boolean): void;
  /** Any message from the other device was handled. */
  onActivity?(): void;
}

export class LibrarySync {
  private stopListening: () => void = () => {};

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
    this.transport.send(frame(INDEX, "", encoder.encode(JSON.stringify(ids))));
    for (const id of ids) this.hello(id);
  }

  stop(): void {
    this.stopListening();
  }

  private load(id: string): LoroDoc | undefined {
    const bytes = readSnapshot(this.store, draftKey(id));
    if (!bytes) return undefined;
    const doc = createDoc();
    doc.import(bytes);
    return doc;
  }

  private hello(id: string): void {
    const doc = this.load(id);
    const version = doc ? doc.oplogVersion() : new VersionVector(null);
    this.transport.send(frame(HELLO, id, version.encode()));
  }

  private receive(data: Uint8Array): void {
    const message = parse(data);
    if (!message) return;
    this.hooks.onActivity?.();

    if (message.kind === INDEX) {
      let ids: unknown;
      try {
        ids = JSON.parse(decoder.decode(message.body));
      } catch {
        return;
      }
      if (!Array.isArray(ids)) return;
      const known = new Set(listDrafts(this.store).map((d) => d.id));
      for (const id of ids) {
        // Say hello with nothing for each draft this device has never seen, to receive all of it.
        if (typeof id === "string" && VALID_ID.test(id) && !known.has(id)) this.transport.send(frame(HELLO, id, new VersionVector(null).encode()));
      }
      return;
    }

    if (!VALID_ID.test(message.id)) return;

    if (message.kind === HELLO) {
      const doc = this.load(message.id);
      if (!doc) return;
      let theirs: VersionVector;
      try {
        theirs = VersionVector.decode(message.body);
      } catch {
        return;
      }
      const missing = doc.export({ mode: "update", from: theirs });
      if (missing.length > 0) this.transport.send(frame(UPDATE, message.id, missing));
      return;
    }

    if (message.kind === UPDATE) {
      const existing = this.load(message.id);
      const doc = existing ?? createDoc();
      try {
        doc.import(message.body);
      } catch {
        return;
      }
      const summary = { title: getTitle(doc), words: wordsOf(doc), finished: isFinished(doc), updatedAt: Date.now() };
      // List the draft before saving it: with no index yet, one is rebuilt from the saved drafts,
      // which would otherwise list this draft by a placeholder title.
      const listed = listDrafts(this.store).some((d) => d.id === message.id);
      if (!listed) adoptDraft(this.store, { id: message.id, ...summary });
      writeSnapshot(this.store, draftKey(message.id), doc.export({ mode: "snapshot" }));
      if (listed) updateDraft(this.store, message.id, summary);
      this.onSaved(message.id, message.body);
      this.hooks.onUpdate?.(message.id, !listed);
    }
  }
}

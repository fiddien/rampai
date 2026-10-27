// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { LibrarySync, VALID_ID } from "../src/sync/librarySync";
import { adoptDraft, deleteDraft, draftKey, listDrafts, listTombstones } from "../src/sync/library";
import { draftVersion } from "../src/sync/librarySync";
import { chunked } from "../src/sync/chunks";
import { MemoryLink, encrypted, type Transport } from "../src/sync/transport";
import { generateKey } from "../src/sync/crypto";
import { createDoc, readDocFromLoro, wordsOf } from "../src/sync/model";
import { setTitle, setProposition, markFinished, getTitle, isFinished } from "../src/sync/meta";
import { readSnapshot, writeSnapshot } from "../src/sync/storage";
import { device, type } from "./helpers";
import type { LoroDoc } from "loro-crdt";

class MemoryStore {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem = (k: string) => void this.m.delete(k);
  get length() {
    return this.m.size;
  }
  key = (i: number) => Array.from(this.m.keys())[i] ?? null;
}

/** A draft with some typed text, saved in a store under `id`. */
function save(store: MemoryStore, id: string, text: string, peer: number, title?: string): LoroDoc {
  const d = device(peer);
  type(d, text);
  if (title) setTitle(d.doc, title);
  writeSnapshot(store, draftKey(id), d.doc.export({ mode: "snapshot" }));
  adoptDraft(store, { id, title: getTitle(d.doc), words: wordsOf(d.doc), updatedAt: 1, finished: isFinished(d.doc) });
  return d.doc;
}

const settle = () => new Promise((r) => setTimeout(r, 30));

function link(a: MemoryStore, b: MemoryStore, wrap: (t: Transport) => Transport = (t) => t) {
  const l = new MemoryLink();
  const sa = new LibrarySync(a, wrap(l.a));
  const sb = new LibrarySync(b, wrap(l.b));
  sa.start();
  sb.start();
  return { sa, sb };
}

const textOf = (store: MemoryStore, id: string) => {
  const doc = createDoc();
  doc.import(readSnapshot(store, draftKey(id))!);
  return readDocFromLoro(doc).textContent;
};

describe("library sync", () => {
  test("a draft the other device has never seen arrives whole, with its title and state", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    const doc = save(a, "d1", "Writing connects ideas", 1, "On ramps");
    setProposition(doc, "Writing connects ideas.");
    markFinished(doc, 5);
    writeSnapshot(a, draftKey("d1"), doc.export({ mode: "snapshot" }));
    link(a, b);
    await settle();
    expect(listDrafts(b)).toMatchObject([{ id: "d1", title: "On ramps", words: 3, finished: true }]);
    expect(textOf(b, "d1")).toBe("Writing connects ideas");
  });

  test("drafts that only one device has end up on both", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "only-a", "from a", 1);
    save(b, "only-b", "from b", 2);
    link(a, b);
    await settle();
    expect(listDrafts(a).map((d) => d.id).sort()).toEqual(["only-a", "only-b"]);
    expect(listDrafts(b).map((d) => d.id).sort()).toEqual(["only-a", "only-b"]);
    expect(textOf(a, "only-b")).toBe("from b");
    expect(textOf(b, "only-a")).toBe("from a");
  });

  test("edits made on both devices since they last met merge without losing either", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    const base = save(a, "shared", "base", 1);
    writeSnapshot(b, draftKey("shared"), base.export({ mode: "snapshot" }));
    adoptDraft(b, { id: "shared", title: "My first bad draft", words: 1, updatedAt: 1 });
    // Each side edits the same draft while apart.
    for (const [store, peer, add] of [[a, 11, " plus a"], [b, 12, " plus b"]] as const) {
      const d = device(peer, (() => { const x = createDoc(); x.import(readSnapshot(store, draftKey("shared"))!); return x; })());
      d.view.dispatch(d.view.state.tr.insertText(add, d.view.state.doc.content.size - 1));
      writeSnapshot(store, draftKey("shared"), d.doc.export({ mode: "snapshot" }));
    }
    link(a, b);
    await settle();
    const ta = textOf(a, "shared");
    expect(ta).toBe(textOf(b, "shared"));
    expect(ta).toContain("plus a");
    expect(ta).toContain("plus b");
  });

  test("a title changed on one device reaches the other", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    const doc = save(a, "d", "text", 1);
    writeSnapshot(b, draftKey("d"), doc.export({ mode: "snapshot" }));
    adoptDraft(b, { id: "d", title: "My first bad draft", words: 1, updatedAt: 1 });
    setTitle(doc, "Renamed");
    writeSnapshot(a, draftKey("d"), doc.export({ mode: "snapshot" }));
    link(a, b);
    await settle();
    expect(listDrafts(b)[0].title).toBe("Renamed");
  });

  test("a large draft crosses in chunks and arrives intact", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    const long = "word ".repeat(20000).trim();
    save(a, "big", long, 1);
    link(a, b, (t) => chunked(t, 4096));
    await settle();
    await settle();
    expect(textOf(b, "big")).toBe(long);
    expect(listDrafts(b)[0].words).toBe(20000);
  });

  test("ids from the other device that are not plain are ignored", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    for (const bad of ["../etc", "a b", "x".repeat(65), ""]) expect(VALID_ID.test(bad)).toBe(false);
    const doc = save(a, "ok-1", "fine", 1);
    const l = new MemoryLink();
    new LibrarySync(b, l.b).start();
    // A hostile device sends an update under a bad id.
    const bad = new TextEncoder().encode("../x");
    const frame = new Uint8Array(2 + bad.length + 1);
    frame[0] = 2;
    frame[1] = bad.length;
    frame.set(bad, 2);
    l.a.send(frame);
    await settle();
    expect(listDrafts(b)).toEqual([]);
    void doc;
  });

  test("the hook tells the page what arrived, and other tabs are told with the update", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "d1", "hello there", 1);
    const l = new MemoryLink();
    const arrived = vi.fn();
    const saved = vi.fn();
    new LibrarySync(a, l.a).start();
    new LibrarySync(b, l.b, { onUpdate: arrived }, saved).start();
    await settle();
    expect(arrived).toHaveBeenCalledWith("d1", true);
    expect(saved).toHaveBeenCalledWith("d1", expect.any(Uint8Array));
  });

  test("a device with different recovery words is rejected and receives nothing", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "secret", "private words", 1);
    const l = new MemoryLink();
    const rejected = vi.fn();
    new LibrarySync(a, encrypted(l.a, await generateKey())).start();
    new LibrarySync(b, encrypted(l.b, await generateKey(), rejected)).start();
    await settle();
    expect(rejected).toHaveBeenCalled();
    expect(listDrafts(b)).toEqual([]);
  });

  test("devices with the same key sync through the sealed channel", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "d1", "sealed", 1);
    const key = await generateKey();
    link(a, b, (t) => encrypted(chunked(t), key));
    await settle();
    await settle();
    expect(textOf(b, "d1")).toBe("sealed");
  });
});

describe("chunking", () => {
  test("splits and rejoins messages of every size, including empty", () => {
    const l = new MemoryLink();
    const got: number[] = [];
    chunked(l.b, 8).onMessage((m) => got.push(m.length));
    const send = chunked(l.a, 8);
    for (const n of [0, 1, 8, 9, 100]) send.send(new Uint8Array(n).fill(7));
    return settle().then(() => expect(got).toEqual([0, 1, 8, 9, 100]));
  });
});

/** Append text to a saved draft, as if the writer typed it on that device. */
function edit(store: MemoryStore, id: string, add: string, peer: number) {
  const x = createDoc();
  x.import(readSnapshot(store, draftKey(id))!);
  const d = device(peer, x);
  d.view.dispatch(d.view.state.tr.insertText(add, d.view.state.doc.content.size - 1));
  writeSnapshot(store, draftKey(id), d.doc.export({ mode: "snapshot" }));
}

const ids = (s: MemoryStore) => listDrafts(s).map((d) => d.id).sort();

describe("deleting on linked devices", () => {
  test("a deletion reaches the other device when it has nothing newer", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "d1", "short-lived", 1);
    link(a, b);
    await settle();
    expect(ids(b)).toEqual(["d1"]);

    deleteDraft(a, "d1", draftVersion(a, "d1"));
    const deleted = vi.fn();
    const l = new MemoryLink();
    new LibrarySync(a, l.a).start();
    new LibrarySync(b, l.b, { onDeleted: deleted }).start();
    await settle();
    expect(ids(a)).toEqual([]);
    expect(ids(b)).toEqual([]);
    expect(readSnapshot(b, draftKey("d1"))).toBeUndefined();
    expect(deleted).toHaveBeenCalledWith("d1");
  });

  test("a draft with writing the deleting device never saw is kept, and comes back to it", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "d1", "first words", 1);
    link(a, b);
    await settle();

    deleteDraft(a, "d1", draftVersion(a, "d1"));
    edit(b, "d1", " and more, written on the phone", 22);
    link(a, b);
    await settle();
    expect(ids(a)).toEqual(["d1"]);
    expect(ids(b)).toEqual(["d1"]);
    expect(textOf(a, "d1")).toContain("written on the phone");
    expect(listTombstones(a)).not.toHaveProperty("d1");
  });

  test("the deletion travels on to a third device", async () => {
    const [a, b, c] = [new MemoryStore(), new MemoryStore(), new MemoryStore()];
    save(a, "d1", "everywhere", 1);
    link(a, b);
    await settle();
    link(b, c);
    await settle();
    expect(ids(c)).toEqual(["d1"]);

    deleteDraft(a, "d1", draftVersion(a, "d1"));
    link(a, b);
    await settle();
    link(b, c);
    await settle();
    expect([ids(a), ids(b), ids(c)]).toEqual([[], [], []]);
  });

  test("a draft deleted on both is not asked for again", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "d1", "gone", 1);
    link(a, b);
    await settle();
    deleteDraft(a, "d1", draftVersion(a, "d1"));
    deleteDraft(b, "d1", draftVersion(b, "d1"));
    link(a, b);
    await settle();
    expect([ids(a), ids(b)]).toEqual([[], []]);
  });
});

describe("when storage is full", () => {
  test("a draft that cannot be saved is not listed, and the page is told", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "d1", "Some words here", 1, "Full");
    const plain = b.setItem.bind(b);
    b.setItem = (k: string, v: string) => {
      if (k.startsWith("rampai:draft:")) throw new DOMException("full", "QuotaExceededError");
      plain(k, v);
    };
    const hooks = { onStorageFull: vi.fn(), onUpdate: vi.fn(), onSettled: vi.fn() };
    const l = new MemoryLink();
    new LibrarySync(a, l.a).start();
    new LibrarySync(b, l.b, hooks).start();
    await settle();
    expect(listDrafts(b)).toEqual([]);
    expect(hooks.onStorageFull).toHaveBeenCalledWith("d1");
    expect(hooks.onUpdate).not.toHaveBeenCalled();
    expect(hooks.onSettled).toHaveBeenCalledOnce();
  });
});

describe("settling", () => {
  test("each side knows when every request has been answered, even when nothing was missing", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "d1", "same on both", 1);
    link(a, b);
    await settle();
    const sa = vi.fn();
    const sb = vi.fn();
    const l = new MemoryLink();
    new LibrarySync(a, l.a, { onSettled: sa }).start();
    new LibrarySync(b, l.b, { onSettled: sb }).start();
    await settle();
    expect(sa).toHaveBeenCalledOnce();
    expect(sb).toHaveBeenCalledOnce();
  });

  test("an index in the older form (a plain list of ids) is still understood", async () => {
    const b = new MemoryStore();
    const l = new MemoryLink();
    const sent: Uint8Array[] = [];
    l.a.onMessage((d) => sent.push(d));
    new LibrarySync(b, l.b).start();
    const ids = new TextEncoder().encode(JSON.stringify(["d9"]));
    const frame = new Uint8Array(2 + ids.length);
    frame.set(ids, 2);
    l.a.send(frame);
    await settle();
    // B asks for the draft it has never seen: a HELLO (kind 1) for "d9".
    expect(sent.some((m) => m[0] === 1 && new TextDecoder().decode(m.subarray(2, 2 + m[1])) === "d9")).toBe(true);
  });
});

describe("chunk size limit", () => {
  test("a message over the limit is dropped, and the next one still arrives", () => {
    const l = new MemoryLink();
    const got: number[] = [];
    chunked(l.b, 4, 10).onMessage((m) => got.push(m.length));
    const send = chunked(l.a, 4, 10);
    send.send(new Uint8Array(40));
    send.send(new Uint8Array(6));
    return settle().then(() => expect(got).toEqual([6]));
  });
});

describe("linking again with nothing new", () => {
  test("sends no updates and leaves the edited time alone", async () => {
    const a = new MemoryStore();
    const b = new MemoryStore();
    save(a, "d1", "unchanged", 1);
    link(a, b);
    await settle();
    const before = listDrafts(b)[0].updatedAt;
    const ua = vi.fn();
    const ub = vi.fn();
    const l = new MemoryLink();
    new LibrarySync(a, l.a, { onUpdate: ua }).start();
    new LibrarySync(b, l.b, { onUpdate: ub }).start();
    await settle();
    expect(ua).not.toHaveBeenCalled();
    expect(ub).not.toHaveBeenCalled();
    expect(listDrafts(b)[0].updatedAt).toBe(before);
  });
});

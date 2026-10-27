// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { LibrarySync } from "../src/sync/librarySync";
import { adoptDraft, draftKey, listDrafts } from "../src/sync/library";
import { MemoryLink } from "../src/sync/transport";
import { createDoc, readDocFromLoro, wordsOf } from "../src/sync/model";
import { getTitle } from "../src/sync/meta";
import { readSnapshot, writeSnapshot } from "../src/sync/storage";
import { blocks, blockStart, cursor, device, type, type Device } from "./helpers";
import { MemoryStore } from "./render";

const settle = () => new Promise((r) => setTimeout(r, 40));

/** Save an open editor's draft in a device's store, as autosave would. */
function save(store: MemoryStore, id: string, d: Device) {
  writeSnapshot(store, draftKey(id), d.doc.export({ mode: "snapshot" }));
  if (!listDrafts(store).some((e) => e.id === id)) adoptDraft(store, { id, title: getTitle(d.doc), words: wordsOf(d.doc), updatedAt: 1 });
}

/** Open a saved draft in an editor on a device. */
function open(store: MemoryStore, id: string, peer: number): Device {
  const doc = createDoc();
  doc.import(readSnapshot(store, draftKey(id))!);
  return device(peer, doc);
}

function link(a: MemoryStore, b: MemoryStore) {
  const l = new MemoryLink();
  const sa = new LibrarySync(a, l.a);
  const sb = new LibrarySync(b, l.b);
  sa.start();
  sb.start();
  return { l, sa, sb };
}

const textOf = (store: MemoryStore, id: string) => {
  const doc = createDoc();
  doc.import(readSnapshot(store, draftKey(id))!);
  return readDocFromLoro(doc).textContent;
};

describe("live link", () => {
  test("words typed on one device appear in the other's open editor as they are typed", async () => {
    const [a, b] = [new MemoryStore(), new MemoryStore()];
    const laptop = device(1);
    type(laptop, "Hello");
    save(a, "d1", laptop);
    const { sa, sb } = link(a, b);
    await settle();
    const phone = open(b, "d1", 2);
    sa.attach("d1", laptop.binding);
    sb.attach("d1", phone.binding);
    await settle();

    type(laptop, ", phone");
    await settle();
    expect(blocks(phone)).toEqual(["Hello, phone"]);

    cursor(phone, blockStart(phone, 0));
    type(phone, "Hi. ");
    await settle();
    expect(blocks(laptop)).toEqual(["Hi. Hello, phone"]);
  });

  test("typing on both at once converges", async () => {
    const [a, b] = [new MemoryStore(), new MemoryStore()];
    const laptop = device(1);
    type(laptop, "middle");
    save(a, "d1", laptop);
    const { sa, sb } = link(a, b);
    await settle();
    const phone = open(b, "d1", 2);
    sa.attach("d1", laptop.binding);
    sb.attach("d1", phone.binding);
    await settle();
    cursor(laptop, blockStart(laptop, 0));
    type(laptop, "start ");
    type(phone, " end");
    await settle();
    expect(blocks(laptop)).toEqual(["start middle end"]);
    expect(blocks(phone)).toEqual(blocks(laptop));
  });

  test("an edit that depends on writing not yet saved is caught up from the open editor", async () => {
    const [a, b] = [new MemoryStore(), new MemoryStore()];
    const laptop = device(1);
    type(laptop, "Saved");
    save(a, "d1", laptop);
    type(laptop, " unsaved"); // typed after the last save
    const { sa, sb } = link(a, b);
    await settle();
    const phone = open(b, "d1", 2);
    expect(blocks(phone)).toEqual(["Saved"]);
    sb.attach("d1", phone.binding);
    sa.attach("d1", laptop.binding);
    type(laptop, " more");
    await settle();
    expect(blocks(phone)).toEqual(["Saved unsaved more"]);
  });

  test("a draft started on one device while linked reaches the other", async () => {
    const [a, b] = [new MemoryStore(), new MemoryStore()];
    const { sa } = link(a, b);
    await settle();
    const laptop = device(1);
    type(laptop, "Brand new");
    save(a, "fresh", laptop);
    sa.attach("fresh", laptop.binding);
    type(laptop, " draft");
    await settle();
    expect(listDrafts(b).map((d) => d.id)).toEqual(["fresh"]);
    expect(textOf(b, "fresh")).toBe("Brand new draft");
  });

  test("closing a draft stops its edits from going over", async () => {
    const [a, b] = [new MemoryStore(), new MemoryStore()];
    const laptop = device(1);
    type(laptop, "One");
    save(a, "d1", laptop);
    const { sa, sb } = link(a, b);
    await settle();
    const phone = open(b, "d1", 2);
    const detach = sa.attach("d1", laptop.binding);
    sb.attach("d1", phone.binding);
    await settle();
    detach();
    type(laptop, " two");
    await settle();
    expect(blocks(phone)).toEqual(["One"]);
  });
});

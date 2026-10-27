// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { BackupError, backupFileName, makeBackup, readBackup, restoreBackup } from "../src/sync/backup";
import { adoptDraft, deleteDraft, draftKey, listDrafts, listTombstones } from "../src/sync/library";
import { draftVersion } from "../src/sync/librarySync";
import { createDoc, readDocFromLoro, wordsOf } from "../src/sync/model";
import { getTitle, isFinished, setTitle } from "../src/sync/meta";
import { readSnapshot, writeSnapshot } from "../src/sync/storage";
import { generateKey } from "../src/sync/crypto";
import { deriveKey, wordsMatchKey } from "../src/sync/keys";
import { restoreSummary } from "../src/ui/BackupPage";
import { device, type } from "./helpers";

class MemoryStore {
  m = new Map<string, string>();
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

function save(store: MemoryStore, id: string, text: string, peer: number, title?: string) {
  const d = device(peer);
  type(d, text);
  if (title) setTitle(d.doc, title);
  writeSnapshot(store, draftKey(id), d.doc.export({ mode: "snapshot" }));
  adoptDraft(store, { id, title: getTitle(d.doc), words: wordsOf(d.doc), updatedAt: 1, finished: isFinished(d.doc) });
}

function edit(store: MemoryStore, id: string, add: string, peer: number) {
  const x = createDoc();
  x.import(readSnapshot(store, draftKey(id))!);
  const d = device(peer, x);
  d.view.dispatch(d.view.state.tr.insertText(add, d.view.state.doc.content.size - 1));
  writeSnapshot(store, draftKey(id), d.doc.export({ mode: "snapshot" }));
}

const textOf = (store: MemoryStore, id: string) => {
  const doc = createDoc();
  doc.import(readSnapshot(store, draftKey(id))!);
  return readDocFromLoro(doc).textContent;
};

describe("backup file", () => {
  test("holds every draft, and restores them whole on another device with the same words", async () => {
    const key = await generateKey();
    const laptop = new MemoryStore();
    save(laptop, "d1", "First thoughts on ramps", 1, "Ramps");
    save(laptop, "d2", "Second piece", 2);
    const { bytes, count } = await makeBackup(laptop, key, 1000);
    expect(count).toBe(2);
    // Sealed: the words of the drafts are not in the file.
    expect(new TextDecoder().decode(bytes)).not.toContain("ramps");

    const phone = new MemoryStore();
    const backup = await readBackup(bytes, key);
    expect(backup.createdAt).toBe(1000);
    const report = restoreBackup(phone, backup);
    expect(report.created.sort()).toEqual(["d1", "d2"]);
    expect(textOf(phone, "d1")).toBe("First thoughts on ramps");
    expect(listDrafts(phone).find((d) => d.id === "d1")?.title).toBe("Ramps");
  });

  test("restoring merges with what is here, so nothing written since the backup is lost", async () => {
    const key = await generateKey();
    const store = new MemoryStore();
    save(store, "d1", "Before the backup", 1);
    const bytes = (await makeBackup(store, key)).bytes;
    edit(store, "d1", ", and after it", 7);

    const report = restoreBackup(store, await readBackup(bytes, key));
    expect(report.unchanged).toEqual(["d1"]);
    expect(textOf(store, "d1")).toBe("Before the backup, and after it");

    // A device whose copy has gone further than the backup keeps its own writing.
    const fresh = await makeBackup(store, key);
    const other2 = new MemoryStore();
    restoreBackup(other2, await readBackup(fresh.bytes, key));
    edit(other2, "d1", " (phone)", 9);
    const merged = restoreBackup(other2, await readBackup((await makeBackup(store, key)).bytes, key));
    expect(merged.unchanged).toEqual(["d1"]);
    expect(textOf(other2, "d1")).toContain("(phone)");
  });

  test("a draft deleted since the backup comes back, because restoring is the writer's choice", async () => {
    const key = await generateKey();
    const store = new MemoryStore();
    save(store, "d1", "Deleted too soon", 1);
    const bytes = (await makeBackup(store, key)).bytes;
    deleteDraft(store, "d1", draftVersion(store, "d1"));
    expect(listDrafts(store)).toEqual([]);

    const report = restoreBackup(store, await readBackup(bytes, key));
    expect(report.created).toEqual(["d1"]);
    expect(listTombstones(store)).not.toHaveProperty("d1");
    expect(textOf(store, "d1")).toBe("Deleted too soon");
  });

  test("says plainly why a file cannot be opened", async () => {
    const key = await generateKey();
    const store = new MemoryStore();
    save(store, "d1", "words", 1);
    const { bytes } = await makeBackup(store, key);

    await expect(readBackup(bytes, await generateKey())).rejects.toMatchObject({ reason: "wrong-words" });
    await expect(readBackup(new TextEncoder().encode("hello, not a backup"), key)).rejects.toMatchObject({ reason: "not-a-backup" });
    const newer = bytes.slice();
    newer[4] = 9;
    await expect(readBackup(newer, key)).rejects.toMatchObject({ reason: "newer-format" });
    const tampered = bytes.slice();
    tampered[tampered.length - 1] ^= 1;
    await expect(readBackup(tampered, key)).rejects.toBeInstanceOf(BackupError);
  });

  test("ids that are not plain are not restored, and full storage is reported", async () => {
    const key = await generateKey();
    const backup = {
      createdAt: 1,
      drafts: [
        { id: "../evil", snapshot: new Uint8Array([1]) },
        { id: "d1", snapshot: (() => { const s = new MemoryStore(); save(s, "d1", "hello", 1); return readSnapshot(s, draftKey("d1"))!; })() },
      ],
    };
    const full = new MemoryStore();
    full.setItem = (k: string, v: string) => {
      if (k.startsWith("rampai:draft:")) throw new DOMException("full", "QuotaExceededError");
      full.m.set(k, v);
    };
    const report = restoreBackup(full, backup);
    expect(report.failed.sort()).toEqual(["../evil", "d1"]);
    expect(report.storageFull).toBe(true);
    expect(listDrafts(full)).toEqual([]);
    void key;
  });

  test("other tabs are told about each draft that changed", async () => {
    const key = await generateKey();
    const a = new MemoryStore();
    save(a, "d1", "one", 1);
    const told = vi.fn();
    restoreBackup(new MemoryStore(), await readBackup((await makeBackup(a, key)).bytes, key), told);
    expect(told).toHaveBeenCalledWith("d1", expect.any(Uint8Array));
  });

  test("file names carry the date", () => {
    expect(backupFileName(new Date(2026, 9, 28))).toBe("rampai-backup-2026-10-28.rampai");
  });

  test("the summary says what happened in one sentence", () => {
    const text = restoreSummary({ created: ["a", "b"], merged: ["c"], unchanged: [], failed: [], storageFull: false }, new Date(2026, 9, 27).getTime());
    expect(text).toMatch(/^From the backup of .*2026: 2 drafts brought back, 1 draft merged with what was here\.$/);
  });
});

describe("checking recovery words", () => {
  const words = "abandon ability able about above absent absorb".split(" ");
  const fast = { N: 2 ** 10 };

  test("the right words match the device key; other words do not", async () => {
    const key = await deriveKey(words, fast);
    expect(await wordsMatchKey(words, key, fast)).toBe(true);
    expect(await wordsMatchKey([...words.slice(0, 6), "abstract"], key, fast)).toBe(false);
  });
});

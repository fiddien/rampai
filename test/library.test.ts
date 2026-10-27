import { describe, expect, test } from "vitest";
import { createDraft, deleteDraft, draftKey, getDraft, listDrafts, updateDraft } from "../src/sync/library";
import { DEFAULT_TITLE, getTitle, setTitle } from "../src/sync/meta";
import { createDoc } from "../src/sync/model";

class MemoryStore {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

describe("library", () => {
  test("a new draft is titled 'My first bad draft'", () => {
    const store = new MemoryStore();
    const d = createDraft(store, 1);
    expect(d.title).toBe(DEFAULT_TITLE);
    expect(getDraft(store, d.id)).toMatchObject({ title: DEFAULT_TITLE, words: 0 });
  });

  test("drafts are listed most recently edited first", () => {
    const store = new MemoryStore();
    const a = createDraft(store, 1);
    const b = createDraft(store, 2);
    expect(listDrafts(store).map((d) => d.id)).toEqual([b.id, a.id]);
    updateDraft(store, a.id, { updatedAt: 3, words: 40, title: "On ramps" });
    expect(listDrafts(store).map((d) => [d.id, d.title, d.words])).toEqual([[a.id, "On ramps", 40], [b.id, DEFAULT_TITLE, 0]]);
  });

  test("deleting removes the entry and the saved document", () => {
    const store = new MemoryStore();
    const d = createDraft(store);
    store.setItem(draftKey(d.id), "snapshot");
    deleteDraft(store, d.id);
    expect(listDrafts(store)).toEqual([]);
    expect(store.getItem(draftKey(d.id))).toBeNull();
  });

  test("the draft from the first version is adopted exactly once", () => {
    const store = new MemoryStore();
    store.setItem("rampai:draft:v1", "old snapshot");
    const [adopted] = listDrafts(store);
    expect(store.getItem(draftKey(adopted.id))).toBe("old snapshot");
    expect(store.getItem("rampai:draft:v1")).toBeNull();
    expect(listDrafts(store)).toHaveLength(1);
  });

  test("a damaged index is treated as empty", () => {
    const store = new MemoryStore();
    store.setItem("rampai:index:v1", "{not json");
    expect(listDrafts(store)).toEqual([]);
  });
});

describe("title", () => {
  test("falls back to the default and syncs between replicas", () => {
    const a = createDoc(1);
    const b = createDoc(2);
    expect(getTitle(a)).toBe(DEFAULT_TITLE);
    setTitle(a, "On ramps");
    b.import(a.export({ mode: "snapshot" }));
    expect(getTitle(b)).toBe("On ramps");
    setTitle(a, "   ");
    expect(getTitle(a)).toBe(DEFAULT_TITLE);
  });
});

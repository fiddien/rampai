import { describe, expect, test } from "vitest";
import { createDraft, deleteDraft, draftKey, getDraft, listDrafts, updateDraft } from "../src/sync/library";
import { DEFAULT_TITLE, getTitle, setTitle } from "../src/sync/meta";
import { createDoc } from "../src/sync/model";
import { editedLabel } from "../src/ui/library";

class MemoryStore {
  protected m = new Map<string, string>();
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

class BrokenStore extends MemoryStore {
  getItem = (): string | null => {
    throw new Error("blocked");
  };
}

class FullStore extends MemoryStore {
  failWrites = false;
  override setItem(k: string, v: string): void {
    if (this.failWrites) throw new Error("quota");
    this.m.set(k, v);
  }
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

  test("a damaged index is treated as empty when there are no drafts", () => {
    const store = new MemoryStore();
    store.setItem("rampai:index:v1", "{not json");
    expect(listDrafts(store)).toEqual([]);
  });

  test("a damaged or missing index is rebuilt from the saved drafts, never overwriting them", () => {
    const store = new MemoryStore();
    const a = createDraft(store);
    store.setItem(draftKey(a.id), "snapshot");
    store.setItem("rampai:index:v1", "{not json");
    const b = createDraft(store);
    expect(listDrafts(store).map((d) => d.id).sort()).toEqual([a.id, b.id].sort());
    store.removeItem("rampai:index:v1");
    expect(listDrafts(store).map((d) => d.id)).toContain(a.id);
  });

  test("storage that throws on read does not break listing", () => {
    expect(listDrafts(new BrokenStore())).toEqual([]);
  });

  test("the old draft is not adopted twice, and stays if the index cannot be saved", () => {
    const full = new FullStore();
    full.setItem("rampai:draft:v1", "old");
    full.failWrites = true;
    expect(listDrafts(full)).toEqual([]);
    expect(full.getItem("rampai:draft:v1")).toBe("old");
    full.failWrites = false;
    expect(listDrafts(full)).toHaveLength(1);
    // The old key coming back (an old tab still saving) is not adopted again.
    full.setItem("rampai:draft:v1", "old again");
    expect(listDrafts(full)).toHaveLength(1);
  });

  test("updating an unknown draft changes nothing", () => {
    const store = new MemoryStore();
    const d = createDraft(store);
    updateDraft(store, "nope", { words: 9 });
    expect(listDrafts(store)).toEqual([{ ...d }]);
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

describe("small things", () => {
  test("titles are stored without spaces at the ends", () => {
    const doc = createDoc(1);
    setTitle(doc, "  On ramps  ");
    expect(getTitle(doc)).toBe("On ramps");
  });

  test("the edited label counts calendar days, not 24-hour periods", () => {
    const lateYesterday = new Date(2026, 9, 27, 23, 0).getTime();
    const earlyToday = new Date(2026, 9, 28, 8, 0).getTime();
    expect(editedLabel(lateYesterday, earlyToday)).toBe("edited yesterday");
    expect(editedLabel(earlyToday, new Date(2026, 9, 28, 22, 0).getTime())).toBe("edited today");
  });
});

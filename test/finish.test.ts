import { describe, expect, test } from "vitest";
import { canFinish, finishedAt, getProposition, isFinished, markFinished, reopen, setProposition } from "../src/sync/meta";
import { createDoc } from "../src/sync/model";
import { createDraft, partitionDrafts, updateDraft, listDrafts } from "../src/sync/library";

describe("finishing", () => {
  test("needs a proposition, some words, and the read-aloud check", () => {
    expect(canFinish("Writing clarifies thought.", 120, true)).toBe(true);
    expect(canFinish("", 120, true)).toBe(false);
    expect(canFinish("   ", 120, true)).toBe(false);
    expect(canFinish("A claim.", 0, true)).toBe(false);
    expect(canFinish("A claim.", 120, false)).toBe(false);
  });

  test("proposition and finished state sync, and reopening syncs too", () => {
    const a = createDoc(1);
    const b = createDoc(2);
    setProposition(a, "Writing clarifies thought.");
    markFinished(a, 1000);
    b.import(a.export({ mode: "snapshot" }));
    expect(getProposition(b)).toBe("Writing clarifies thought.");
    expect(finishedAt(b)).toBe(1000);

    reopen(b);
    a.import(b.export({ mode: "update", from: a.oplogVersion() }));
    expect(isFinished(a)).toBe(false);
    expect(getProposition(a)).toBe("Writing clarifies thought.");
  });

  test("finishing twice keeps the first date", () => {
    const doc = createDoc(1);
    markFinished(doc, 1);
    markFinished(doc, 2);
    expect(finishedAt(doc)).toBe(1);
  });
});

describe("library", () => {
  test("finished pieces are listed apart from drafts, and old entries count as drafts", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    const a = createDraft(store, 1);
    const b = createDraft(store, 2);
    updateDraft(store, a.id, { finished: true });
    const { inProgress, finished } = partitionDrafts(listDrafts(store));
    expect(inProgress.map((d) => d.id)).toEqual([b.id]);
    expect(finished.map((d) => d.id)).toEqual([a.id]);
  });
});

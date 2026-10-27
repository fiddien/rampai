// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { autosave, deviceStore } from "../src/sync/storage";
import { createDoc } from "../src/sync/model";

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("autosave", () => {
  test("flush saves a waiting change at once, and does nothing when nothing is waiting", () => {
    vi.useFakeTimers();
    const doc = createDoc(1);
    const saved = vi.fn();
    const saver = autosave(doc, "k", saved, 400);
    saver.flush();
    expect(saved).not.toHaveBeenCalled();
    doc.getText("t").insert(0, "hi");
    doc.commit();
    expect(localStorage.getItem("k")).toBeNull();
    saver.flush();
    expect(saved).toHaveBeenCalledOnce();
    expect(localStorage.getItem("k")).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(saved).toHaveBeenCalledOnce();
  });

  test("a save is skipped when shouldSave says the draft is gone", () => {
    vi.useFakeTimers();
    const doc = createDoc(1);
    const saver = autosave(doc, "k", () => {}, 400, () => false);
    doc.getText("t").insert(0, "hi");
    doc.commit();
    saver.flush();
    expect(localStorage.getItem("k")).toBeNull();
  });

  test("a failed save reports failure and never reports saved", () => {
    vi.useFakeTimers();
    const doc = createDoc(1);
    const saved = vi.fn();
    const failed = vi.fn();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const saver = autosave(doc, "k", saved, 400, () => true, failed);
    doc.getText("t").insert(0, "hi");
    doc.commit();
    saver.flush();
    expect(failed).toHaveBeenCalledOnce();
    expect(saved).not.toHaveBeenCalled();
    spy.mockRestore();
    doc.getText("t").insert(2, "!");
    doc.commit();
    saver.flush();
    expect(saved).toHaveBeenCalledOnce();
  });
});

describe("deviceStore", () => {
  test("keeps values in memory when localStorage refuses writes", () => {
    const store = deviceStore();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    store.setItem("a", "1");
    expect(store.getItem("a")).toBe("1");
    store.removeItem("a");
    expect(store.getItem("a")).toBeNull();
    spy.mockRestore();
  });
});


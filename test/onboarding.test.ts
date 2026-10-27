// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { pairPage, welcomePage } from "../src/ui/onboarding";
import { storagePersists } from "../src/sync/storage";
import { deriveKey } from "../src/sync/keys";
import { exportKey } from "../src/sync/crypto";
import { checkPassphrase, confirmMatches, resolveWord } from "../src/sync/passphrase";

class MemoryStore {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("a device that already has recovery words", () => {
  test("the welcome warns instead of offering new words", () => {
    const root = document.createElement("div");
    const go = vi.fn();
    welcomePage(root, new MemoryStore(), new MemoryStore(), go, "passphrase");
    expect(root.textContent).toMatch(/already has recovery words/);
    expect(root.textContent).not.toMatch(/Start my writing/);
  });

  test("replacing them needs an explicit confirmation", () => {
    const root = document.createElement("div");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    welcomePage(root, new MemoryStore(), new MemoryStore(), vi.fn(), "passphrase");
    const replace = [...root.querySelectorAll("button")].find((b) => /Replace/.test(b.textContent ?? ""))!;
    replace.click();
    expect(confirm).toHaveBeenCalledOnce();
    expect(root.textContent).not.toMatch(/Start my writing/);
    confirm.mockReturnValue(true);
    replace.click();
    expect(root.textContent).toMatch(/Start my writing/);
  });

  test("pairing again is guarded too", () => {
    const root = document.createElement("div");
    pairPage(root, new MemoryStore(), vi.fn(), "passphrase");
    expect(root.querySelector("input")).toBeNull();
    expect(root.textContent).toMatch(/cut this device off/);
  });

  test("a device without words, or with a random key, gets the ordinary welcome", () => {
    for (const existing of [undefined, "random"] as const) {
      const root = document.createElement("div");
      welcomePage(root, new MemoryStore(), new MemoryStore(), vi.fn(), existing);
      expect(root.textContent).toMatch(/Start my writing/);
    }
  });

  test("the welcome does not promise that words bring drafts back", () => {
    const root = document.createElement("div");
    welcomePage(root, new MemoryStore(), new MemoryStore(), vi.fn());
    expect(root.textContent).not.toMatch(/get your drafts back/);
    expect(root.textContent).toMatch(/keep your drafts on at least one device/);
  });
});

describe("storagePersists", () => {
  test("is false when the browser refuses to store anything", () => {
    expect(storagePersists()).toBe(true);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(storagePersists()).toBe(false);
  });
});

describe("typed words", () => {
  test("four letters are enough to know a word", () => {
    expect(resolveWord("abandon")).toBe("abandon");
    expect(resolveWord("aban")).toBe("abandon");
    expect(resolveWord("abandom")).toBe("abandon");
    expect(resolveWord("act")).toBe("act");
    expect(resolveWord("ab")).toBeUndefined();
    expect(resolveWord("zzzz")).toBeUndefined();
  });

  test("shortened or misspelt words make the same key as the full words", async () => {
    const full = "abandon ability able about above absent absorb";
    const short = "aban abil able abou abov abse abso";
    const check = checkPassphrase(short);
    expect(check.ok).toBe(true);
    expect(check.words.join(" ")).toBe(full);
    const fast = { N: 2 ** 10 };
    expect(await exportKey(await deriveKey(short, fast))).toBe(await exportKey(await deriveKey(full, fast)));
  });

  test("confirming accepts the same shortcuts", () => {
    const words = "abandon ability able about above absent absorb".split(" ");
    expect(confirmMatches(words, [0, 4], ["Aban", "abovee"])).toBe(true);
    expect(confirmMatches(words, [0, 4], ["able", "above"])).toBe(false);
  });
});

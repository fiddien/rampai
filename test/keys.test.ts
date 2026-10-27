import { describe, expect, test } from "vitest";
import { exportKey, generateKey, open, seal } from "../src/sync/crypto";
import { deriveKey, loadDeviceKey, saveDeviceKey } from "../src/sync/keys";
import { WORDLIST, WORDS, checkPassphrase, confirmMatches, confirmPositions, generatePassphrase, normalize } from "../src/sync/passphrase";

const fast = { N: 2 ** 10 };

describe("passphrase", () => {
  test("the list has 2048 distinct words", () => {
    expect(WORDLIST).toHaveLength(2048);
    expect(new Set(WORDLIST).size).toBe(2048);
  });

  test("a generated passphrase has seven listed words and differs each time", () => {
    const a = generatePassphrase();
    expect(a).toHaveLength(WORDS);
    expect(a.every((w) => WORDLIST.includes(w))).toBe(true);
    expect(generatePassphrase().join(" ")).not.toBe(a.join(" "));
  });

  test("every word is reachable, so the draw is not biased toward a part of the list", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i++) generatePassphrase(WORDS).forEach((w) => seen.add(w));
    // 10,500 fair draws leave about 12 of the 2,048 words unseen; a biased draw would miss far more.
    expect(seen.size).toBeGreaterThan(1950);
  });

  test("typed words are normalised: case, spacing and separators", () => {
    expect(normalize("  Apple,  BANANA-cherry\ndate ")).toEqual(["apple", "banana", "cherry", "date"]);
  });

  test("checking says how many words are wrong or missing, and which are not on the list", () => {
    const good = generatePassphrase().join(" ");
    expect(checkPassphrase(good).ok).toBe(true);
    expect(checkPassphrase(good.toUpperCase()).ok).toBe(true);
    expect(checkPassphrase("abandon ability").problem).toMatch(/7 words long; you have entered 2/);
    const typo = checkPassphrase(good.replace(/\S+$/, "notaword"));
    expect(typo.ok).toBe(false);
    expect(typo.unknown).toEqual(["notaword"]);
  });

  test("confirmation asks for three distinct positions and accepts only the right words", () => {
    const words = generatePassphrase();
    const positions = confirmPositions();
    expect(new Set(positions).size).toBe(3);
    expect(positions.every((p) => p >= 0 && p < WORDS)).toBe(true);
    expect(confirmMatches(words, positions, positions.map((p) => words[p].toUpperCase()))).toBe(true);
    expect(confirmMatches(words, positions, positions.map(() => "wrong"))).toBe(false);
    expect(confirmMatches(words, positions, positions.map((p) => words[p] + " extra"))).toBe(false);
  });
});

describe("key from passphrase", () => {
  test("the same words give the same key however they are typed, and other words give another", async () => {
    const words = ["abandon", "ability", "able", "about", "above", "absent", "absorb"];
    const a = await exportKey(await deriveKey(words, fast));
    const b = await exportKey(await deriveKey(" ABANDON  ability, able about above absent-absorb ", fast));
    const c = await exportKey(await deriveKey([...words.slice(0, 6), "abstract"], fast));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  test("two devices that derive the same key can read each other's messages", async () => {
    const words = generatePassphrase();
    const laptop = await deriveKey(words, fast);
    const phone = await deriveKey(words.join(" "), fast);
    const plain = new TextEncoder().encode("a draft update");
    expect(new TextDecoder().decode(await open(phone, await seal(laptop, plain)))).toBe("a draft update");
    const stranger = await deriveKey(generatePassphrase(), fast);
    await expect(open(stranger, await seal(laptop, plain))).rejects.toThrow();
  });

  test("the key is stored with how it was made, and survives a reload", async () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    expect(await loadDeviceKey(store)).toBeUndefined();
    const key = await deriveKey(generatePassphrase(), fast);
    await saveDeviceKey(store, key, "passphrase");
    const loaded = await loadDeviceKey(store);
    expect(loaded?.source).toBe("passphrase");
    expect(await exportKey(loaded!.key)).toBe(await exportKey(key));
    await saveDeviceKey(store, await generateKey(), "random");
    expect((await loadDeviceKey(store))?.source).toBe("random");
  });
});

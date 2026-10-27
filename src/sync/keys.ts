import { scryptAsync } from "@noble/hashes/scrypt.js";
import { exportKey, importKey } from "./crypto";
import { normalize, resolveWord } from "./passphrase";

/**
 * The key for a writer's devices comes from their passphrase with scrypt, a
 * memory-hard function, so each guess costs real memory as well as time. The
 * salt is fixed because a new device has only the passphrase to start from; the
 * passphrase itself is random and long, so a shared salt gives an attacker
 * nothing to precompute against that they would not already need to search.
 */
const SALT = new TextEncoder().encode("rampai/v1/device-key");
export const SCRYPT = { N: 2 ** 16, r: 8, p: 1, dkLen: 32 } as const;

export async function deriveKey(words: string[] | string, params: { N: number } = SCRYPT): Promise<CryptoKey> {
  const list = typeof words === "string" ? normalize(words) : words;
  const phrase = list.map((w) => resolveWord(w) ?? w).join(" ");
  const raw = await scryptAsync(new TextEncoder().encode(phrase), SALT, { ...SCRYPT, ...params });
  return crypto.subtle.importKey("raw", raw.slice(), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY_KEY = "rampai:key:v1";
/** "passphrase" once the writer has recovery words; "random" for a key made without them. */
const SOURCE_KEY = "rampai:key-source:v1";

export type KeySource = "passphrase" | "random";

export async function loadDeviceKey(store: Store): Promise<{ key: CryptoKey; source: KeySource } | undefined> {
  try {
    const stored = store.getItem(KEY_KEY);
    if (!stored) return undefined;
    return { key: await importKey(stored), source: store.getItem(SOURCE_KEY) === "passphrase" ? "passphrase" : "random" };
  } catch {
    return undefined;
  }
}

export async function saveDeviceKey(store: Store, key: CryptoKey, source: KeySource): Promise<void> {
  store.setItem(KEY_KEY, await exportKey(key));
  store.setItem(SOURCE_KEY, source);
}

/**
 * Whether typed words make this device's key. The words themselves are never
 * stored, so this is how a writer checks that what they wrote down is right.
 */
export async function wordsMatchKey(words: string[], key: CryptoKey, params: { N: number } = SCRYPT): Promise<boolean> {
  const [a, b] = await Promise.all([exportKey(await deriveKey(words, params)), exportKey(key)]);
  return a === b;
}

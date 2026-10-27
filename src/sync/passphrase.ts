import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * A writer's devices share one key, and that key comes from a passphrase of
 * seven words chosen at random from a list of 2048 (the BIP-39 English list:
 * short, common, and with no two words alike in their first four letters).
 * Seven words carry 77 bits, which is why a memory-hard function over them is
 * enough to make guessing impractical.
 */
export const WORDS = 7;
export const WORDLIST: readonly string[] = wordlist;

/** Random words, drawn without bias: 2048 divides 65536, so masking keeps every word equally likely. */
export function generatePassphrase(count = WORDS): string[] {
  const draws = crypto.getRandomValues(new Uint16Array(count));
  return Array.from(draws, (n) => WORDLIST[n & 0x7ff]);
}

/** BIP-39 words are unique in their first four letters, so those letters are enough to know the word. */
const BY_PREFIX = new Map(WORDLIST.map((w) => [w.slice(0, 4), w]));

/**
 * The listed word a typed word stands for: the word itself, or, for four
 * letters or more, the one listed word that starts with the same four letters.
 * This forgives typos and shortcuts after the fourth letter. Undefined if none.
 */
export function resolveWord(typed: string): string | undefined {
  if (WORDLIST.includes(typed)) return typed;
  return typed.length >= 4 ? BY_PREFIX.get(typed.slice(0, 4)) : undefined;
}

/** Lowercase, trim, and treat any run of spaces, commas or dashes as one separator. */
export function normalize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s,.\-_]+/)
    .filter(Boolean);
}

export interface PassphraseCheck {
  ok: boolean;
  words: string[];
  /** Words that are not on the list, most likely typos. */
  unknown: string[];
  problem?: string;
}

/** Say what is wrong with typed-in words, in a way that helps fix them. */
export function checkPassphrase(input: string): PassphraseCheck {
  const typed = normalize(input);
  const unknown = typed.filter((w) => !resolveWord(w));
  if (typed.length !== WORDS) {
    return { ok: false, words: typed, unknown, problem: `Your recovery words are ${WORDS} words long; you have entered ${typed.length}.` };
  }
  if (unknown.length > 0) {
    return { ok: false, words: typed, unknown, problem: `Not on the list: ${unknown.join(", ")}. Check the spelling.` };
  }
  // The key is always made from the listed words, however they were typed.
  return { ok: true, words: typed.map((w) => resolveWord(w)!), unknown };
}

/** Which positions (0-based, ascending) to ask the writer to retype, to show the words were written down. */
export function confirmPositions(count = 3, total = WORDS): number[] {
  const picked = new Set<number>();
  while (picked.size < Math.min(count, total)) picked.add(crypto.getRandomValues(new Uint8Array(1))[0] % total);
  return [...picked].sort((a, b) => a - b);
}

export function confirmMatches(words: string[], positions: number[], answers: string[]): boolean {
  return (
    positions.length === answers.length &&
    positions.every((p, i) => {
      const typed = normalize(answers[i]);
      return typed.length === 1 && resolveWord(typed[0]) === words[p];
    })
  );
}

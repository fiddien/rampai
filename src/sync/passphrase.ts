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
  const words = normalize(input);
  const unknown = words.filter((w) => !WORDLIST.includes(w));
  if (words.length !== WORDS) {
    return { ok: false, words, unknown, problem: `Your recovery words are ${WORDS} words long; you have entered ${words.length}.` };
  }
  if (unknown.length > 0) {
    return { ok: false, words, unknown, problem: `Not on the list: ${unknown.join(", ")}. Check the spelling.` };
  }
  return { ok: true, words, unknown };
}

/** Which positions (0-based, ascending) to ask the writer to retype, to show the words were written down. */
export function confirmPositions(count = 3, total = WORDS): number[] {
  const picked = new Set<number>();
  while (picked.size < Math.min(count, total)) picked.add(crypto.getRandomValues(new Uint8Array(1))[0] % total);
  return [...picked].sort((a, b) => a - b);
}

export function confirmMatches(words: string[], positions: number[], answers: string[]): boolean {
  return positions.length === answers.length && positions.every((p, i) => words[p] === normalize(answers[i])[0] && normalize(answers[i]).length === 1);
}

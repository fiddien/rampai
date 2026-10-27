import { DEFAULT_TITLE } from "./meta";

/**
 * The library is a small index of the drafts saved on this device: just enough
 * to draw the home screen without opening every draft. The truth (title, text)
 * lives in each draft's own document; the index is a cache of it.
 */
export interface DraftEntry {
  id: string;
  title: string;
  words: number;
  updatedAt: number;
  /** Missing in entries saved before finishing existed, which means not finished. */
  finished?: boolean;
}

export type Store = Pick<Storage, "getItem" | "setItem" | "removeItem"> & Partial<Pick<Storage, "length" | "key">>;

const INDEX_KEY = "rampai:index:v1";
/** Where the first tracer bullet kept its single draft. */
const LEGACY_KEY = "rampai:draft:v1";
/** Set once the old draft has been adopted, so it is never adopted twice. */
const ADOPTED_KEY = "rampai:legacy-adopted:v1";
const DRAFT_PREFIX = "rampai:draft:";

export const draftKey = (id: string) => `rampai:draft:${id}`;

function get(store: Store, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The index is only a cache of the drafts. When it is missing or damaged it is
 * rebuilt from the saved documents, so a bad index never hides a draft.
 */
function rebuild(store: Store, now: number): DraftEntry[] {
  const found: DraftEntry[] = [];
  try {
    for (let i = 0; i < (store.length ?? 0); i++) {
      const key = store.key?.(i) ?? "";
      const id = key.startsWith(DRAFT_PREFIX) ? key.slice(DRAFT_PREFIX.length) : "";
      if (id && key !== LEGACY_KEY) found.push({ id, title: "Recovered draft", words: 0, updatedAt: now });
    }
  } catch {
    return [];
  }
  if (found.length > 0) write(store, found);
  return found;
}

function read(store: Store, now = Date.now()): DraftEntry[] {
  const raw = get(store, INDEX_KEY);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Damaged: fall through and rebuild.
    }
  }
  return rebuild(store, now);
}

function write(store: Store, entries: DraftEntry[]) {
  try {
    store.setItem(INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Storage can be full or blocked; the home screen just stays as it was.
  }
}

const newId = () => crypto.randomUUID();

/** Drafts, most recently edited first. A draft from the first version is adopted once. */
export function listDrafts(store: Store, now = Date.now()): DraftEntry[] {
  let entries = read(store, now);
  const legacy = get(store, LEGACY_KEY);
  if (legacy && !get(store, ADOPTED_KEY)) {
    const id = newId();
    try {
      // The old draft is removed only after the index that lists its copy is saved.
      store.setItem(draftKey(id), legacy);
      const next = [...entries, { id, title: DEFAULT_TITLE, words: 0, updatedAt: now }];
      store.setItem(INDEX_KEY, JSON.stringify(next));
      store.setItem(ADOPTED_KEY, id);
      store.removeItem(LEGACY_KEY);
      entries = next;
    } catch {
      // Leave the old draft where it is, and try again next time.
      try {
        store.removeItem(draftKey(id));
      } catch {
        // Nothing more to do.
      }
    }
  }
  return [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDraft(store: Store, id: string): DraftEntry | undefined {
  return listDrafts(store).find((d) => d.id === id);
}

/** A new draft starts with the default title, which is permission to write badly. */
export function createDraft(store: Store, now = Date.now()): DraftEntry {
  const entry: DraftEntry = { id: newId(), title: DEFAULT_TITLE, words: 0, updatedAt: now };
  write(store, [...listDrafts(store, now), entry]);
  return entry;
}

/** List a draft that arrived from another device under the id it already has. */
export function adoptDraft(store: Store, entry: DraftEntry): void {
  const entries = listDrafts(store);
  if (entries.some((d) => d.id === entry.id)) return;
  write(store, [...entries, entry]);
}

export function updateDraft(store: Store, id: string, patch: Partial<Omit<DraftEntry, "id">>): void {
  const entries = listDrafts(store);
  const i = entries.findIndex((d) => d.id === id);
  if (i < 0) return;
  entries[i] = { ...entries[i], ...patch };
  write(store, entries);
}

export function deleteDraft(store: Store, id: string): void {
  write(store, listDrafts(store).filter((d) => d.id !== id));
  try {
    store.removeItem(draftKey(id));
  } catch {
    // The index no longer lists it; the stray document is harmless.
  }
}

/** The home screen shows pieces still being written apart from finished ones. */
export function partitionDrafts(entries: DraftEntry[]): { inProgress: DraftEntry[]; finished: DraftEntry[] } {
  return { inProgress: entries.filter((d) => !d.finished), finished: entries.filter((d) => d.finished) };
}

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
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const INDEX_KEY = "rampai:index:v1";
/** Where the first tracer bullet kept its single draft. */
const LEGACY_KEY = "rampai:draft:v1";

export const draftKey = (id: string) => `rampai:draft:${id}`;

function read(store: Store): DraftEntry[] {
  try {
    const parsed = JSON.parse(store.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
  let entries = read(store);
  const legacy = store.getItem(LEGACY_KEY);
  if (legacy) {
    const id = newId();
    try {
      store.setItem(draftKey(id), legacy);
      store.removeItem(LEGACY_KEY);
      entries = [...entries, { id, title: DEFAULT_TITLE, words: 0, updatedAt: now }];
      write(store, entries);
    } catch {
      // Leave the old draft where it is rather than risk losing it.
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

export function updateDraft(store: Store, id: string, patch: Partial<Omit<DraftEntry, "id">>): void {
  const entries = listDrafts(store);
  const i = entries.findIndex((d) => d.id === id);
  if (i < 0) return;
  entries[i] = { ...entries[i], ...patch };
  write(store, entries);
}

export function deleteDraft(store: Store, id: string): void {
  write(store, listDrafts(store).filter((d) => d.id !== id));
  store.removeItem(draftKey(id));
}

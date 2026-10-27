import { VersionVector } from "loro-crdt";
import { adoptDraft, draftKey, listDrafts, listTombstones, removeTombstone, updateDraft, type Store } from "./library";
import { createDoc, wordsOf } from "./model";
import { getTitle, isFinished } from "./meta";
import { fromBase64, readSnapshot, writeSnapshot } from "./storage";
import type { LoroDoc } from "loro-crdt";

/**
 * Bringing a draft's changes into this device's library, from another device
 * or from a backup. Both go through here, so they follow the same rules.
 */
export type MergeResult = "created" | "merged" | "unchanged" | "pending" | "kept-deleted" | "storage-full" | "invalid";

/** True when `mine` holds nothing beyond `theirs`: equal, or strictly behind. */
export const coveredBy = (mine: VersionVector, theirs: VersionVector) => {
  const c = mine.compare(theirs);
  return c === 0 || c === -1;
};

export function decodeVersion(base64: string | undefined): VersionVector | undefined {
  if (!base64) return undefined;
  try {
    return VersionVector.decode(fromBase64(base64));
  } catch {
    return undefined;
  }
}

/** A saved draft as a Loro document, or undefined if there is none or it is damaged. */
export function loadDraft(store: Store, id: string): LoroDoc | undefined {
  const bytes = readSnapshot(store, draftKey(id));
  if (!bytes) return undefined;
  const doc = createDoc();
  try {
    doc.import(bytes);
  } catch {
    return undefined;
  }
  return doc;
}

/**
 * Merge `update` (a Loro update or snapshot) into draft `id`.
 *
 * - Nothing new: the saved draft and its "edited" time are left alone.
 * - "pending": the update depends on changes this device has not seen, so
 *   nothing could be applied yet; the caller asks for what is missing.
 * - Deleted here: it stays deleted unless the update holds writing this device
 *   never saw, or `restore` is set (the writer chose to bring it back).
 * - The draft is saved before it is listed, so the home screen never lists a
 *   draft whose words are not on this device.
 */
export function mergeDraft(store: Store, id: string, update: Uint8Array, opts: { restore?: boolean; now?: number } = {}): MergeResult {
  const existing = loadDraft(store, id);
  const doc = existing ?? createDoc();
  const before = existing?.oplogVersion();
  let pending = false;
  try {
    pending = !!doc.import(update).pending;
  } catch {
    return "invalid";
  }
  const after = doc.oplogVersion();
  if (before ? coveredBy(after, before) : after.length() === 0) return pending ? "pending" : "unchanged";

  const tombstone = listTombstones(store)[id];
  if (!existing && tombstone && !opts.restore) {
    const deletedAt = decodeVersion(tombstone.version);
    if (deletedAt && coveredBy(doc.oplogVersion(), deletedAt)) return "kept-deleted";
  }

  try {
    writeSnapshot(store, draftKey(id), doc.export({ mode: "snapshot" }));
  } catch {
    return "storage-full";
  }
  if (tombstone) removeTombstone(store, id);

  const summary = { title: getTitle(doc), words: wordsOf(doc), finished: isFinished(doc), updatedAt: opts.now ?? Date.now() };
  const listedBefore = !!existing && listDrafts(store).some((d) => d.id === id);
  // With no index, listing rebuilds one from the saved drafts, which may already list
  // this one by a placeholder title; updating afterwards gives it the real one either way.
  if (listDrafts(store).some((d) => d.id === id)) updateDraft(store, id, summary);
  else adoptDraft(store, { id, ...summary });
  return listedBefore ? "merged" : "created";
}

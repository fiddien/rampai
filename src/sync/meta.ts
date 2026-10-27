import type { LoroDoc } from "loro-crdt";

/**
 * Facts about a draft that are not part of its text live in one Loro map, so
 * they sync like everything else:
 *
 *   meta: Map{ title?: string }
 */
export const DEFAULT_TITLE = "My first bad draft";

export function getTitle(doc: LoroDoc): string {
  const title = doc.getMap("meta").get("title");
  return typeof title === "string" && title.trim() ? title : DEFAULT_TITLE;
}

/** A blank title falls back to the default, so a draft is never nameless. */
export function setTitle(doc: LoroDoc, title: string): void {
  const meta = doc.getMap("meta");
  const next = title.trim() ? title : DEFAULT_TITLE;
  if (meta.get("title") === next) return;
  meta.set("title", next);
  doc.commit({ origin: "local" });
}

/**
 * Finishing: a piece is complete when its writer can point to its main
 * proposition and has read it aloud. Both are the writer's word; the app only
 * asks, and keeps the answer.
 *
 *   meta: Map{ proposition?: string, finishedAt?: number }
 */
export function getProposition(doc: LoroDoc): string {
  const p = doc.getMap("meta").get("proposition");
  return typeof p === "string" ? p : "";
}

export function setProposition(doc: LoroDoc, proposition: string): void {
  const meta = doc.getMap("meta");
  if (getProposition(doc) === proposition) return;
  meta.set("proposition", proposition);
  doc.commit({ origin: "local" });
}

/** When the piece was marked finished, or undefined while it is still a draft. */
export function finishedAt(doc: LoroDoc): number | undefined {
  const t = doc.getMap("meta").get("finishedAt");
  return typeof t === "number" ? t : undefined;
}

export const isFinished = (doc: LoroDoc) => finishedAt(doc) !== undefined;

/** Everything the writer must have done before a piece can be called finished. */
export function canFinish(proposition: string, words: number, readAloud: boolean): boolean {
  return proposition.trim().length > 0 && words > 0 && readAloud;
}

export function markFinished(doc: LoroDoc, now = Date.now()): void {
  if (isFinished(doc)) return;
  doc.getMap("meta").set("finishedAt", now);
  doc.commit({ origin: "local" });
}

export function reopen(doc: LoroDoc): void {
  if (!isFinished(doc)) return;
  doc.getMap("meta").delete("finishedAt");
  doc.commit({ origin: "local" });
}

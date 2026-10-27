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

/** A blank title falls back to the default, so a draft is never nameless. Spaces at the ends are dropped. */
export function setTitle(doc: LoroDoc, title: string): void {
  const meta = doc.getMap("meta");
  const next = title.trim() || DEFAULT_TITLE;
  if (meta.get("title") === next) return;
  meta.set("title", next);
  doc.commit({ origin: "local" });
}

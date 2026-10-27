import type { EditorState } from "prosemirror-state";
import { countWords } from "../editor/words";

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = mac ? "⌘" : "Ctrl";
export const ALT = mac ? "⌥" : "Alt";

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function wordCount(state: EditorState): number {
  return countWords(state.doc.textBetween(0, state.doc.content.size, " ", " "));
}

/** Calendar days in the writer's own time zone, so 23:00 yesterday reads as "yesterday". */
export function editedLabel(updatedAt: number, now = Date.now()): string {
  const midnight = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((midnight(now) - midnight(updatedAt)) / 86_400_000);
  if (days < 1) return "edited today";
  if (days === 1) return "edited yesterday";
  return `edited ${new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

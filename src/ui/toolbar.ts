import type { EditorView } from "prosemirror-view";
import type { EditorState, Command } from "prosemirror-state";
import { toggleMark } from "prosemirror-commands";
import { schema } from "../editor/schema";
import { moveBlock, toggleBlock } from "../editor/commands";
import { countWords } from "../editor/words";

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = mac ? "⌘" : "Ctrl";
export const ALT = mac ? "⌥" : "Alt";

interface Tool {
  label: string;
  title: string;
  className?: string;
  command: Command;
  active?: (state: EditorState) => boolean;
}

function markActive(name: "strong" | "em") {
  return (state: EditorState) => {
    const type = schema.marks[name];
    const { from, to, empty, $from } = state.selection;
    if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
    return state.doc.rangeHasMark(from, to, type);
  };
}

function blockActive(name: string) {
  return (state: EditorState) => state.selection.$head.parent.type.name === name;
}

const FORMAT: Tool[] = [
  { label: "B", title: `Bold (${MOD}+B)`, className: "b", command: toggleMark(schema.marks.strong), active: markActive("strong") },
  { label: "I", title: `Italic (${MOD}+I)`, className: "i", command: toggleMark(schema.marks.em), active: markActive("em") },
];
const BLOCKS: Tool[] = [
  { label: "H1", title: `Heading (${MOD}+${ALT}+1, or type # and a space)`, command: toggleBlock("heading1"), active: blockActive("heading1") },
  { label: "H2", title: `Subheading (${MOD}+${ALT}+2, or type ## and a space)`, command: toggleBlock("heading2"), active: blockActive("heading2") },
  { label: "Quote", title: `Quote (${MOD}+Shift+Q, or type > and a space)`, command: toggleBlock("quote"), active: blockActive("quote") },
  { label: "List", title: `List (${MOD}+Shift+L, or type - and a space)`, command: toggleBlock("list_item"), active: blockActive("list_item") },
];
const MOVE: Tool[] = [
  { label: "↑", title: `Move this block up (${ALT}+↑)`, command: moveBlock(-1) },
  { label: "↓", title: `Move this block down (${ALT}+↓)`, command: moveBlock(1) },
];

export interface Toolbar {
  element: HTMLElement;
  update(state: EditorState): void;
}

/** Formatting buttons for one editor. `compact` keeps only bold, italic, and moves. */
export function buildToolbar(getView: () => EditorView, compact = false): Toolbar {
  const element = document.createElement("div");
  element.className = "tools";
  const groups = compact ? [FORMAT, MOVE] : [FORMAT, BLOCKS, MOVE];
  const buttons: { tool: Tool; el: HTMLButtonElement }[] = [];

  groups.forEach((group, g) => {
    if (g > 0 && !compact) {
      const sep = document.createElement("span");
      sep.className = "sep";
      element.append(sep);
    }
    for (const tool of group) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `tool ${tool.className ?? ""}`;
      el.textContent = tool.label;
      el.title = tool.title;
      el.setAttribute("aria-label", tool.title);
      if (tool.active) el.setAttribute("aria-pressed", "false");
      // Keep focus in the editor so the caret stays where it was.
      el.addEventListener("mousedown", (e) => e.preventDefault());
      el.addEventListener("click", () => {
        const view = getView();
        tool.command(view.state, view.dispatch, view);
        view.focus();
      });
      buttons.push({ tool, el });
      element.append(el);
    }
  });

  return {
    element,
    update(state) {
      for (const { tool, el } of buttons) {
        if (tool.active) el.setAttribute("aria-pressed", String(tool.active(state)));
        el.disabled = !getView().editable || !tool.command(state);
      }
    },
  };
}

export function wordCount(state: EditorState): number {
  const text = state.doc.textBetween(0, state.doc.content.size, " ", " ");
  return countWords(text);
}

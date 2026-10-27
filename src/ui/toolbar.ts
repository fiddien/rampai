import type { EditorView } from "prosemirror-view";
import type { EditorState, Command } from "prosemirror-state";
import { toggleMark, setBlockType } from "prosemirror-commands";
import { schema } from "../editor/schema";
import { moveBlock } from "../editor/commands";
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

const FORMAT: Tool[] = [
  { label: "B", title: `Bold (${MOD}+B)`, className: "b", command: toggleMark(schema.marks.strong), active: markActive("strong") },
  { label: "I", title: `Italic (${MOD}+I)`, className: "i", command: toggleMark(schema.marks.em), active: markActive("em") },
];
const MOVE: Tool[] = [
  { label: "↑", title: `Move this block up (${ALT}+↑)`, command: moveBlock(-1) },
  { label: "↓", title: `Move this block down (${ALT}+↓)`, command: moveBlock(1) },
];

export interface Toolbar {
  element: HTMLElement;
  update(state: EditorState): void;
}

const BLOCK_MENU: { type: string; label: string }[] = [
  { type: "paragraph", label: "Text" },
  { type: "heading1", label: "Heading" },
  { type: "heading2", label: "Subheading" },
  { type: "quote", label: "Quote" },
  { type: "list_item", label: "List" },
];

/**
 * Formatting for one editor. The writing page shows bold, italic and one menu
 * for the kind of block; `compact` (the two-device demo) shows bold, italic and
 * the block moves instead.
 */
export function buildToolbar(getView: () => EditorView, compact = false): Toolbar {
  const element = document.createElement("div");
  element.className = "tools";
  const groups = compact ? [FORMAT, MOVE] : [FORMAT];
  const buttons: { tool: Tool; el: HTMLButtonElement }[] = [];

  groups.forEach((group) => {
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

  // One menu for the kind of block, instead of a button for each.
  let menu: HTMLSelectElement | undefined;
  if (!compact) {
    menu = document.createElement("select");
    menu.className = "block-type";
    menu.title = "Kind of block";
    menu.setAttribute("aria-label", "Kind of block");
    for (const { type, label } of BLOCK_MENU) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = label;
      menu.append(option);
    }
    menu.addEventListener("change", () => {
      const view = getView();
      setBlockType(schema.nodes[menu!.value])(view.state, view.dispatch, view);
      view.focus();
    });
    element.append(menu);
  }

  return {
    element,
    update(state) {
      if (menu) {
        const current = state.selection.$head.parent.type.name;
        menu.value = BLOCK_MENU.some((o) => o.type === current) ? current : "paragraph";
        menu.disabled = !getView().editable;
      }
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

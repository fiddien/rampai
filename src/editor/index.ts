import { EditorState, type Command } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import { baseKeymap, chainCommands, splitBlock, toggleMark, setBlockType } from "prosemirror-commands";
import { undoInputRule } from "prosemirror-inputrules";
import { schema } from "./schema";
import { blockIdsPlugin, newBlockId } from "./blockIds";
import { typedOnlyPlugin } from "./typedOnly";
import { rampaiInputRules } from "./inputRules";
import { viewHintsPlugin } from "./view";
import { dragHandlesPlugin } from "./drag";
import { listEnter, moveBlock, resetBlockAtStart, toggleBlock } from "./commands";

export { schema } from "./schema";
export { moveBlock, toggleBlock } from "./commands";

const insertHardBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
  return true;
};

/**
 * Shortcuts follow Microsoft Word where Word has one, so writers don't have to
 * learn new keys: Ctrl+B/I, Ctrl+Alt+1/2 for headings, Ctrl+Shift+N for normal
 * text, Ctrl+Shift+L for a list. Alt+Up/Down moves the current block.
 */
export const rampaiKeys: Record<string, Command> = {
  Enter: chainCommands(listEnter, splitBlock),
  "Shift-Enter": insertHardBreak,
  Backspace: chainCommands(undoInputRule, resetBlockAtStart),
  "Mod-b": toggleMark(schema.marks.strong),
  "Mod-i": toggleMark(schema.marks.em),
  "Mod-Alt-1": toggleBlock("heading1"),
  "Mod-Alt-2": toggleBlock("heading2"),
  "Mod-Shift-n": setBlockType(schema.nodes.paragraph),
  "Mod-Shift-l": toggleBlock("list_item"),
  "Mod-Shift-q": toggleBlock("quote"),
  "Alt-ArrowUp": moveBlock(-1),
  "Alt-ArrowDown": moveBlock(1),
  "Mod-z": undo,
  "Mod-y": redo,
  "Shift-Mod-z": redo,
};

export interface EditorOptions {
  /** Called whenever a paste or drop from outside is refused. */
  onBlockedPaste?: () => void;
}

export function emptyDoc(): Node {
  return schema.node("doc", null, [schema.node("paragraph", { id: newBlockId() })]);
}

export function createEditorState(doc: Node = emptyDoc(), options: EditorOptions = {}): EditorState {
  return EditorState.create({
    doc,
    plugins: [
      rampaiInputRules(),
      keymap(rampaiKeys),
      keymap(baseKeymap),
      history(),
      blockIdsPlugin(),
      typedOnlyPlugin(options.onBlockedPaste),
      viewHintsPlugin(),
      dragHandlesPlugin(),
    ],
  });
}

import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { setBlockType } from "prosemirror-commands";
import { schema, type BlockType } from "./schema";

/** Index of the top-level block that holds the selection head. */
export function currentBlockIndex(state: Parameters<Command>[0]): number {
  return state.selection.$head.index(0);
}

/** Move the current block up (-1) or down (+1), keeping the cursor inside it. */
export function moveBlock(dir: -1 | 1): Command {
  return (state, dispatch) => {
    const index = currentBlockIndex(state);
    const target = index + dir;
    if (target < 0 || target >= state.doc.childCount) return false;
    if (!dispatch) return true;

    const node = state.doc.child(index);
    let start = 0;
    for (let i = 0; i < index; i++) start += state.doc.child(i).nodeSize;
    const offsetInBlock = state.selection.head - start;

    let tr = state.tr.delete(start, start + node.nodeSize);
    let insertAt = 0;
    for (let i = 0; i < target; i++) insertAt += tr.doc.child(i).nodeSize;
    tr = tr.insert(insertAt, node);
    const head = Math.min(insertAt + offsetInBlock, insertAt + node.nodeSize - 1);
    tr = tr.setSelection(TextSelection.create(tr.doc, head));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Turn the current block into the given type, or back into a paragraph if it already is that type. */
export function toggleBlock(type: BlockType): Command {
  return (state, dispatch) => {
    const current = state.selection.$head.parent.type.name;
    const nodeType = schema.nodes[current === type ? "paragraph" : type];
    return setBlockType(nodeType)(state, dispatch);
  };
}

/** Backspace at the very start of a formatted block turns it back into a paragraph. */
export const resetBlockAtStart: Command = (state, dispatch) => {
  const { $head, empty } = state.selection;
  if (!empty || $head.parentOffset !== 0) return false;
  if ($head.parent.type === schema.nodes.paragraph) return false;
  return setBlockType(schema.nodes.paragraph)(state, dispatch);
};

/** Enter in a list item continues the list; Enter in an empty list item ends it. */
export const listEnter: Command = (state, dispatch) => {
  const { $head, empty } = state.selection;
  if (!empty || $head.parent.type !== schema.nodes.list_item) return false;
  if ($head.parent.content.size === 0) {
    return setBlockType(schema.nodes.paragraph)(state, dispatch);
  }
  if (!dispatch) return true;
  const tr = state.tr.split($head.pos, 1, [{ type: schema.nodes.list_item, attrs: { id: null } }]);
  dispatch(tr.scrollIntoView());
  return true;
};

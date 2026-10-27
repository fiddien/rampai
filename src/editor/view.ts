import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";

/** Marks the block holding the caret, and the editor itself when the draft is empty. */
export function viewHintsPlugin(): Plugin {
  return new Plugin({
    props: {
      attributes: (state) => {
        const only = state.doc.childCount === 1 ? state.doc.firstChild : null;
        return { class: only && only.content.size === 0 ? "empty" : "" };
      },
      decorations: (state) => {
        const index = state.selection.$head.index(0);
        let pos = 0;
        for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
        const node = state.doc.maybeChild(index);
        if (!node) return null;
        return DecorationSet.create(state.doc, [Decoration.node(pos, pos + node.nodeSize, { class: "current" })]);
      },
    },
  });
}

import type { LoroDoc } from "loro-crdt";
import type { EditorView } from "prosemirror-view";
import { TextSelection, type Transaction } from "prosemirror-state";
import { readDocFromLoro, writeDocToLoro, blocksOf } from "./model";

export const REMOTE = "rampai-remote";

/**
 * Keeps one ProseMirror editor and one Loro document in step.
 *
 * Local edits are written into Loro after every transaction. Remote updates
 * are imported into Loro, and the editor is rebuilt from it, with the cursor
 * kept in the same block at the same offset.
 */
export class DocBinding {
  constructor(
    readonly doc: LoroDoc,
    readonly view: EditorView,
  ) {
    if (blocksOf(doc).length === 0) {
      writeDocToLoro(view.state.doc, doc);
      doc.commit({ origin: "local" });
    } else {
      this.refreshFromLoro();
    }
  }

  /** Use as the editor's `dispatchTransaction`. */
  dispatch(tr: Transaction): void {
    // A read-only draft (a finished piece) refuses every local edit, whichever
    // button or shortcut it came from; only updates from other devices apply.
    if (!this.view.editable && tr.docChanged && !tr.getMeta(REMOTE)) return;
    const { state, transactions } = this.view.state.applyTransaction(tr);
    this.view.updateState(state);
    if (tr.getMeta(REMOTE)) return;
    if (transactions.some((t) => t.docChanged)) {
      writeDocToLoro(state.doc, this.doc);
      this.doc.commit({ origin: "local" });
    }
  }

  /** Apply an update received from another device. */
  receive(update: Uint8Array): void {
    this.doc.import(update);
    this.refreshFromLoro();
  }

  refreshFromLoro(): void {
    const next = readDocFromLoro(this.doc);
    const state = this.view.state;
    if (next.eq(state.doc)) return;

    const $head = state.selection.$head;
    const blockId = $head.depth > 0 ? ($head.node(1).attrs.id as string) : null;
    const offset = $head.depth > 0 ? $head.parentOffset : 0;

    // Replace only the changed stretch, so undo history and the selection
    // outside it survive a remote edit.
    let tr = state.tr;
    const start = next.content.findDiffStart(state.doc.content);
    const end = next.content.findDiffEnd(state.doc.content);
    if (start != null && end) {
      let endOld = end.b;
      let endNew = end.a;
      const overlap = start - Math.min(endOld, endNew);
      if (overlap > 0) {
        endOld += overlap;
        endNew += overlap;
      }
      tr = tr.replace(start, endOld, next.slice(start, endNew));
    }
    // The mapped selection is right unless the cursor's block was replaced
    // wholesale (a move from elsewhere); then find the block by its id.
    const $mapped = tr.selection.$head;
    let restored = $mapped.depth > 0 && $mapped.node(1).attrs.id === blockId;
    let pos = 0;
    tr.doc.forEach((node) => {
      if (!restored && node.attrs.id === blockId) {
        const head = pos + 1 + Math.min(offset, node.content.size);
        tr = tr.setSelection(TextSelection.create(tr.doc, head));
        restored = true;
      }
      pos += node.nodeSize;
    });
    tr.setMeta(REMOTE, true).setMeta("addToHistory", false);
    this.dispatch(tr);
  }
}

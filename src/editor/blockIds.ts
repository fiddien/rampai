import { Plugin } from "prosemirror-state";

export function newBlockId(): string {
  return crypto.randomUUID();
}

/**
 * Gives every top-level block a unique id. Splitting a block copies its
 * attributes, so the second half would otherwise share the first half's id.
 */
export function blockIdsPlugin(): Plugin {
  return new Plugin({
    appendTransaction(_trs, _old, state) {
      const seen = new Set<string>();
      let tr = state.tr;
      let changed = false;
      state.doc.forEach((node, offset) => {
        const id = node.attrs.id as string | null;
        if (!id || seen.has(id)) {
          const fresh = newBlockId();
          tr = tr.setNodeMarkup(offset, undefined, { ...node.attrs, id: fresh });
          seen.add(fresh);
          changed = true;
        } else {
          seen.add(id);
        }
      });
      if (!changed) return null;
      return tr.setMeta("addToHistory", false);
    },
  });
}

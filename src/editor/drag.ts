import { Plugin, TextSelection, type Command } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import "./drag.css";

/**
 * Drag a block to a new place by its handle, with a mouse or a finger. The
 * block is moved as a whole node (same id), so sync records one block move and
 * another device's edit to it follows. Alt+↑/↓ still moves blocks by keyboard.
 */

/**
 * Where a dragged block ends up. `rects` are the blocks' vertical extents in
 * order; the pointer at `y` picks the gap it is nearest to. The result is the
 * dragged block's final index, so dropping it where it already is changes nothing.
 */
export function dropIndex(rects: { top: number; bottom: number }[], y: number, from: number): number {
  let gap = rects.length;
  for (let i = 0; i < rects.length; i++) {
    if (y < (rects[i].top + rects[i].bottom) / 2) {
      gap = i;
      break;
    }
  }
  return gap > from ? gap - 1 : gap;
}

/** Move the block at `from` so that it ends up at index `to`. */
export function moveBlockTo(from: number, to: number): Command {
  return (state, dispatch) => {
    const n = state.doc.childCount;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return false;
    if (!dispatch) return true;
    const node = state.doc.child(from);
    const startOf = (doc: typeof state.doc, i: number) => {
      let pos = 0;
      for (let k = 0; k < i; k++) pos += doc.child(k).nodeSize;
      return pos;
    };
    const start = startOf(state.doc, from);
    let tr = state.tr.delete(start, start + node.nodeSize);
    const at = startOf(tr.doc, to);
    tr = tr.insert(at, node);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

function indexOfId(view: EditorView, id: string): number {
  let found = -1;
  view.state.doc.forEach((node, _o, i) => {
    if (node.attrs.id === id) found = i;
  });
  return found;
}

/**
 * How far to scroll per frame when a drag nears the top or bottom of the
 * window, so a block can be carried past what is on screen. Zero away from the
 * edges; faster the closer the pointer gets.
 */
export function edgeScroll(y: number, height: number, zone = 56, max = 18): number {
  if (y < zone) return -Math.ceil(max * (1 - Math.max(y, 0) / zone));
  if (y > height - zone) return Math.ceil(max * (1 - Math.max(height - y, 0) / zone));
  return 0;
}

function handleFor(view: EditorView, id: string): HTMLElement {
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.contentEditable = "false";
  // A pointer-only shortcut: keyboard and screen-reader users move blocks with
  // Alt+↑/↓, so the handle is hidden from assistive technology rather than
  // announced as a control they cannot operate.
  handle.setAttribute("aria-hidden", "true");
  handle.title = "Drag to move this block (or Alt+↑ / Alt+↓)";

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    // A finished piece is read-only.
    if (!view.editable || indexOfId(view, id) < 0) return;
    event.preventDefault();

    const blocks = () => Array.from(view.dom.children) as HTMLElement[];
    // Indices are looked up by id every time they are used: another tab or
    // device may add, remove or move blocks while this one is being dragged.
    const from = () => indexOfId(view, id);
    let y = event.clientY;
    let target = from();
    const place = () => {
      const f = from();
      if (f < 0) return;
      target = dropIndex(blocks().map((el) => el.getBoundingClientRect()), y, f);
      blocks().forEach((el, i) => {
        el.classList.toggle("dragging", i === f);
        el.classList.toggle("drop-before", i === target && target < f);
        el.classList.toggle("drop-after", i === target && target > f);
      });
    };
    let frame = 0;
    const scroll = () => {
      const dy = edgeScroll(y, window.innerHeight);
      if (dy !== 0) {
        window.scrollBy(0, dy);
        place();
      }
      frame = requestAnimationFrame(scroll);
    };
    const move = (e: PointerEvent) => {
      y = e.clientY;
      place();
    };
    const finish = (apply: boolean) => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
      blocks().forEach((el) => el.classList.remove("dragging", "drop-before", "drop-after"));
      if (apply) {
        place();
        const f = from();
        if (f >= 0) moveBlockTo(f, target)(view.state, view.dispatch, view);
      }
      view.focus();
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    // The handle can be redrawn mid-drag when the selection changes, so listen on the document.
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    place();
    frame = requestAnimationFrame(scroll);
  });
  return handle;
}

/** A handle at the start of every block. It shows on hover and keyboard focus, and is always there on touch screens. */
export function dragHandlesPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations: (state) => {
        const widgets: Decoration[] = [];
        let pos = 0;
        state.doc.forEach((node) => {
          const id = node.attrs.id as string | null;
          if (id) widgets.push(Decoration.widget(pos + 1, (view) => handleFor(view, id), { key: `drag-${id}`, side: -1, ignoreSelection: true }));
          pos += node.nodeSize;
        });
        return DecorationSet.create(state.doc, widgets);
      },
    },
  });
}

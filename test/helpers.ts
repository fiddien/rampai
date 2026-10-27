import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import type { LoroDoc } from "loro-crdt";
import { createEditorState } from "../src/editor";
import { DocBinding } from "../src/sync/binding";
import { createDoc } from "../src/sync/model";

export function device(peer: number, from?: LoroDoc) {
  const doc = createDoc(peer);
  if (from) doc.import(from.export({ mode: "snapshot" }));
  let binding!: DocBinding;
  const view = new EditorView(document.createElement("div"), {
    state: createEditorState(),
    dispatchTransaction: (tr) => binding.dispatch(tr),
  });
  binding = new DocBinding(doc, view);
  return { doc, view, binding };
}

export type Device = ReturnType<typeof device>;

export function blocks(d: Device): string[] {
  const out: string[] = [];
  d.view.state.doc.forEach((n) => out.push(n.textContent));
  return out;
}

/** Start position of the content of block `index`. */
export function blockStart(d: Device, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += d.view.state.doc.child(i).nodeSize;
  return pos + 1;
}

export function cursor(d: Device, pos: number) {
  d.view.dispatch(d.view.state.tr.setSelection(TextSelection.create(d.view.state.doc, pos)));
}

export function type(d: Device, text: string) {
  d.view.dispatch(d.view.state.tr.insertText(text));
}

/** Exchange everything each side is missing, through the binding. */
export function syncPair(a: Device, b: Device) {
  const toB = a.doc.export({ mode: "update", from: b.doc.oplogVersion() });
  const toA = b.doc.export({ mode: "update", from: a.doc.oplogVersion() });
  b.binding.receive(toB);
  a.binding.receive(toA);
}

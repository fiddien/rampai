// @vitest-environment jsdom
// Experiment: does loro-prosemirror keep a concurrent edit to a block that another replica moved?
import { expect, test } from "vitest";
import { LoroDoc } from "loro-crdt";
import { LoroSyncPlugin } from "loro-prosemirror";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "prosemirror-schema-basic";

function makeView(doc: LoroDoc) {
  const state = EditorState.create({ schema, plugins: [LoroSyncPlugin({ doc: doc as any })] });
  return new EditorView(document.createElement("div"), { state });
}
function sync(a: LoroDoc, b: LoroDoc) {
  a.import(b.export({ mode: "update", from: a.oplogVersion() }));
  b.import(a.export({ mode: "update", from: b.oplogVersion() }));
}
const flush = () => new Promise((r) => setTimeout(r, 50));

test("loro-prosemirror: move on A, edit on B", async () => {
  const docA = new LoroDoc(); docA.setPeerId(1);
  const docB = new LoroDoc(); docB.setPeerId(2);
  const a = makeView(docA);
  const p = (t: string) => schema.node("paragraph", null, [schema.text(t)]);
  a.dispatch(a.state.tr.replaceWith(0, a.state.doc.content.size, [p("One"), p("Two"), p("Three")]));
  await flush(); docA.commit();
  const b = makeView(docB);
  sync(docA, docB); await flush();
  if (process.env.RAMPAI_VERBOSE) process.stdout.write("\n" + ["B before:", b.state.doc.textContent].join(" ") + "\n");
  // A: move "One" to the end (cut + paste of the node)
  const one = a.state.doc.child(0);
  let tr = a.state.tr.delete(0, one.nodeSize);
  tr = tr.insert(tr.doc.content.size, one);
  a.dispatch(tr); await flush(); docA.commit();
  // B: edit "One" while offline
  b.dispatch(b.state.tr.insertText(" edited", 4)); await flush(); docB.commit();
  sync(docA, docB); await flush();
  const out = (v: EditorView) => { const xs: string[] = []; v.state.doc.forEach((n) => xs.push(n.textContent)); return xs; };
  if (process.env.RAMPAI_VERBOSE) process.stdout.write("\n" + ["A after:", JSON.stringify(out(a))].join(" ") + "\n");
  if (process.env.RAMPAI_VERBOSE) process.stdout.write("\n" + ["B after:", JSON.stringify(out(b))].join(" ") + "\n");
  // Recorded finding (loro-prosemirror 0.4.4): B's edit to "One" lands in "Two".
  // If this assertion starts failing, the library has fixed it; see docs/architecture.md.
  expect(out(a)).toEqual(["Two edited", "Three", "One"]);
});

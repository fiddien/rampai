// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { EditorView } from "prosemirror-view";
import { createEditorState, schema } from "../src/editor";
import { newBlockId } from "../src/editor/blockIds";
import { moveSection, sectionsOf, siblingOf } from "../src/editor/outline";
import { device, blocks, syncPair } from "./helpers";

const b = (type: string, text: string) => schema.node(type, { id: newBlockId() }, text ? [schema.text(text)] : []);

function editorWith(...nodes: ReturnType<typeof b>[]) {
  const view: EditorView = new EditorView(document.createElement("div"), {
    state: createEditorState(schema.node("doc", null, nodes)),
    dispatchTransaction: (tr) => view.updateState(view.state.apply(tr)),
  });
  return view;
}

const draft = () =>
  editorWith(
    b("paragraph", "intro"),
    b("heading1", "A"),
    b("paragraph", "a1"),
    b("heading2", "A.1"),
    b("paragraph", "a1x"),
    b("heading2", "A.2"),
    b("paragraph", "a2x"),
    b("heading1", "B"),
    b("paragraph", "b1"),
  );

const texts = (v: EditorView) => {
  const out: string[] = [];
  v.state.doc.forEach((n) => out.push(n.textContent));
  return out;
};

describe("outline", () => {
  test("sections run to the next heading of the same or higher rank", () => {
    const s = sectionsOf(draft().state.doc).map((x) => [x.title, x.start, x.end]);
    expect(s).toEqual([["A", 1, 7], ["A.1", 3, 5], ["A.2", 5, 7], ["B", 7, 9]]);
  });

  test("a section moves with its body and subsections", () => {
    const v = draft();
    moveSection(0, 1)(v.state, v.dispatch, v);
    expect(texts(v)).toEqual(["intro", "B", "b1", "A", "a1", "A.1", "a1x", "A.2", "a2x"]);
  });

  test("a subsection swaps only with its sibling inside the same section", () => {
    const v = draft();
    moveSection(2, -1)(v.state, v.dispatch, v);
    expect(texts(v)).toEqual(["intro", "A", "a1", "A.2", "a2x", "A.1", "a1x", "B", "b1"]);
    expect(moveSection(2, 1)(v.state)).toBe(false);
    expect(moveSection(1, -1)(v.state)).toBe(false);
  });

  test("the first and last sections cannot move past the ends", () => {
    const v = draft();
    const s = sectionsOf(v.state.doc);
    expect(siblingOf(s, s[0], -1)).toBeUndefined();
    expect(siblingOf(s, s[3], 1)).toBeUndefined();
  });

  test("moving a section keeps block ids, so a concurrent edit follows it", () => {
    const a = device(1);
    a.view.dispatch(a.view.state.tr.replaceWith(0, a.view.state.doc.content.size, draft().state.doc.content));
    const c = device(2, a.doc);
    syncPair(a, c);
    const ids = () => blocks(a).map((_, i) => a.view.state.doc.child(i).attrs.id);
    const before = ids();

    moveSection(0, 1)(a.view.state, a.view.dispatch, a.view);
    expect(ids().slice(3)).toEqual(before.slice(1, 7));

    // Device c edits "a1" while a moves its section.
    let pos = 0;
    c.view.state.doc.forEach((n, o) => n.textContent === "a1" && (pos = o + 1 + 2));
    c.view.dispatch(c.view.state.tr.insertText("!", pos));
    syncPair(a, c);
    expect(blocks(a)).toEqual(blocks(c));
    expect(blocks(a)).toContain("a1!");
    expect(blocks(a).indexOf("a1!")).toBeGreaterThan(blocks(a).indexOf("B"));
  });
});

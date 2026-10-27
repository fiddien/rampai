// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { act, fireEvent, screen } from "@testing-library/react";
import { Outline } from "../src/ui/Outline";
import { renderApp } from "./render";
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

describe("outline edge cases and the panel", () => {
  test("no headings, or an unknown section, is a no-op", () => {
    const v = editorWith(b("paragraph", "just text"));
    expect(sectionsOf(v.state.doc)).toEqual([]);
    expect(moveSection(0, 1)(v.state)).toBe(false);
  });

  test("a heading in the last block, and an empty heading, form their own sections", () => {
    const v = editorWith(b("heading1", "A"), b("paragraph", "x"), b("heading1", ""), b("heading1", "C"));
    expect(sectionsOf(v.state.doc).map((s) => [s.title, s.start, s.end])).toEqual([["A", 0, 2], ["", 2, 3], ["C", 3, 4]]);
    moveSection(2, -1)(v.state, v.dispatch, v);
    expect(texts(v)).toEqual(["A", "x", "C", ""]);
  });

  test("the caret stays in the block it was in", () => {
    const v = draft();
    // caret inside "b1", three characters in is past its end, so use offset 1
    let pos = 0;
    v.state.doc.forEach((n, o) => n.textContent === "b1" && (pos = o + 2));
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, pos)));
    moveSection(0, 1)(v.state, v.dispatch, v);
    expect(v.state.selection.$head.parent.textContent).toBe("b1");
    expect(v.state.selection.$head.parentOffset).toBe(1);
  });

  test("a read-only editor is not changed by a section move", () => {
    const v = draft();
    v.setProps({ editable: () => false });
    expect(moveSection(0, 1)(v.state, v.dispatch, v)).toBe(false);
    expect(texts(v)[1]).toBe("A");
  });

  test("moving a section up writes through to another device", () => {
    const a = device(1);
    a.view.dispatch(a.view.state.tr.replaceWith(0, a.view.state.doc.content.size, draft().state.doc.content));
    const c = device(2, a.doc);
    syncPair(a, c);
    moveSection(3, -1)(a.view.state, a.view.dispatch, a.view);
    syncPair(a, c);
    expect(blocks(c)).toEqual(blocks(a));
    expect(blocks(a)).toEqual(["intro", "B", "b1", "A", "a1", "A.1", "a1x", "A.2", "a2x"]);
  });

  test("after pressing a move button focus returns to a button in the panel, and the move is announced", async () => {
    const v = draft();
    let tick = 0;
    const { container, rerender } = renderApp(<Outline view={v} tick={tick} />);
    const down = container.querySelector<HTMLButtonElement>('button[data-section="0"][data-dir="1"]')!;
    down.focus();
    await act(async () => fireEvent.click(down));
    rerender(<Outline view={v} tick={++tick} />);
    expect(container.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Moved “A” down");
    expect(texts(v).slice(0, 3)).toEqual(["intro", "B", "b1"]);
    // Read-only draft: the move buttons are disabled.
    v.setProps({ editable: () => false });
    rerender(<Outline view={v} tick={++tick} />);
    expect(container.querySelector<HTMLButtonElement>('button[data-dir="1"]')!.disabled).toBe(true);
  });
});

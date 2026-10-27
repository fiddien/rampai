// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { EditorView } from "prosemirror-view";
import { Slice, Fragment } from "prosemirror-model";
import { splitBlock } from "prosemirror-commands";
import { createEditorState, schema } from "../src/editor";
import { listEnter } from "../src/editor/commands";

function editor(onBlocked = () => {}) {
  return new EditorView(document.createElement("div"), { state: createEditorState(undefined, { onBlockedPaste: onBlocked }) });
}

describe("editor", () => {
  test("splitting a block gives the new half its own id", () => {
    const view = editor();
    view.dispatch(view.state.tr.insertText("Hello world"));
    splitBlock(view.state, view.dispatch);
    const [a, b] = [view.state.doc.child(0).attrs.id, view.state.doc.child(1).attrs.id];
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  test("Enter in a list continues it; Enter in an empty item ends it", () => {
    const view = editor();
    view.dispatch(view.state.tr.setBlockType(0, 2, schema.nodes.list_item));
    view.dispatch(view.state.tr.insertText("first"));
    listEnter(view.state, view.dispatch);
    expect(view.state.doc.child(1).type.name).toBe("list_item");
    listEnter(view.state, view.dispatch);
    expect(view.state.doc.child(1).type.name).toBe("paragraph");
  });

  test("pasting is refused and reported", () => {
    const blocked = vi.fn();
    const view = editor(blocked);
    const slice = new Slice(Fragment.from(schema.text("copied")), 0, 0);
    const handled = view.someProp("handlePaste", (f) => f(view, new Event("paste") as ClipboardEvent, slice));
    expect(handled).toBe(true);
    expect(blocked).toHaveBeenCalledOnce();
    expect(view.state.doc.textContent).toBe("");
  });

  test("dropping text from outside is refused, moving the writer's own text is not", () => {
    const blocked = vi.fn();
    const view = editor(blocked);
    const slice = new Slice(Fragment.from(schema.text("dropped")), 0, 0);
    const outside = view.someProp("handleDrop", (f) => f(view, new Event("drop") as DragEvent, slice, false));
    expect(outside).toBe(true);
    const own = view.someProp("handleDrop", (f) => f(view, new Event("drop") as DragEvent, slice, true));
    expect(own).toBeFalsy();
    expect(blocked).toHaveBeenCalledOnce();
  });
});

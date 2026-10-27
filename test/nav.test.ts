// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { EditorView } from "prosemirror-view";
import { createEditorState } from "../src/editor";
import { backBar, navBar } from "../src/ui/nav";
import { buildToolbar } from "../src/ui/toolbar";
import { buildShortcuts } from "../src/ui/shortcuts";

describe("navigation bar", () => {
  test("offers the three places, in order, and marks only the current page", () => {
    const bar = navBar("link");
    const links = Array.from(bar.querySelectorAll<HTMLAnchorElement>("nav a"));
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Drafts", "#/"],
      ["Link a device", "#/link"],
      ["Recovery words", "#/welcome"],
    ]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
    expect(bar.querySelector(".brand")!.getAttribute("href")).toBe("#/");
  });

  test("a dot, with a spoken note, shows on Recovery words only while the device has none", () => {
    const missing = navBar("drafts", { wordsMissing: true });
    expect(missing.querySelector(".nav-dot")).not.toBeNull();
    expect(missing.querySelector("nav")!.textContent).toContain("(not set up yet)");
    expect(navBar("drafts").querySelector(".nav-dot")).toBeNull();
    expect(navBar().querySelector("[aria-current]")).toBeNull();
  });

  test("the writing page has one way out", () => {
    const links = backBar().querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("#/");
  });
});

function editor() {
  const view: EditorView = new EditorView(document.createElement("div"), {
    state: createEditorState(),
    dispatchTransaction: (tr) => view.updateState(view.state.apply(tr)),
  });
  return view;
}

describe("quieter toolbar", () => {
  test("the writing page shows bold, italic and one block menu, without block moves", () => {
    const view = editor();
    const bar = buildToolbar(() => view);
    expect(Array.from(bar.element.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["B", "I"]);
    expect(Array.from(bar.element.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Text", "Heading", "Subheading", "Quote", "List"]);
  });

  test("the menu follows the caret's block and changes it", () => {
    const view = editor();
    const bar = buildToolbar(() => view);
    const menu = bar.element.querySelector<HTMLSelectElement>("select")!;
    bar.update(view.state);
    expect(menu.value).toBe("paragraph");
    menu.value = "heading1";
    menu.dispatchEvent(new Event("change"));
    expect(view.state.doc.child(0).type.name).toBe("heading1");
    bar.update(view.state);
    expect(menu.value).toBe("heading1");
    menu.value = "paragraph";
    menu.dispatchEvent(new Event("change"));
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
  });

  test("the menu is disabled while the draft is read-only", () => {
    const view = editor();
    const bar = buildToolbar(() => view);
    view.setProps({ editable: () => false });
    bar.update(view.state);
    expect(bar.element.querySelector("select")!.disabled).toBe(true);
  });

  test("the compact toolbar of the two-device demo keeps the moves and has no menu", () => {
    const view = editor();
    const bar = buildToolbar(() => view, true);
    expect(bar.element.querySelector("select")).toBeNull();
    expect(Array.from(bar.element.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["B", "I", "↑", "↓"]);
  });
});

describe("shortcuts panel", () => {
  test("opens from its button, lists the shortcuts, and Escape closes it and returns focus", () => {
    const panel = buildShortcuts();
    document.body.append(panel.button, panel.dialog);
    expect(panel.button.getAttribute("aria-label")).toBe("Keyboard shortcuts");
    panel.button.click();
    expect(panel.dialog.hasAttribute("open")).toBe(true);
    expect(panel.dialog.textContent).toContain("Bold");
    expect(panel.dialog.textContent).toContain("Pasting is switched off on purpose");
    panel.dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.dialog.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(panel.button);
  });
});

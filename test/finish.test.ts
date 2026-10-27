// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { canFinish, finishedAt, getProposition, isFinished, markFinished, reopen, setProposition } from "../src/sync/meta";
import { createDoc } from "../src/sync/model";
import { createDraft, partitionDrafts, updateDraft, listDrafts } from "../src/sync/library";

describe("finishing", () => {
  test("needs a proposition, some words, and the read-aloud check", () => {
    expect(canFinish("Writing clarifies thought.", 120, true)).toBe(true);
    expect(canFinish("", 120, true)).toBe(false);
    expect(canFinish("   ", 120, true)).toBe(false);
    expect(canFinish("A claim.", 0, true)).toBe(false);
    expect(canFinish("A claim.", 120, false)).toBe(false);
  });

  test("proposition and finished state sync, and reopening syncs too", () => {
    const a = createDoc(1);
    const b = createDoc(2);
    setProposition(a, "Writing clarifies thought.");
    markFinished(a, 1000);
    b.import(a.export({ mode: "snapshot" }));
    expect(getProposition(b)).toBe("Writing clarifies thought.");
    expect(finishedAt(b)).toBe(1000);

    reopen(b);
    a.import(b.export({ mode: "update", from: a.oplogVersion() }));
    expect(isFinished(a)).toBe(false);
    expect(getProposition(a)).toBe("Writing clarifies thought.");
  });

  test("finishing twice keeps the first date", () => {
    const doc = createDoc(1);
    markFinished(doc, 1);
    markFinished(doc, 2);
    expect(finishedAt(doc)).toBe(1);
  });
});

describe("library", () => {
  test("finished pieces are listed apart from drafts, and old entries count as drafts", () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    const a = createDraft(store, 1);
    const b = createDraft(store, 2);
    updateDraft(store, a.id, { finished: true });
    const { inProgress, finished } = partitionDrafts(listDrafts(store));
    expect(inProgress.map((d) => d.id)).toEqual([b.id]);
    expect(finished.map((d) => d.id)).toEqual([a.id]);
  });
});

// ——— The panel and read-only enforcement ———
import { EditorView } from "prosemirror-view";
import { vi } from "vitest";
import { buildFinish } from "../src/ui/finish";
import { buildToolbar } from "../src/ui/toolbar";
import { createEditorState } from "../src/editor";
import { DocBinding } from "../src/sync/binding";
import { toggleBlock } from "../src/editor/commands";

describe("read-only enforcement", () => {
  function bound() {
    const doc = createDoc(1);
    let binding!: DocBinding;
    const view: EditorView = new EditorView(document.createElement("div"), {
      state: createEditorState(),
      dispatchTransaction: (tr) => binding.dispatch(tr),
    });
    binding = new DocBinding(doc, view);
    view.dispatch(view.state.tr.insertText("some words"));
    return { doc, view };
  }

  test("a locked draft ignores toolbar and command edits, and nothing reaches the document", () => {
    const { doc, view } = bound();
    view.setProps({ editable: () => false });
    const before = doc.export({ mode: "snapshot" }).length;
    toggleBlock("heading1")(view.state, view.dispatch, view);
    view.dispatch(view.state.tr.insertText("!"));
    expect(view.state.doc.child(0).type.name).toBe("paragraph");
    expect(view.state.doc.textContent).toBe("some words");
    expect(doc.export({ mode: "snapshot" }).length).toBe(before);
    view.setProps({ editable: () => true });
    toggleBlock("heading1")(view.state, view.dispatch, view);
    expect(view.state.doc.child(0).type.name).toBe("heading1");
  });

  test("toolbar buttons are disabled while the draft is locked", () => {
    const { view } = bound();
    const toolbar = buildToolbar(() => view);
    toolbar.update(view.state);
    const buttons = Array.from(toolbar.element.querySelectorAll("button"));
    expect(buttons.some((b) => !b.disabled)).toBe(true);
    view.setProps({ editable: () => false });
    toolbar.update(view.state);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});

describe("finish panel", () => {
  function panel(words = 50) {
    const doc = createDoc(1);
    const changes: boolean[] = [];
    const refused = vi.fn();
    const p = buildFinish(doc, () => words, refused, (f) => changes.push(f));
    document.body.append(p.element);
    p.toggle();
    const q = <T extends HTMLElement>(sel: string) => p.element.querySelector<T>(sel)!;
    return { doc, p, changes, refused, q };
  }

  test("finishing needs the claim and the tick, then offers a way back", () => {
    const { doc, q, changes } = panel();
    const finish = q<HTMLButtonElement>(".primary");
    expect(finish.disabled).toBe(true);
    const claim = q<HTMLTextAreaElement>(".finish-input");
    claim.value = "Writing connects ideas.";
    claim.dispatchEvent(new Event("input"));
    expect(finish.disabled).toBe(true);
    const tick = q<HTMLInputElement>(".finish-check input");
    tick.checked = true;
    tick.dispatchEvent(new Event("change"));
    expect(finish.disabled).toBe(false);
    finish.click();
    expect(isFinished(doc)).toBe(true);
    expect(changes).toEqual([true]);
    expect(document.activeElement).toBe(q(".finish-done button"));
  });

  test("a reopen from another device clears the tick, so re-finishing means reading again", () => {
    const { doc, q } = panel();
    const claim = q<HTMLTextAreaElement>(".finish-input");
    claim.value = "A claim.";
    claim.dispatchEvent(new Event("input"));
    const tick = q<HTMLInputElement>(".finish-check input");
    tick.checked = true;
    tick.dispatchEvent(new Event("change"));
    q<HTMLButtonElement>(".primary").click();
    reopen(doc); // as if it arrived from another device
    expect(tick.checked).toBe(false);
    expect(q<HTMLButtonElement>(".primary").disabled).toBe(true);
  });

  test("changing the claim clears the tick", () => {
    const { q } = panel();
    const claim = q<HTMLTextAreaElement>(".finish-input");
    const tick = q<HTMLInputElement>(".finish-check input");
    claim.value = "First.";
    claim.dispatchEvent(new Event("input"));
    tick.checked = true;
    tick.dispatchEvent(new Event("change"));
    claim.value = "Second.";
    claim.dispatchEvent(new Event("input"));
    expect(tick.checked).toBe(false);
  });

  test("dropped and pasted text is refused in the claim", () => {
    const { q, refused } = panel();
    const claim = q<HTMLTextAreaElement>(".finish-input");
    for (const type of ["paste", "drop"]) {
      const e = new Event(type, { cancelable: true });
      claim.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(refused).toHaveBeenCalledTimes(2);
  });

  test("the finished note is announced to screen readers", () => {
    const { q } = panel();
    expect(q(".finish-done").getAttribute("role")).toBe("status");
  });
});

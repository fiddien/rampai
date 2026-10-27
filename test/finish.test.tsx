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
import { act, fireEvent, screen } from "@testing-library/react";
import { Finish } from "../src/ui/Finish";
import { renderApp } from "./render";
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
});

describe("finish panel", () => {
  function panel(words = 50) {
    const doc = createDoc(1);
    const refused = vi.fn();
    const r = renderApp(<Finish doc={doc} words={words} onBlockedPaste={refused} />);
    const claim = () => screen.getByLabelText("In one sentence, what is this piece saying?") as HTMLTextAreaElement;
    const tick = () => screen.getByLabelText("I read it aloud, and it hangs together.") as HTMLInputElement;
    const finish = () => screen.getByRole("button", { name: "Mark as finished" }) as HTMLButtonElement;
    return { doc, refused, claim, tick, finish, ...r };
  }

  test("finishing needs the claim and the tick, then offers a way back", async () => {
    const { doc, claim, tick, finish } = panel();
    expect(finish().disabled).toBe(true);
    fireEvent.change(claim(), { target: { value: "Writing connects ideas." } });
    expect(finish().disabled).toBe(true);
    fireEvent.click(tick());
    expect(finish().disabled).toBe(false);
    await act(async () => fireEvent.click(finish()));
    expect(isFinished(doc)).toBe(true);
    expect(await screen.findByRole("button", { name: "Reopen as a draft" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Writing connects ideas.");
  });

  test("a reopen from another device clears the tick, so re-finishing means reading again", async () => {
    const { doc, claim, tick, finish } = panel();
    fireEvent.change(claim(), { target: { value: "A claim." } });
    fireEvent.click(tick());
    await act(async () => fireEvent.click(finish()));
    await act(async () => reopen(doc)); // as if it arrived from another device
    expect(tick().checked).toBe(false);
    expect(finish().disabled).toBe(true);
  });

  test("changing the claim clears the tick", () => {
    const { claim, tick } = panel();
    fireEvent.change(claim(), { target: { value: "First." } });
    fireEvent.click(tick());
    expect(tick().checked).toBe(true);
    fireEvent.change(claim(), { target: { value: "Second." } });
    expect(tick().checked).toBe(false);
  });

  test("dropped and pasted text is refused in the claim", () => {
    const { claim, refused } = panel();
    expect(fireEvent.paste(claim())).toBe(false);
    expect(fireEvent.drop(claim())).toBe(false);
    expect(refused).toHaveBeenCalledTimes(2);
  });

  test("a piece with no words cannot be finished", () => {
    const { claim, tick, finish } = panel(0);
    fireEvent.change(claim(), { target: { value: "A claim." } });
    fireEvent.click(tick());
    expect(finish().disabled).toBe(true);
  });
});

describe("claim", () => {
  test("is stored without spaces at the ends", () => {
    const doc = createDoc(1);
    setProposition(doc, "  Writing is thinking.  ");
    expect(getProposition(doc)).toBe("Writing is thinking.");
  });
});

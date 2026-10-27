import type { LoroDoc } from "loro-crdt";
import { canFinish, finishedAt, getProposition, markFinished, reopen, setProposition } from "../sync/meta";

export interface FinishPanel {
  element: HTMLElement;
  toggle(): void;
  /** Call when the text changes (the word count gates finishing) or the document changes. */
  update(): void;
  readonly open: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * The exit test: say in one sentence what the piece claims, and read it aloud.
 * Works the same whether the writer began from a topic or from a claim.
 */
export function buildFinish(doc: LoroDoc, words: () => number, refusePaste: () => void, onFinishedChange: (finished: boolean) => void): FinishPanel {
  const element = el("section", "finish");
  element.setAttribute("aria-label", "Finishing this piece");
  element.hidden = true;

  // While writing: ask.
  const ask = el("div", "finish-ask");
  const label = el("label", "", "In one sentence, what is this piece saying?");
  label.htmlFor = "finish-proposition";
  const proposition = el("textarea", "finish-input");
  proposition.id = "finish-proposition";
  proposition.rows = 2;
  proposition.maxLength = 400;
  proposition.placeholder = "A topic is fine to begin with; a claim is better to end with.";
  proposition.addEventListener("paste", (e) => {
    e.preventDefault();
    refusePaste();
  });
  const readRow = el("label", "finish-check");
  const aloud = el("input");
  aloud.type = "checkbox";
  readRow.append(aloud, " I read it aloud, and it hangs together.");
  const finish = el("button", "primary", "Mark as finished");
  finish.type = "button";
  ask.append(label, proposition, readRow, finish);

  // Once finished: show the claim, and a way back.
  const done = el("div", "finish-done");
  const doneNote = el("p", "finish-note");
  const claim = el("blockquote", "finish-claim");
  const back = el("button", "tool", "Reopen as a draft");
  back.type = "button";
  done.append(doneNote, claim, back);

  element.append(ask, done);

  const state = { finished: false };
  function refresh() {
    const at = finishedAt(doc);
    const finished = at !== undefined;
    ask.hidden = finished;
    done.hidden = !finished;
    if (document.activeElement !== proposition) proposition.value = getProposition(doc);
    finish.disabled = !canFinish(proposition.value, words(), aloud.checked);
    if (finished) {
      doneNote.textContent = `Finished ${new Date(at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}. This piece says:`;
      claim.textContent = getProposition(doc);
    }
    if (finished !== state.finished) {
      state.finished = finished;
      if (finished) element.hidden = false;
      onFinishedChange(finished);
    }
  }

  proposition.addEventListener("input", () => {
    setProposition(doc, proposition.value);
    refresh();
  });
  aloud.addEventListener("change", refresh);
  finish.addEventListener("click", () => {
    if (!canFinish(proposition.value, words(), aloud.checked)) return;
    markFinished(doc);
    refresh();
  });
  back.addEventListener("click", () => {
    reopen(doc);
    aloud.checked = false;
    refresh();
  });
  doc.subscribe(refresh);
  refresh();

  return {
    element,
    toggle() {
      element.hidden = !element.hidden;
      if (!element.hidden) proposition.focus();
    },
    update: refresh,
    get open() {
      return !element.hidden;
    },
  };
}

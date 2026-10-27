import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { sectionsOf, siblingOf, moveSection } from "../editor/outline";

export interface OutlinePanel {
  element: HTMLElement;
  toggle(): void;
  update(): void;
}

/** A side list of the draft's headings. Each section can move up or down with its body, or be jumped to. */
export function buildOutline(getView: () => EditorView): OutlinePanel {
  const element = document.createElement("aside");
  element.className = "outline chrome";
  element.setAttribute("aria-label", "Outline");
  element.hidden = true;

  function jump(blockIndex: number) {
    const view = getView();
    let pos = 0;
    for (let i = 0; i < blockIndex; i++) pos += view.state.doc.child(i).nodeSize;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))).scrollIntoView());
    view.focus();
  }

  function render() {
    const view = getView();
    const sections = sectionsOf(view.state.doc);
    const heading = document.createElement("div");
    heading.className = "outline-title";
    heading.textContent = "Outline";
    const list = document.createElement("ol");
    if (sections.length === 0) {
      const hint = document.createElement("li");
      hint.className = "outline-empty";
      hint.textContent = "Headings appear here. Type # and a space to make one.";
      list.append(hint);
    }
    for (const s of sections) {
      const item = document.createElement("li");
      item.className = `outline-item level-${s.level}`;
      const name = document.createElement("button");
      name.type = "button";
      name.className = "outline-name";
      name.textContent = s.title || "Untitled heading";
      name.addEventListener("click", () => jump(s.start));
      item.append(name);
      for (const dir of [-1, 1] as const) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tool";
        b.textContent = dir < 0 ? "↑" : "↓";
        const label = `Move “${s.title || "Untitled heading"}” ${dir < 0 ? "up" : "down"} with its text`;
        b.title = label;
        b.setAttribute("aria-label", label);
        b.disabled = !siblingOf(sections, s, dir);
        b.addEventListener("click", () => {
          const v = getView();
          moveSection(s.index, dir)(v.state, v.dispatch, v);
        });
        item.append(b);
      }
      list.append(item);
    }
    element.replaceChildren(heading, list);
  }

  return {
    element,
    toggle() {
      element.hidden = !element.hidden;
      document.body.classList.toggle("with-outline", !element.hidden);
      if (!element.hidden) render();
    },
    update() {
      if (!element.hidden) render();
    },
  };
}

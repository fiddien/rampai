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
  element.className = "outline";
  element.setAttribute("aria-label", "Outline");
  element.hidden = true;
  // Announces where a section went, for screen readers.
  const live = document.createElement("div");
  live.className = "visually-hidden";
  live.setAttribute("role", "status");

  function jump(blockIndex: number) {
    const view = getView();
    let pos = 0;
    for (let i = 0; i < blockIndex; i++) pos += view.state.doc.child(i).nodeSize;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))).scrollIntoView());
    view.focus();
  }

  function render(follow?: { headingId: string; dir: -1 | 1 }) {
    const view = getView();
    const sections = sectionsOf(view.state.doc);
    // Redrawing replaces the buttons, so remember which one had focus and give it back.
    const active = element.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const keep = follow
      ? { index: sections.findIndex((o) => view.state.doc.child(o.start).attrs.id === follow.headingId), dir: follow.dir }
      : active?.dataset.section
        ? { index: Number(active.dataset.section), dir: Number(active.dataset.dir) }
        : undefined;
    const heading = document.createElement("h2");
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
      item.setAttribute("aria-label", `Heading ${s.level}: ${s.title || "Untitled heading"}`);
      const name = document.createElement("button");
      name.type = "button";
      name.className = "outline-name";
      name.textContent = s.title || "Untitled heading";
      name.dataset.section = String(s.index);
      name.dataset.dir = "0";
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
        b.dataset.section = String(s.index);
        b.dataset.dir = String(dir);
        b.disabled = !view.editable || !siblingOf(sections, s, dir);
        b.addEventListener("click", () => {
          const v = getView();
          const headingId = v.state.doc.child(s.start).attrs.id as string;
          if (!moveSection(s.index, dir)(v.state, v.dispatch, v)) return;
          live.textContent = `Moved “${s.title || "Untitled heading"}” ${dir < 0 ? "up" : "down"}`;
          // The section has a new place in the list; follow it with focus.
          render({ headingId, dir });
        });
        item.append(b);
      }
      list.append(item);
    }
    element.replaceChildren(heading, list, live);
    if (keep && keep.index >= 0) {
      const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>("button[data-section]"));
      const at = (dir: number) => buttons.find((b) => Number(b.dataset.section) === keep.index && Number(b.dataset.dir) === dir);
      const exact = at(keep.dir);
      (exact && !exact.disabled ? exact : at(0))?.focus();
    }
  }

  return {
    element,
    toggle() {
      element.hidden = !element.hidden;
      if (!element.hidden) render();
    },
    update() {
      if (!element.hidden) render();
    },
  };
}

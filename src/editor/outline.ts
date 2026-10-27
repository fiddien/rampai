import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { Fragment, type Node } from "prosemirror-model";

/**
 * Outline mode shows only the headings, and moves whole sections: a heading
 * together with everything under it, up to the next heading of the same or a
 * higher rank. Sections move only among their siblings, so a subsection never
 * jumps out of the section it belongs to.
 */
export interface Section {
  /** Index of this section in the list of sections. */
  index: number;
  level: 1 | 2;
  title: string;
  /** Block indices: the section covers blocks [start, end). */
  start: number;
  end: number;
}

const LEVELS: Record<string, 1 | 2> = { heading1: 1, heading2: 2 };

export function sectionsOf(doc: Node): Section[] {
  const heads: { level: 1 | 2; title: string; start: number }[] = [];
  doc.forEach((node, _offset, i) => {
    const level = LEVELS[node.type.name];
    if (level) heads.push({ level, title: node.textContent.trim(), start: i });
  });
  return heads.map((h, index) => {
    const next = heads.slice(index + 1).find((o) => o.level <= h.level);
    return { index, level: h.level, title: h.title, start: h.start, end: next ? next.start : doc.childCount };
  });
}

function offsetOfBlock(doc: Node, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

/** The sibling that sits directly before (-1) or after (+1) a section, if any. */
export function siblingOf(sections: Section[], section: Section, dir: -1 | 1): Section | undefined {
  return sections.find((o) =>
    o.level === section.level && (dir < 0 ? o.end === section.start : o.start === section.end),
  );
}

/** Swap a section with its neighbour (up is -1, down is +1), carrying its body along. */
export function moveSection(sectionIndex: number, dir: -1 | 1): Command {
  return (state, dispatch) => {
    const sections = sectionsOf(state.doc);
    const section = sections[sectionIndex];
    const sibling = section && siblingOf(sections, section, dir);
    if (!section || !sibling) return false;
    if (!dispatch) return true;

    const [first, second] = dir < 0 ? [sibling, section] : [section, sibling];
    const from = offsetOfBlock(state.doc, first.start);
    const mid = offsetOfBlock(state.doc, second.start);
    const to = offsetOfBlock(state.doc, second.end);
    const swapped = Fragment.from([
      ...state.doc.slice(mid, to).content.content,
      ...state.doc.slice(from, mid).content.content,
    ]);
    const tr = state.tr.replaceWith(from, to, swapped);
    const movedStart = dir < 0 ? from : from + (to - mid);
    tr.setSelection(TextSelection.near(tr.doc.resolve(movedStart + 1)));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

import { useLayoutEffect, useRef, useState } from "react";
import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { sectionsOf, siblingOf, moveSection } from "../editor/outline";
import { ToolButton } from "./Toolbar";

/** A side list of the draft's headings. Each section can move up or down with its body, or be jumped to. */
export function Outline({ view }: { view: EditorView | undefined; tick: number }) {
  const root = useRef<HTMLElement>(null);
  const [announce, setAnnounce] = useState("");
  // After a move the section has a new place in the list; focus follows it.
  const follow = useRef<{ headingId: string; dir: -1 | 1 } | null>(null);
  const sections = view ? sectionsOf(view.state.doc) : [];

  useLayoutEffect(() => {
    const f = follow.current;
    if (!f || !view || !root.current) return;
    follow.current = null;
    const index = sections.findIndex((s) => view.state.doc.child(s.start).attrs.id === f.headingId);
    const at = (dir: number) => root.current!.querySelector<HTMLButtonElement>(`button[data-section="${index}"][data-dir="${dir}"]`);
    const exact = at(f.dir);
    (exact && !exact.disabled ? exact : at(0))?.focus();
  });

  const jump = (blockIndex: number) => {
    if (!view) return;
    let pos = 0;
    for (let i = 0; i < blockIndex; i++) pos += view.state.doc.child(i).nodeSize;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))).scrollIntoView());
    view.focus();
  };

  return (
    <aside className="outline" aria-label="Outline" ref={root}>
      <h2 className="outline-title">Outline</h2>
      <ol>
        {sections.length === 0 && <li className="outline-empty">Headings appear here. Type # and a space to make one.</li>}
        {sections.map((s) => {
          const name = s.title || "Untitled heading";
          return (
            <li key={`${s.index}-${s.start}`} className={`outline-item level-${s.level}`} aria-label={`Heading ${s.level}: ${name}`}>
              <button type="button" className="outline-name" data-section={s.index} data-dir={0} onClick={() => jump(s.start)}>
                {name}
              </button>
              {([-1, 1] as const).map((dir) => {
                const label = `Move “${name}” ${dir < 0 ? "up" : "down"} with its text`;
                return (
                  <ToolButton
                    key={dir}
                    title={label}
                    aria-label={label}
                    data-section={s.index}
                    data-dir={dir}
                    disabled={!view?.editable || !siblingOf(sections, s, dir)}
                    onClick={() => {
                      if (!view) return;
                      const headingId = view.state.doc.child(s.start).attrs.id as string;
                      if (!moveSection(s.index, dir)(view.state, view.dispatch, view)) return;
                      follow.current = { headingId, dir };
                      setAnnounce(`Moved “${name}” ${dir < 0 ? "up" : "down"}`);
                    }}
                  >
                    {dir < 0 ? "↑" : "↓"}
                  </ToolButton>
                );
              })}
            </li>
          );
        })}
      </ol>
      {/* Announces where a section went, for screen readers. */}
      <div className="visually-hidden" role="status">
        {announce}
      </div>
    </aside>
  );
}

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { EditorView } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import type { LoroDoc } from "loro-crdt";
import { createEditorState } from "../editor";
import { DocBinding } from "../sync/binding";

export interface EditorHandle {
  view: EditorView;
  binding: DocBinding;
}

/**
 * A ProseMirror editor bound to a Loro document, mounted on the returned ref.
 * ProseMirror owns its own DOM; React only re-renders what sits around it,
 * once per transaction (`tick`).
 */
export function useEditor(doc: LoroDoc, opts: { initial?: Node; onBlockedPaste?: () => void } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<EditorHandle | null>(null);
  const [tick, setTick] = useState(0);
  const options = useRef(opts);
  options.current = opts;

  useEffect(() => {
    const place = ref.current;
    if (!place) return;
    let binding!: DocBinding;
    const view = new EditorView(place, {
      state: createEditorState(options.current.initial, { onBlockedPaste: () => options.current.onBlockedPaste?.() }),
      dispatchTransaction: (tr) => {
        binding.dispatch(tr);
        setTick((t) => t + 1);
      },
    });
    view.dom.setAttribute("aria-label", "Draft");
    view.dom.setAttribute("spellcheck", "true");
    binding = new DocBinding(doc, view);
    setHandle({ view, binding });
    setTick((t) => t + 1);
    return () => {
      view.destroy();
      setHandle(null);
    };
  }, [doc]);

  return { ref, handle, tick };
}

/** A value read from a Loro document, kept current as the document changes (locally or from elsewhere). */
export function useDocValue<T>(doc: LoroDoc, read: (doc: LoroDoc) => T): T {
  const reader = useRef(read);
  reader.current = read;
  return useSyncExternalStore(
    (onChange) => doc.subscribe(() => onChange()),
    () => reader.current(doc),
  );
}

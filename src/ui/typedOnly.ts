import { useEffect, useRef, type RefObject } from "react";

const OUTSIDE = /^insertFrom(Paste|Drop|Yank|PasteAsQuotation)/;

/**
 * Typed-only for a plain text field: paste, drops and drags of text from
 * outside are refused, as in the editor. Typing, and editing what is already in
 * the field, are not. Native listeners, because React's own onBeforeInput does
 * not report where the text came from.
 */
export function useTypedOnly<T extends HTMLInputElement | HTMLTextAreaElement>(ref: RefObject<T | null>, onBlocked: () => void) {
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;
  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    const refuse = (e: Event) => {
      e.preventDefault();
      blocked.current();
    };
    const before = (e: Event) => OUTSIDE.test((e as InputEvent).inputType ?? "") && refuse(e);
    field.addEventListener("paste", refuse);
    field.addEventListener("drop", refuse);
    field.addEventListener("beforeinput", before);
    return () => {
      field.removeEventListener("paste", refuse);
      field.removeEventListener("drop", refuse);
      field.removeEventListener("beforeinput", before);
    };
  });
}

const OUTSIDE = /^insertFrom(Paste|Drop|Yank|PasteAsQuotation)/;

/**
 * Typed-only for a plain text field: paste, drops and drags of text from
 * outside are refused, as in the editor. Typing, and editing what is already in
 * the field, are not.
 */
export function typedOnlyField(field: HTMLInputElement | HTMLTextAreaElement, onBlocked: () => void): void {
  const refuse = (e: Event) => {
    e.preventDefault();
    onBlocked();
  };
  field.addEventListener("paste", refuse);
  field.addEventListener("drop", refuse);
  field.addEventListener("beforeinput", (e) => {
    if (OUTSIDE.test((e as InputEvent).inputType ?? "")) refuse(e);
  });
}

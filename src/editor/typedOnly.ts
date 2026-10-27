import { Plugin } from "prosemirror-state";

const BLOCKED_INPUT = /^insertFrom(Paste|Drop|Yank|PasteAsQuotation)/;

/**
 * Rampai's core rule: text enters a draft only by typing. Pasting and dropping
 * text from outside are refused. Dragging the writer's own text within the
 * draft is still allowed, because those words are already hers.
 */
export function typedOnlyPlugin(onBlocked: () => void = () => {}): Plugin {
  return new Plugin({
    props: {
      handlePaste() {
        onBlocked();
        return true;
      },
      handleDrop(_view, _event, _slice, moved) {
        if (moved) return false;
        onBlocked();
        return true;
      },
      handleDOMEvents: {
        beforeinput(_view, event) {
          if (BLOCKED_INPUT.test((event as InputEvent).inputType ?? "")) {
            event.preventDefault();
            onBlocked();
            return true;
          }
          return false;
        },
      },
    },
  });
}

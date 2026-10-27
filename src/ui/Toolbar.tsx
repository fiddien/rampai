import { Button, NativeSelect } from "@mantine/core";
import type { EditorView } from "prosemirror-view";
import type { Command, EditorState } from "prosemirror-state";
import { setBlockType, toggleMark } from "prosemirror-commands";
import { schema } from "../editor/schema";
import { moveBlock } from "../editor/commands";
import { ALT, MOD } from "./format";

interface Tool {
  label: string;
  title: string;
  className?: string;
  command: Command;
  active?: (state: EditorState) => boolean;
}

function markActive(name: "strong" | "em") {
  return (state: EditorState) => {
    const type = schema.marks[name];
    const { from, to, empty, $from } = state.selection;
    if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
    return state.doc.rangeHasMark(from, to, type);
  };
}

const FORMAT: Tool[] = [
  { label: "B", title: `Bold (${MOD}+B)`, className: "b", command: toggleMark(schema.marks.strong), active: markActive("strong") },
  { label: "I", title: `Italic (${MOD}+I)`, className: "i", command: toggleMark(schema.marks.em), active: markActive("em") },
];
const MOVE: Tool[] = [
  { label: "↑", title: `Move this block up (${ALT}+↑)`, command: moveBlock(-1) },
  { label: "↓", title: `Move this block down (${ALT}+↓)`, command: moveBlock(1) },
];

export const BLOCK_MENU: { value: string; label: string }[] = [
  { value: "paragraph", label: "Text" },
  { value: "heading1", label: "Heading" },
  { value: "heading2", label: "Subheading" },
  { value: "quote", label: "Quote" },
  { value: "list_item", label: "List" },
];

/** A quiet text button for the bars: Mantine's subtle button, sized for a toolbar. */
export function ToolButton({ className, ...props }: React.ComponentProps<typeof Button<"button">>) {
  return <Button variant="subtle" color="gray" size="compact-sm" className={`tool ${className ?? ""}`} {...props} />;
}

/**
 * Formatting for one editor. The writing page shows bold, italic and one menu
 * for the kind of block; `compact` (the two-device demo) shows bold, italic and
 * the block moves instead. `tick` changes with every transaction, so the
 * buttons follow the selection.
 */
export function Toolbar({ view, compact = false }: { view: EditorView | undefined; tick: number; compact?: boolean }) {
  const editable = !!view?.editable;
  const tools = compact ? [...FORMAT, ...MOVE] : FORMAT;
  const current = view?.state.selection.$head.parent.type.name ?? "paragraph";
  return (
    <div className="tools">
      {tools.map((tool) => (
        <ToolButton
          key={tool.label}
          className={tool.className}
          title={tool.title}
          aria-label={tool.title}
          aria-pressed={tool.active && view ? tool.active(view.state) : undefined}
          disabled={!view || !editable || !tool.command(view.state)}
          // Keep focus in the editor so the caret stays where it was.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!view) return;
            tool.command(view.state, view.dispatch, view);
            view.focus();
          }}
        >
          {tool.label}
        </ToolButton>
      ))}
      {!compact && (
        <NativeSelect
          className="block-type"
          variant="unstyled"
          size="xs"
          title="Kind of block"
          aria-label="Kind of block"
          data={BLOCK_MENU}
          value={BLOCK_MENU.some((o) => o.value === current) ? current : "paragraph"}
          disabled={!view || !editable}
          onChange={(e) => {
            if (!view) return;
            setBlockType(schema.nodes[e.currentTarget.value])(view.state, view.dispatch, view);
            view.focus();
          }}
        />
      )}
    </div>
  );
}

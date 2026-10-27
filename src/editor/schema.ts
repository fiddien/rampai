import { Schema, type NodeSpec, type MarkSpec } from "prosemirror-model";

/**
 * Rampai's document is a flat list of blocks. Each block is one paragraph-sized
 * unit the writer can split, join, and move. Blocks carry a stable `id` so that
 * sync can tell a moved block apart from a deleted one plus a new one.
 */
export const BLOCK_TYPES = ["paragraph", "heading1", "heading2", "quote", "list_item"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const blockAttrs = { id: { default: null as string | null } };

function block(tag: string, extra: Record<string, string> = {}): NodeSpec {
  return {
    group: "block",
    content: "inline*",
    attrs: blockAttrs,
    defining: true,
    parseDOM: [{ tag, getAttrs: (dom) => ({ id: (dom as HTMLElement).getAttribute("data-block-id") }) }],
    toDOM: (node) => [tag, { ...extra, "data-block-id": node.attrs.id ?? "" }, 0],
  };
}

const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },
  paragraph: block("p"),
  heading1: block("h2"),
  heading2: block("h3"),
  quote: block("blockquote"),
  list_item: { ...block("div", { class: "list-item" }), parseDOM: [{ tag: "div.list-item" }] },
  text: { group: "inline" },
  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM: () => ["br"],
  },
};

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [{ tag: "strong" }, { tag: "b" }],
    toDOM: () => ["strong", 0],
  },
  em: {
    parseDOM: [{ tag: "em" }, { tag: "i" }],
    toDOM: () => ["em", 0],
  },
};

export const schema = new Schema({ nodes, marks });

/** Loro text style keys for each ProseMirror mark. */
export const MARK_KEYS: Record<string, string> = { strong: "bold", em: "italic" };
export const KEY_MARKS: Record<string, string> = { bold: "strong", italic: "em" };

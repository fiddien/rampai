import { LoroDoc, LoroMap, LoroText, type LoroMovableList } from "loro-crdt";
import type { Node, Mark } from "prosemirror-model";
import { schema, MARK_KEYS, KEY_MARKS, BLOCK_TYPES, type BlockType } from "../editor/schema";
import { newBlockId } from "../editor/blockIds";
import { planOrder } from "./order";

/**
 * How a draft lives in Loro:
 *
 *   blocks: MovableList<Map{ id: string, type: BlockType, text: Text }>
 *
 * A movable list keeps each block's identity when it moves, so an edit made on
 * another device follows the block to its new place. Inline formatting is
 * stored as rich-text marks on the block's Text, and a line break inside a
 * block is a "\n" character.
 */
export const BLOCKS = "blocks";
const STYLE_KEYS = Object.values(MARK_KEYS);

export function createDoc(peerId?: bigint | number): LoroDoc {
  const doc = new LoroDoc();
  if (peerId !== undefined) doc.setPeerId(peerId);
  doc.configTextStyle({ bold: { expand: "after" }, italic: { expand: "after" } });
  return doc;
}

export function blocksOf(doc: LoroDoc): LoroMovableList {
  return doc.getMovableList(BLOCKS);
}

type Ranges = Record<string, [number, number][]>;
interface InlineContent {
  text: string;
  ranges: Ranges;
}

function emptyRanges(): Ranges {
  return Object.fromEntries(STYLE_KEYS.map((k) => [k, []]));
}

function addRange(ranges: Ranges, key: string, start: number, end: number) {
  const list = ranges[key];
  const last = list[list.length - 1];
  if (last && last[1] === start) last[1] = end;
  else list.push([start, end]);
}

/** A ProseMirror block's text and formatting ranges, in UTF-16 offsets. */
export function inlineOf(block: Node): InlineContent {
  let text = "";
  const ranges = emptyRanges();
  block.forEach((child) => {
    if (child.isText) {
      const start = text.length;
      text += child.text ?? "";
      child.marks.forEach((m: Mark) => {
        const key = MARK_KEYS[m.type.name];
        if (key) addRange(ranges, key, start, text.length);
      });
    } else if (child.type === schema.nodes.hard_break) {
      text += "\n";
    }
  });
  return { text, ranges };
}

function rangesOfText(text: LoroText): Ranges {
  const ranges = emptyRanges();
  let pos = 0;
  for (const seg of text.toDelta()) {
    const insert = typeof seg.insert === "string" ? seg.insert : "";
    const attrs = (seg.attributes ?? {}) as Record<string, unknown>;
    for (const key of STYLE_KEYS) if (attrs[key]) addRange(ranges, key, pos, pos + insert.length);
    pos += insert.length;
  }
  return ranges;
}

function sameRanges(a: [number, number][], b: [number, number][]): boolean {
  return a.length === b.length && a.every((r, i) => r[0] === b[i][0] && r[1] === b[i][1]);
}

/** Bring a Loro Text in line with the target content using small edits. */
function syncText(target: InlineContent, text: LoroText) {
  const current = text.toString();
  if (current !== target.text) {
    let start = 0;
    const max = Math.min(current.length, target.text.length);
    while (start < max && current[start] === target.text[start]) start++;
    let endCur = current.length;
    let endTgt = target.text.length;
    while (endCur > start && endTgt > start && current[endCur - 1] === target.text[endTgt - 1]) {
      endCur--;
      endTgt--;
    }
    if (endCur > start) text.delete(start, endCur - start);
    if (endTgt > start) text.insert(start, target.text.slice(start, endTgt));
  }
  const actual = rangesOfText(text);
  for (const key of STYLE_KEYS) {
    if (sameRanges(actual[key], target.ranges[key])) continue;
    if (text.length > 0) text.unmark({ start: 0, end: text.length }, key);
    for (const [s, e] of target.ranges[key]) if (e > s) text.mark({ start: s, end: e }, key, true);
  }
}

function idAt(list: LoroMovableList, i: number): string {
  return (list.get(i) as LoroMap).get("id") as string;
}

/**
 * Write a ProseMirror document into Loro as the smallest set of changes:
 * deletions, insertions, block moves, type changes, and text edits.
 */
export function writeDocToLoro(pmDoc: Node, doc: LoroDoc): void {
  const list = blocksOf(doc);
  const targets: { id: string; node: Node }[] = [];
  pmDoc.forEach((node) => targets.push({ id: (node.attrs.id as string) ?? newBlockId(), node }));

  const current: string[] = [];
  for (let i = 0; i < list.length; i++) current.push(idAt(list, i));

  for (const op of planOrder(current, targets.map((t) => t.id))) {
    if (op.kind === "delete") list.delete(op.index, 1);
    else if (op.kind === "move") list.move(op.from, op.to);
    else {
      const map = list.insertContainer(op.index, new LoroMap());
      map.set("id", op.id);
      map.setContainer("text", new LoroText());
    }
  }

  targets.forEach(({ node }, i) => {
    const map = list.get(i) as LoroMap;
    if (map.get("type") !== node.type.name) map.set("type", node.type.name);
    syncText(inlineOf(node), map.get("text") as LoroText);
  });
}

function inlineNodes(text: LoroText): Node[] {
  const out: Node[] = [];
  for (const seg of text.toDelta()) {
    const insert = typeof seg.insert === "string" ? seg.insert : "";
    const attrs = (seg.attributes ?? {}) as Record<string, unknown>;
    const marks = Object.keys(attrs)
      .filter((k) => attrs[k] && KEY_MARKS[k])
      .map((k) => schema.marks[KEY_MARKS[k]].create());
    insert.split("\n").forEach((part, i) => {
      if (i > 0) out.push(schema.nodes.hard_break.create());
      if (part) out.push(schema.text(part, marks));
    });
  }
  return out;
}

/** Build the ProseMirror document that Loro currently describes. */
export function readDocFromLoro(doc: LoroDoc): Node {
  const list = blocksOf(doc);
  const blocks: Node[] = [];
  for (let i = 0; i < list.length; i++) {
    const map = list.get(i) as LoroMap;
    const raw = map.get("type") as string;
    const type = (BLOCK_TYPES as readonly string[]).includes(raw) ? (raw as BlockType) : "paragraph";
    const text = map.get("text") as LoroText | undefined;
    blocks.push(schema.node(type, { id: map.get("id") }, text ? inlineNodes(text) : []));
  }
  if (blocks.length === 0) blocks.push(schema.node("paragraph", { id: newBlockId() }));
  return schema.node("doc", null, blocks);
}

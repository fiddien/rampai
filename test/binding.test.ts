// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { splitBlock, toggleMark } from "prosemirror-commands";
import { schema } from "../src/editor/schema";
import { moveBlock, toggleBlock } from "../src/editor/commands";
import { readDocFromLoro } from "../src/sync/model";
import { device, blocks, blockStart, cursor, type, syncPair, type Device } from "./helpers";

function threeBlocks(): Device {
  const a = device(1);
  type(a, "One");
  splitBlock(a.view.state, a.view.dispatch);
  type(a, "Two");
  splitBlock(a.view.state, a.view.dispatch);
  type(a, "Three");
  return a;
}

describe("Loro binding", () => {
  test("every block carries a distinct id", () => {
    const a = threeBlocks();
    const ids: string[] = [];
    a.view.state.doc.forEach((n) => ids.push(n.attrs.id));
    expect(new Set(ids).size).toBe(3);
    expect(ids.every(Boolean)).toBe(true);
  });

  test("Loro holds what the editor shows", () => {
    const a = threeBlocks();
    expect(readDocFromLoro(a.doc).eq(a.view.state.doc)).toBe(true);
  });

  test("an edit on one device follows a block that another device moved", () => {
    const a = threeBlocks();
    const b = device(2, a.doc);
    expect(blocks(b)).toEqual(["One", "Two", "Three"]);

    cursor(a, blockStart(a, 0));
    moveBlock(1)(a.view.state, a.view.dispatch);
    moveBlock(1)(a.view.state, a.view.dispatch);
    expect(blocks(a)).toEqual(["Two", "Three", "One"]);

    cursor(b, blockStart(b, 0) + 3);
    type(b, " edited");
    expect(blocks(b)).toEqual(["One edited", "Two", "Three"]);

    syncPair(a, b);
    expect(blocks(a)).toEqual(["Two", "Three", "One edited"]);
    expect(blocks(b)).toEqual(["Two", "Three", "One edited"]);
  });

  test("the cursor stays in its block when a remote move carries the block away", () => {
    const a = threeBlocks();
    const b = device(2, a.doc);
    cursor(b, blockStart(b, 0) + 2);
    cursor(a, blockStart(a, 0));
    moveBlock(1)(a.view.state, a.view.dispatch);
    syncPair(a, b);
    const $head = b.view.state.selection.$head;
    expect($head.parent.textContent).toBe("One");
    expect($head.parentOffset).toBe(2);
  });

  test("concurrent typing in the same block merges", () => {
    const a = threeBlocks();
    const b = device(2, a.doc);
    cursor(a, blockStart(a, 1));
    type(a, "[A]");
    cursor(b, blockStart(b, 1) + 3);
    type(b, "[B]");
    syncPair(a, b);
    expect(blocks(a)[1]).toBe("[A]Two[B]");
    expect(blocks(b)).toEqual(blocks(a));
  });

  test("block types, bold, italic, and line breaks travel", () => {
    const a = threeBlocks();
    const b = device(2, a.doc);
    cursor(a, blockStart(a, 0));
    toggleBlock("heading1")(a.view.state, a.view.dispatch);
    const s = blockStart(a, 1);
    a.view.dispatch(a.view.state.tr.addMark(s, s + 3, schema.marks.strong.create()));
    a.view.dispatch(a.view.state.tr.addMark(s + 1, s + 3, schema.marks.em.create()));
    cursor(a, blockStart(a, 2) + 5);
    a.view.dispatch(a.view.state.tr.replaceSelectionWith(schema.nodes.hard_break.create()));
    syncPair(a, b);
    expect(b.view.state.doc.eq(a.view.state.doc)).toBe(true);
    expect(b.view.state.doc.child(0).type.name).toBe("heading1");
    expect(b.view.state.doc.child(2).childCount).toBe(2);
  });

  test("removing formatting travels too", () => {
    const a = threeBlocks();
    const s = blockStart(a, 1);
    a.view.dispatch(a.view.state.tr.addMark(s, s + 3, schema.marks.strong.create()));
    const b = device(2, a.doc);
    expect(b.view.state.doc.eq(a.view.state.doc)).toBe(true);
    a.view.dispatch(a.view.state.tr.removeMark(s, s + 3, schema.marks.strong));
    syncPair(a, b);
    expect(b.view.state.doc.eq(a.view.state.doc)).toBe(true);
    expect(b.view.state.doc.child(1).firstChild?.marks.length).toBe(0);
  });

  test("typing right after bold text stays bold on both devices", () => {
    const a = device(1);
    toggleMark(schema.marks.strong)(a.view.state, a.view.dispatch);
    type(a, "Bold");
    type(a, "er");
    const b = device(2, a.doc);
    expect(b.view.state.doc.eq(a.view.state.doc)).toBe(true);
    expect(b.view.state.doc.child(0).childCount).toBe(1);
  });

  test("deleting a block on one device while another edits it keeps the document valid", () => {
    const a = threeBlocks();
    const b = device(2, a.doc);
    const start = blockStart(a, 1) - 1;
    a.view.dispatch(a.view.state.tr.delete(start, start + a.view.state.doc.child(1).nodeSize));
    cursor(b, blockStart(b, 1));
    type(b, "x");
    syncPair(a, b);
    expect(blocks(a)).toEqual(blocks(b));
    expect(blocks(a)).toContain("One");
    expect(blocks(a)).toContain("Three");
  });

  test("random concurrent sessions converge", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let round = 0; round < 30; round++) {
      const a = threeBlocks();
      const b = device(2, a.doc);
      for (const d of [a, b, a, b]) {
        for (let step = 0; step < 6; step++) {
          const n = d.view.state.doc.childCount;
          const i = Math.floor(rand() * n);
          const r = rand();
          cursor(d, blockStart(d, i) + Math.floor(rand() * (d.view.state.doc.child(i).content.size + 1)));
          if (r < 0.35) type(d, "xyz".slice(0, 1 + Math.floor(rand() * 3)));
          else if (r < 0.55) moveBlock(rand() < 0.5 ? -1 : 1)(d.view.state, d.view.dispatch);
          else if (r < 0.7) splitBlock(d.view.state, d.view.dispatch);
          else if (r < 0.8) toggleBlock("quote")(d.view.state, d.view.dispatch);
          else if (r < 0.9 && d.view.state.selection.head > 1) {
            const h = d.view.state.selection.head;
            if (d.view.state.selection.$head.parentOffset > 0) d.view.dispatch(d.view.state.tr.delete(h - 1, h));
          } else if (n > 1) {
            const s = blockStart(d, i) - 1;
            d.view.dispatch(d.view.state.tr.delete(s, s + d.view.state.doc.child(i).nodeSize));
          }
        }
        if (rand() < 0.5) syncPair(a, b);
      }
      syncPair(a, b);
      expect(b.view.state.doc.eq(a.view.state.doc)).toBe(true);
      expect(readDocFromLoro(a.doc).eq(a.view.state.doc)).toBe(true);
    }
  });
});

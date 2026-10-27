// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { dropIndex, moveBlockTo } from "../src/editor/drag";
import { device, blocks, syncPair, blockStart, cursor, type } from "./helpers";
import { blocksOf } from "../src/sync/model";

const rects = [0, 1, 2, 3].map((i) => ({ top: i * 100, bottom: i * 100 + 80 }));

describe("dropIndex", () => {
  test("picks the nearest gap and reports the final index of the dragged block", () => {
    expect(dropIndex(rects, 10, 2)).toBe(0); // above everything
    expect(dropIndex(rects, 500, 0)).toBe(3); // below everything
    expect(dropIndex(rects, 150, 0)).toBe(1); // below the middle of block 1: gap 2, one slot closer after removal
    expect(dropIndex(rects, 150, 2)).toBe(2); // drop onto its own place
  });
});

function draft(texts: string[]) {
  const d = device(1);
  texts.forEach((t, i) => {
    if (i > 0) d.view.dispatch(d.view.state.tr.split(d.view.state.selection.head));
    type(d, t);
  });
  return d;
}

describe("moveBlockTo", () => {
  test("moves a block to a new index, keeping the others in order", () => {
    const d = draft(["a", "b", "c", "d"]);
    moveBlockTo(0, 2)(d.view.state, d.view.dispatch);
    expect(blocks(d)).toEqual(["b", "c", "a", "d"]);
    moveBlockTo(3, 0)(d.view.state, d.view.dispatch);
    expect(blocks(d)).toEqual(["d", "b", "c", "a"]);
  });

  test("refuses a no-op and out-of-range moves", () => {
    const d = draft(["a", "b"]);
    expect(moveBlockTo(1, 1)(d.view.state)).toBe(false);
    expect(moveBlockTo(0, 2)(d.view.state)).toBe(false);
    expect(moveBlockTo(-1, 0)(d.view.state)).toBe(false);
  });

  test("a drag keeps the block's identity, so another device's edit follows it", () => {
    const a = draft(["one", "two", "three"]);
    const b = device(2, a.doc);
    syncPair(a, b);
    moveBlockTo(0, 2)(a.view.state, a.view.dispatch);
    cursor(b, blockStart(b, 0) + 3);
    type(b, "!");
    syncPair(a, b);
    expect(blocks(a)).toEqual(["two", "three", "one!"]);
    expect(blocks(b)).toEqual(blocks(a));
    expect(blocksOf(a.doc).length).toBe(3);
  });
});

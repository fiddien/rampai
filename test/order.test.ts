import { describe, expect, test } from "vitest";
import { planOrder, longestIncreasingSubsequence, type OrderOp } from "../src/sync/order";

function apply(current: string[], ops: OrderOp[]): string[] {
  const out = [...current];
  for (const op of ops) {
    if (op.kind === "delete") out.splice(op.index, 1);
    else if (op.kind === "insert") out.splice(op.index, 0, op.id);
    else {
      out.splice(op.from, 1);
      out.splice(op.to, 0, op.id);
    }
  }
  return out;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("block order planning", () => {
  test("finds a longest increasing subsequence", () => {
    const seq = [3, 1, 2, 5, 4, 6];
    expect(longestIncreasingSubsequence(seq).map((i) => seq[i])).toEqual([1, 2, 4, 6]);
  });

  test("moving one block is one move", () => {
    const ops = planOrder(["a", "b", "c", "d"], ["b", "c", "d", "a"]);
    expect(ops).toEqual([{ kind: "move", from: 0, to: 3, id: "a" }]);
  });

  test("random permutations, insertions, and deletions reach the target", () => {
    const rand = seeded(42);
    for (let round = 0; round < 500; round++) {
      const n = Math.floor(rand() * 12);
      const current = Array.from({ length: n }, (_, i) => `b${i}`);
      const kept = current.filter(() => rand() > 0.2);
      const added = Array.from({ length: Math.floor(rand() * 3) }, (_, i) => `new${i}`);
      const target = shuffle([...kept, ...added], rand);
      const ops = planOrder(current, target);
      expect(apply(current, ops)).toEqual(target);
      const moves = ops.filter((o) => o.kind === "move").length;
      const lis = longestIncreasingSubsequence(target.filter((id) => kept.includes(id)).map((id) => current.indexOf(id))).length;
      expect(moves).toBeLessThanOrEqual(kept.length - lis);
    }
  });
});

/**
 * Plans the fewest block moves that turn the current order into the target
 * order. Blocks on the longest increasing subsequence stay where they are;
 * only the others move. This matters for sync: a block dragged to the end is
 * recorded as one move of that block, not as every other block shifting up.
 */

/** Indices (into `seq`) of one longest strictly increasing subsequence. */
export function longestIncreasingSubsequence(seq: number[]): number[] {
  const tails: number[] = [];
  const prev: number[] = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const result: number[] = [];
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k !== -1) {
    result.push(k);
    k = prev[k];
  }
  return result.reverse();
}

export type OrderOp =
  | { kind: "delete"; index: number; id: string }
  | { kind: "insert"; index: number; id: string }
  | { kind: "move"; from: number; to: number; id: string };

/**
 * Operations that transform `current` into `target`, applied in sequence.
 * `move.to` is the block's final index after the move.
 */
export function planOrder(current: string[], target: string[]): OrderOp[] {
  const ops: OrderOp[] = [];
  const wanted = new Set(target);
  const cur = [...current];

  for (let i = cur.length - 1; i >= 0; i--) {
    if (!wanted.has(cur[i])) {
      ops.push({ kind: "delete", index: i, id: cur[i] });
      cur.splice(i, 1);
    }
  }

  const present = new Set(cur);
  const existing = target.filter((id) => present.has(id));
  const positions = existing.map((id) => cur.indexOf(id));
  const stable = new Set(longestIncreasingSubsequence(positions).map((i) => existing[i]));

  for (let j = 0; j < target.length; j++) {
    const id = target[j];
    const anchor = j === 0 ? 0 : cur.indexOf(target[j - 1]) + 1;
    if (!present.has(id)) {
      ops.push({ kind: "insert", index: anchor, id });
      cur.splice(anchor, 0, id);
      present.add(id);
      continue;
    }
    if (stable.has(id)) continue;
    const from = cur.indexOf(id);
    const to = from < anchor ? anchor - 1 : anchor;
    if (from !== to) {
      ops.push({ kind: "move", from, to, id });
      cur.splice(from, 1);
      cur.splice(to, 0, id);
    }
  }
  return ops;
}

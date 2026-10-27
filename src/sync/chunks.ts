import type { Transport } from "./transport";

/**
 * Data channels carry messages of limited size, and a draft snapshot can be
 * larger. This splits each message into pieces and puts them back together.
 * Pieces arrive in order on a reliable channel, so a one-byte flag is enough:
 * 1 marks the last piece of a message.
 */
export const CHUNK = 16 * 1024;

export function chunked(inner: Transport, size = CHUNK): Transport {
  return {
    send(data) {
      for (let at = 0; at === 0 || at < data.length; at += size) {
        const end = Math.min(at + size, data.length);
        const piece = new Uint8Array(1 + end - at);
        piece[0] = end === data.length ? 1 : 0;
        piece.set(data.subarray(at, end), 1);
        inner.send(piece);
      }
    },
    onMessage(listener) {
      let parts: Uint8Array[] = [];
      return inner.onMessage((piece) => {
        parts.push(piece.subarray(1));
        if (piece[0] !== 1) return;
        const whole = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) {
          whole.set(p, at);
          at += p.length;
        }
        parts = [];
        listener(whole);
      });
    },
  };
}

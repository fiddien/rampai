import type { Transport } from "./transport";

/**
 * Data channels carry messages of limited size, and a draft snapshot can be
 * larger. This splits each message into pieces and puts them back together.
 * Pieces arrive in order on a reliable channel, so a one-byte flag is enough:
 * 1 marks the last piece of a message.
 */
export const CHUNK = 16 * 1024;
/**
 * Pieces are put back together before the message is opened and checked, so
 * a message larger than this is dropped rather than buffered without end.
 */
export const MAX_MESSAGE = 64 * 1024 * 1024;

export function chunked(inner: Transport, size = CHUNK, maxMessage = MAX_MESSAGE): Transport {
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
      let total = 0;
      let dropping = false;
      return inner.onMessage((piece) => {
        const last = piece[0] === 1;
        if (!dropping) {
          total += piece.length - 1;
          if (total > maxMessage) {
            // Too large: forget what came so far and skip to the end of this message.
            dropping = true;
            parts = [];
          } else {
            parts.push(piece.subarray(1));
          }
        }
        if (!last) return;
        if (dropping) {
          dropping = false;
          total = 0;
          return;
        }
        total = 0;
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

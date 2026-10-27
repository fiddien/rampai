import { sendUpdate } from "./peer";
import { BroadcastChannelTransport, encrypted, type Transport } from "./transport";

/**
 * Tells other tabs of this browser that a draft changed underneath them (from
 * a linked device or a restored backup), so a tab with that draft open merges
 * the change instead of overwriting it at its next save.
 */
export function tabNotifier(key: CryptoKey): { send(id: string, update: Uint8Array): void; close(): void } {
  const channels = new Map<string, { raw: BroadcastChannelTransport; sealed: Transport }>();
  return {
    send(id, update) {
      if (typeof BroadcastChannel === "undefined") return;
      let tab = channels.get(id);
      if (!tab) {
        const raw = new BroadcastChannelTransport(`rampai:draft:${id}`);
        channels.set(id, (tab = { raw, sealed: encrypted(raw, key) }));
      }
      sendUpdate(tab.sealed, update);
    },
    close() {
      // Let sends already under way go out first.
      setTimeout(() => {
        channels.forEach((t) => t.raw.close());
        channels.clear();
      }, 1000);
    },
  };
}

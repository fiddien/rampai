import { seal, open } from "./crypto";

/**
 * A transport moves opaque bytes between a writer's devices. Rampai syncs over
 * the local network with no server in between; the transports here are the
 * pieces the web build can use today:
 *
 * - BroadcastChannelTransport: tabs of the same browser on one device.
 * - MemoryLink: two simulated devices in one page, with an online switch.
 *
 * The native app will add a same-network transport behind the same interface.
 */
export interface Transport {
  send(data: Uint8Array): void;
  onMessage(listener: (data: Uint8Array) => void): () => void;
}

type Listener = (data: Uint8Array) => void;

class Listeners {
  private set = new Set<Listener>();
  add(l: Listener) {
    this.set.add(l);
    return () => this.set.delete(l);
  }
  emit(data: Uint8Array) {
    this.set.forEach((l) => l(data));
  }
}

export class BroadcastChannelTransport implements Transport {
  private channel: BroadcastChannel;
  private listeners = new Listeners();
  constructor(name: string) {
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = (e) => this.listeners.emit(new Uint8Array(e.data as ArrayBuffer));
  }
  send(data: Uint8Array) {
    this.channel.postMessage(data.slice().buffer);
  }
  onMessage(listener: Listener) {
    return this.listeners.add(listener);
  }
}

/**
 * Two endpoints joined by a simulated network. While offline, messages wait
 * in a queue and are delivered when the link comes back, as they would be when
 * a phone rejoins the home network.
 */
export class MemoryLink {
  readonly a: Transport;
  readonly b: Transport;
  private online = true;
  private queue: { to: Listeners; data: Uint8Array }[] = [];
  private onReconnect = new Set<() => void>();

  constructor() {
    const la = new Listeners();
    const lb = new Listeners();
    const deliver = (to: Listeners, data: Uint8Array) => {
      if (this.online) queueMicrotask(() => to.emit(data));
      else this.queue.push({ to, data });
    };
    this.a = { send: (d) => deliver(lb, d), onMessage: (l) => la.add(l) };
    this.b = { send: (d) => deliver(la, d), onMessage: (l) => lb.add(l) };
  }

  get isOnline() {
    return this.online;
  }

  setOnline(online: boolean) {
    this.online = online;
    if (!online) return;
    const pending = this.queue;
    this.queue = [];
    pending.forEach(({ to, data }) => to.emit(data));
    this.onReconnect.forEach((f) => f());
  }

  whenReconnected(f: () => void) {
    this.onReconnect.add(f);
  }
}

/** Wraps a transport so every message is sealed with the shared key, in order. */
export function encrypted(inner: Transport, key: CryptoKey): Transport {
  let sending = Promise.resolve();
  let receiving = Promise.resolve();
  return {
    send(data) {
      sending = sending.then(async () => inner.send(await seal(key, data)));
    },
    onMessage(listener) {
      return inner.onMessage((sealed) => {
        receiving = receiving.then(async () => {
          try {
            listener(await open(key, sealed));
          } catch {
            // A message that fails to open was tampered with or sealed with
            // another key. It is dropped, never applied.
          }
        });
      });
    },
  };
}

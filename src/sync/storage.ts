import type { LoroDoc } from "loro-crdt";
import type { Store } from "./library";

/**
 * Drafts are saved on the device as Loro snapshots. This tracer bullet uses
 * localStorage; the native app will store them in its own encrypted files.
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** A draft's saved snapshot from a store, without opening an editor on it. */
export function readSnapshot(store: Pick<Store, "getItem">, key: string): Uint8Array | undefined {
  try {
    const saved = store.getItem(key);
    return saved ? fromBase64(saved) : undefined;
  } catch {
    return undefined;
  }
}

export function writeSnapshot(store: Pick<Store, "setItem">, key: string, bytes: Uint8Array): void {
  store.setItem(key, toBase64(bytes));
}

export function loadSnapshot(doc: LoroDoc, key: string): boolean {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return false;
    doc.import(fromBase64(saved));
    return true;
  } catch {
    return false;
  }
}

export interface Autosave {
  /** Save now if a save is waiting. Call before the page goes away. */
  flush(): void;
  stop(): void;
}

/**
 * Saves the draft shortly after it changes. `shouldSave` lets the caller skip a
 * save, for example when the draft was deleted in another tab.
 */
export function autosave(doc: LoroDoc, key: string, onSaved: () => void = () => {}, delayMs = 400, shouldSave: () => boolean = () => true): Autosave {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timer = undefined;
    if (!shouldSave()) return;
    try {
      const bytes = doc.export({ mode: "snapshot" });
      localStorage.setItem(key, toBase64(bytes));
      onSaved();
    } catch {
      // Storage can be full or blocked; the draft stays in memory.
    }
  };
  const unsubscribe = doc.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  });
  return {
    flush() {
      if (timer === undefined) return;
      clearTimeout(timer);
      save();
    },
    stop() {
      clearTimeout(timer);
      unsubscribe();
    },
  };
}

/**
 * Where the library and its index live. It is the browser's localStorage when
 * that works; when storage is blocked or full, values are kept in memory for
 * this visit so the app still opens and a new draft still appears.
 */
export function deviceStore(): Store {
  const memory = new Map<string, string>();
  const ls = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  return {
    getItem(k) {
      if (memory.has(k)) return memory.get(k) ?? null;
      try {
        return ls ? ls.getItem(k) : null;
      } catch {
        return null;
      }
    },
    setItem(k, v) {
      try {
        if (!ls) throw new Error("no storage");
        ls.setItem(k, v);
        memory.delete(k);
      } catch {
        memory.set(k, v);
      }
    },
    removeItem(k) {
      memory.delete(k);
      try {
        ls?.removeItem(k);
      } catch {
        // Nothing to remove.
      }
    },
    get length() {
      try {
        return ls ? ls.length : 0;
      } catch {
        return 0;
      }
    },
    key(i) {
      try {
        return ls ? ls.key(i) : null;
      } catch {
        return null;
      }
    },
  };
}

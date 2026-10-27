import type { LoroDoc } from "loro-crdt";
import type { Store } from "./library";

/**
 * Drafts are saved on the device as Loro snapshots. This tracer bullet uses
 * localStorage; the native app will store them in its own encrypted files.
 */
export function loadSnapshot(doc: LoroDoc, key: string): boolean {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return false;
    doc.import(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)));
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
 * save, for example when the draft was deleted in another tab. `onFailed` is
 * told when a save does not reach storage (full or blocked), so the writer is
 * never shown "saved" for words that were not.
 */
export function autosave(
  doc: LoroDoc,
  key: string,
  onSaved: () => void = () => {},
  delayMs = 400,
  shouldSave: () => boolean = () => true,
  onFailed: (error: unknown) => void = () => {},
): Autosave {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    timer = undefined;
    if (!shouldSave()) return;
    try {
      const bytes = doc.export({ mode: "snapshot" });
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      localStorage.setItem(key, btoa(binary));
    } catch (error) {
      // Storage can be full or blocked; the draft stays in memory, and the writer is told.
      onFailed(error);
      return;
    }
    onSaved();
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
 * Whether this browser keeps what Rampai saves across a reload. It does not
 * when storage is blocked (some privacy settings) or full.
 */
export function storagePersists(): boolean {
  try {
    const probe = "rampai:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
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

import type { LoroDoc } from "loro-crdt";

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

export function autosave(doc: LoroDoc, key: string, onSaved: () => void = () => {}, delayMs = 400): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    try {
      const bytes = doc.export({ mode: "snapshot" });
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      localStorage.setItem(key, btoa(binary));
      onSaved();
    } catch {
      // Storage can be full or blocked; the draft stays in memory.
    }
  };
  return doc.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  });
}

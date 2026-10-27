import { useCallback, useSyncExternalStore } from "react";
import { chunked } from "../sync/chunks";
import { LibrarySync } from "../sync/librarySync";
import type { DocBinding } from "../sync/binding";
import type { Store } from "../sync/library";
import { encrypted } from "../sync/transport";
import { tabNotifier } from "../sync/tabs";
import type { DeviceLink } from "../sync/webrtc";

const WRONG_KEY_MS = 6000;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface LinkStatus {
  state: "linked" | "closed";
  /** One sentence for the Link page. */
  text: string;
  /** Both libraries are level, and edits now flow as they are typed. */
  live: boolean;
}

/**
 * A link to another device that lives as long as the app is open, not just
 * while the Link page is. Open drafts attach to it, so edits flow between the
 * devices as they are typed.
 */
export class LinkSession {
  private sync: LibrarySync;
  private status: LinkStatus = { state: "linked", text: "Linked. Looking for drafts to exchange…", live: false };
  private listeners = new Set<() => void>();
  private ended = false;
  private wrong: ReturnType<typeof setTimeout>;
  private tabs: ReturnType<typeof tabNotifier>;

  constructor(
    store: Store,
    key: CryptoKey,
    private link: DeviceLink,
  ) {
    let accepted = false;
    let settled = false;
    const n = { received: 0, created: 0, deleted: 0, unsaved: 0 };
    const summary = () => {
      const parts: string[] = [];
      if (n.received) parts.push(`${plural(n.received, "update", "updates")} received (${plural(n.created, "new draft", "new drafts")})`);
      if (n.deleted) parts.push(`${plural(n.deleted, "draft", "drafts")} deleted here, as on the other device`);
      if (n.unsaved) parts.push(`${plural(n.unsaved, "draft", "drafts")} could not be saved, because this device's storage is full`);
      const level = parts.length ? `Up to date. ${parts.join("; ")}.` : "Linked. Both devices already have the same drafts.";
      return `${level} Edits now go between the devices as you type, while both stay open.`;
    };
    const report = () => this.set({ state: "linked", text: settled ? summary() : `Receiving… ${plural(n.received, "update", "updates")} so far.`, live: settled });
    this.wrong = setTimeout(() => {
      if (!accepted) this.set({ state: "linked", text: "These devices were made with different recovery words, so nothing can be shared. Check the words on both.", live: false });
    }, WRONG_KEY_MS);
    this.tabs = tabNotifier(key);
    this.sync = new LibrarySync(
      store,
      encrypted(chunked(link.transport), key),
      {
        onActivity() {
          accepted = true;
        },
        onUpdate(_id, isNew) {
          n.received += 1;
          if (isNew) n.created += 1;
          report();
        },
        onDeleted() {
          n.deleted += 1;
          report();
        },
        onStorageFull() {
          n.unsaved += 1;
          report();
        },
        onSettled() {
          settled = true;
          report();
        },
      },
      // A draft open in another tab of this browser hears about it too, so that tab's next save does not overwrite it.
      (id, update) => this.tabs.send(id, update),
    );
    link.onClosed(() => this.end("The link has closed. Your drafts are saved on this device."));
    this.sync.start();
  }

  attach(id: string, binding: DocBinding): () => void {
    return this.ended ? () => {} : this.sync.attach(id, binding);
  }

  getStatus = (): LinkStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** End the link from this side. */
  close(): void {
    this.end("Unlinked. Your drafts are saved on this device.");
    this.link.close();
  }

  private end(text: string) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.wrong);
    this.sync.stop();
    this.tabs.close();
    this.set({ state: "closed", text, live: false });
    if (current === this) setCurrent(null);
  }

  private set(status: LinkStatus) {
    this.status = status;
    this.listeners.forEach((l) => l());
  }
}

// ——— The one session this app has, if any ———

let current: LinkSession | null = null;
const watchers = new Set<() => void>();

function setCurrent(session: LinkSession | null) {
  current = session;
  watchers.forEach((w) => w());
}

/** Start a session over a fresh link, ending any earlier one. */
export function startSession(store: Store, key: CryptoKey, link: DeviceLink): LinkSession {
  current?.close();
  const session = new LinkSession(store, key, link);
  setCurrent(session);
  return session;
}

export function currentSession(): LinkSession | null {
  return current;
}

/** The current session, re-rendering when one starts or ends. */
export function useLinkSession(): LinkSession | null {
  return useSyncExternalStore(
    (onChange) => {
      watchers.add(onChange);
      return () => watchers.delete(onChange);
    },
    () => current,
  );
}

const IDLE: LinkStatus = { state: "closed", text: "", live: false };

/** A session's status, kept current. */
export function useLinkStatus(session: LinkSession | null): LinkStatus {
  const subscribe = useCallback((onChange: () => void) => session?.subscribe(onChange) ?? (() => {}), [session]);
  return useSyncExternalStore(subscribe, () => session?.getStatus() ?? IDLE);
}

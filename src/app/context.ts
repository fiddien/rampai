import { createContext, useContext } from "react";
import type { KeySource } from "../sync/keys";
import type { Store } from "../sync/library";

export type Session = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface Device {
  key: CryptoKey;
  source: KeySource;
}

export interface AppContextValue {
  store: Store;
  session: Session;
  /** The device key, once loaded; undefined until the writer sets one up. */
  device: Device | undefined;
  /** Read the device key again after a page saved a new one. */
  refreshDevice(): Promise<void>;
  /** Whether this browser keeps what Rampai saves across a reload. */
  persists: boolean;
  go(hash: string): void;
  /** A short message at the top of the window. */
  say(message: string): void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp outside <App>");
  return value;
}

/** Session storage, or memory when the browser blocks it. */
export function sessionStore(): Session {
  try {
    sessionStorage.getItem("rampai:probe");
    return sessionStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
}

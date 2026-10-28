import { useEffect, useState } from "react";

/** The page is the part of the address after #. Moving between pages never reloads. */
export function useHash(): string {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export const go = (hash: string) => {
  location.hash = hash;
};

export type Route =
  | { page: "two-devices" }
  | { page: "welcome" }
  | { page: "recovery" }
  | { page: "confirm" }
  | { page: "pair" }
  | { page: "link"; code?: string }
  | { page: "backup" }
  | { page: "draft"; id: string }
  | { page: "drafts" };

export function parseRoute(hash: string): Route {
  if (hash === "#two-devices") return { page: "two-devices" };
  if (hash === "#/welcome") return { page: "welcome" };
  if (hash === "#/recovery") return { page: "recovery" };
  if (hash === "#/recovery/confirm") return { page: "confirm" };
  if (hash === "#/pair") return { page: "pair" };
  if (hash === "#/link") return { page: "link" };
  // A link scanned from another device's QR code carries its code.
  const code = /^#\/link\?code=([\w.:~!*%-]+)$/.exec(hash)?.[1];
  if (code) {
    try {
      return { page: "link", code: decodeURIComponent(code) };
    } catch {
      return { page: "link" };
    }
  }
  if (hash === "#/backup") return { page: "backup" };
  const id = /^#\/draft\/([\w-]+)$/.exec(hash)?.[1];
  if (id) return { page: "draft", id };
  return { page: "drafts" };
}

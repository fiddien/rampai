import { Anchor } from "@mantine/core";
import type { ReactNode } from "react";
import { useLinkSession, useLinkStatus } from "../app/linkSession";

export type NavItem = "drafts" | "link" | "backup" | "words";

const ITEMS: { id: NavItem; label: string; href: string }[] = [
  { id: "drafts", label: "Drafts", href: "#/" },
  { id: "link", label: "Link a device", href: "#/link" },
  { id: "backup", label: "Backup", href: "#/backup" },
  { id: "words", label: "Recovery words", href: "#/welcome" },
];

/**
 * The bar on every page except the writing page: the wordmark, and the places
 * a writer goes. The current page is marked for sight and for screen readers;
 * a small dot on Recovery words says this device has none yet.
 */
export function NavBar({ active, wordsMissing }: { active?: NavItem; wordsMissing?: boolean }) {
  const linked = useLinkStatus(useLinkSession()).state === "linked";
  return (
    <header className="toolbar nav">
      <a className="brand" href="#/">
        <b>Rampai</b>
      </a>
      <nav className="nav-links" aria-label="Rampai">
        {ITEMS.map((item) => (
          <Anchor key={item.id} className="nav-link" href={item.href} underline="never" aria-current={item.id === active ? "page" : undefined}>
            {item.label}
            {item.id === "link" && linked && (
              <>
                <span className="nav-dot linked" />
                <span className="visually-hidden"> (linked now)</span>
              </>
            )}
            {item.id === "words" && wordsMissing && (
              <>
                <span className="nav-dot" />
                <span className="visually-hidden"> (not set up yet)</span>
              </>
            )}
          </Anchor>
        ))}
      </nav>
    </header>
  );
}

/** A first-time writer sees only the wordmark, since there is nowhere else to go yet. */
export function BareBar() {
  return (
    <header className="toolbar">
      <a className="brand" href="#/welcome">
        <b>Rampai</b>
      </a>
    </header>
  );
}

/** The writing page has one way out, and nothing else beside the writer's words. */
export function BackBar({ children }: { children?: ReactNode }) {
  return (
    <header className="toolbar chrome">
      <a className="back" href="#/" title="Back to your drafts">
        ‹ Drafts
      </a>
      {children}
    </header>
  );
}

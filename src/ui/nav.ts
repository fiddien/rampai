export type NavItem = "drafts" | "link" | "backup" | "words";

const ITEMS: { id: NavItem; label: string; href: string }[] = [
  { id: "drafts", label: "Drafts", href: "#/" },
  { id: "link", label: "Link a device", href: "#/link" },
  { id: "backup", label: "Backup", href: "#/backup" },
  { id: "words", label: "Recovery words", href: "#/welcome" },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * The bar on every page except the writing page: the wordmark, and the places a writer goes. The current page is marked for sight and for screen
 * readers; a small dot on Recovery words says this device has none yet.
 */
export function navBar(active?: NavItem, opts: { wordsMissing?: boolean } = {}): HTMLElement {
  const header = el("header", "toolbar nav");
  const mark = el("a", "brand");
  mark.href = "#/";
  mark.innerHTML = "<b>Rampai</b>";
  const nav = el("nav", "nav-links");
  nav.setAttribute("aria-label", "Rampai");
  for (const item of ITEMS) {
    const link = el("a", "nav-link", item.label);
    link.href = item.href;
    if (item.id === active) link.setAttribute("aria-current", "page");
    if (item.id === "words" && opts.wordsMissing) {
      link.append(el("span", "nav-dot"));
      const note = el("span", "visually-hidden", " (not set up yet)");
      link.append(note);
    }
    nav.append(link);
  }
  header.append(mark, nav);
  return header;
}

/** The writing page has one way out, and nothing else beside the writer's words. */
export function backBar(): HTMLElement {
  const header = el("header", "toolbar chrome");
  const back = el("a", "back", "‹ Drafts");
  back.href = "#/";
  back.title = "Back to your drafts";
  header.append(back);
  return header;
}

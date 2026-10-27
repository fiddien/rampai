import { createDraft, deleteDraft, listDrafts, partitionDrafts, type DraftEntry, type Store } from "../sync/library";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Calendar days in the writer's own time zone, so 23:00 yesterday reads as "yesterday". */
export function editedLabel(updatedAt: number, now = Date.now()): string {
  const midnight = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((midnight(now) - midnight(updatedAt)) / 86_400_000);
  if (days < 1) return "edited today";
  if (days === 1) return "edited yesterday";
  return `edited ${new Date(updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** The home screen: every draft saved on this device, and a way to begin a new one. */
export function libraryPage(root: HTMLElement, store: Store, open: (id: string) => void) {
  const header = el("header", "toolbar");
  const brand = el("a", "brand");
  brand.href = "#/";
  brand.innerHTML = "<b>Rampai</b> · a gentle ramp to clear thinking";
  header.append(brand);

  const page = el("main", "page home");
  const heading = el("h1", "home-title", "Your drafts");
  const start = el("button", "primary", "Start a new draft");
  start.type = "button";
  start.addEventListener("click", () => open(createDraft(store).id));
  const list = el("ul", "drafts");
  list.setAttribute("aria-label", "Drafts");
  const finishedHeading = el("h2", "home-sub", "Finished");
  const finishedList = el("ul", "drafts");
  finishedList.setAttribute("aria-label", "Finished pieces");
  page.append(heading, start, list, finishedHeading, finishedList);

  const note = el("p", "keys");
  note.innerHTML = 'Drafts stay on this device. <a href="#two-devices">See two devices sync</a>.';
  root.append(header, page, note);

  function row(d: DraftEntry): HTMLLIElement {
    const li = el("li", "draft-row");
    const link = el("a", "draft-link");
    link.href = `#/draft/${d.id}`;
    link.append(el("span", "draft-title", d.title), el("span", "draft-meta", `${d.words} ${d.words === 1 ? "word" : "words"} · ${editedLabel(d.updatedAt)}`));
    const remove = el("button", "tool", "Delete");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete “${d.title}”`);
    remove.addEventListener("click", () => {
      if (!confirm(`Delete “${d.title}”? It cannot be brought back.`)) return;
      deleteDraft(store, d.id);
      render();
      start.focus();
    });
    li.append(link, remove);
    return li;
  }

  function render() {
    const { inProgress, finished } = partitionDrafts(listDrafts(store));
    list.replaceChildren(...inProgress.map(row));
    finishedList.replaceChildren(...finished.map(row));
    finishedHeading.hidden = finishedList.hidden = finished.length === 0;
    if (inProgress.length === 0 && finished.length === 0) {
      const empty = el("li", "draft-empty", "Nothing here yet. Your first one is allowed to be bad.");
      list.append(empty);
    }
  }
  render();
  // Another tab may add, delete or finish a draft.
  window.addEventListener("storage", (e) => e.key?.startsWith("rampai:") && render());
}

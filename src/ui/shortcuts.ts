import { ALT, MOD } from "./toolbar";

const ROWS: [string, string][] = [
  [`${MOD} B`, "Bold"],
  [`${MOD} I`, "Italic"],
  [`${MOD} ${ALT} 1`, "Heading"],
  [`${MOD} ${ALT} 2`, "Subheading"],
  [`${MOD} Shift Q`, "Quote"],
  [`${MOD} Shift L`, "List"],
  [`${MOD} Shift N`, "Plain text"],
  [`${ALT} ↑  ${ALT} ↓`, "Move this block up or down"],
  [`${MOD} Shift O`, "Outline: move whole sections"],
  [`${MOD} /`, "This panel"],
];

const TYPING: [string, string][] = [
  ["# ", "Heading"],
  ["## ", "Subheading"],
  ["> ", "Quote"],
  ["- ", "List"],
];

export interface ShortcutsPanel {
  button: HTMLButtonElement;
  dialog: HTMLElement;
  open(): void;
  close(): void;
}

/** The key hints, kept out of the way until asked for. */
export function buildShortcuts(): ShortcutsPanel {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tool shortcuts-open";
  button.textContent = "?";
  button.title = `Keyboard shortcuts (${MOD}+/)`;
  button.setAttribute("aria-label", "Keyboard shortcuts");
  button.setAttribute("aria-haspopup", "dialog");

  const dialog = document.createElement("dialog");
  dialog.className = "shortcuts";
  dialog.setAttribute("aria-labelledby", "shortcuts-title");
  const heading = document.createElement("h2");
  heading.id = "shortcuts-title";
  heading.textContent = "Keyboard shortcuts";
  const table = document.createElement("dl");
  const add = (rows: [string, string][], into: HTMLElement) => {
    for (const [keys, what] of rows) {
      const dt = document.createElement("dt");
      for (const k of keys.split(/\s{1,2}/).filter(Boolean)) {
        const kbd = document.createElement("kbd");
        kbd.textContent = k;
        dt.append(kbd, " ");
      }
      const dd = document.createElement("dd");
      dd.textContent = what;
      into.append(dt, dd);
    }
  };
  add(ROWS, table);
  const typing = document.createElement("p");
  typing.className = "soft";
  typing.textContent = "Or start a line with " + TYPING.map(([k, w]) => `“${k.trim()}” for ${w.toLowerCase()}`).join(", ") + ".";
  const note = document.createElement("p");
  note.className = "soft";
  note.textContent = "Pasting is switched off on purpose: the words here are yours.";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "tool-text";
  close.textContent = "Close";
  dialog.append(heading, table, typing, note, close);

  const open = () => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    close.focus();
  };
  const hide = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    button.focus();
  };
  button.addEventListener("click", open);
  close.addEventListener("click", hide);
  // A click on the backdrop (the dialog itself, outside its content) closes it.
  dialog.addEventListener("click", (e) => e.target === dialog && hide());
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    }
  });
  return { button, dialog, open, close: hide };
}

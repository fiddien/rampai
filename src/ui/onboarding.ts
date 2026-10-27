import { generateKey } from "../sync/crypto";
import { deriveKey, saveDeviceKey } from "../sync/keys";
import { checkPassphrase, confirmMatches, confirmPositions, generatePassphrase } from "../sync/passphrase";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Setting up a writer's devices. The recovery words are shown once and kept
 * only in this tab's session until the writer proves they wrote them down;
 * then the key made from them is what the device keeps. Pasting is allowed in
 * these fields: they hold a passphrase, not the writer's own prose.
 */
const PENDING = "rampai:pending-words";
const POSITIONS = "rampai:pending-positions";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function shell(root: HTMLElement, title: string): HTMLElement {
  const header = el("header", "toolbar");
  const brand = el("a", "brand");
  brand.innerHTML = "<b>Rampai</b> · a gentle ramp to clear thinking";
  brand.href = "#/welcome";
  header.append(brand);
  const page = el("main", "page onboarding");
  page.append(el("h1", "home-title", title));
  root.append(header, page);
  return page;
}

function button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = el("button", primary ? "primary" : "tool-text", label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

const pending = (session: Pick<Storage, "getItem">) => {
  const raw = session.getItem(PENDING);
  return raw ? (JSON.parse(raw) as string[]) : undefined;
};

export function welcomePage(root: HTMLElement, store: Store, session: Store, go: (hash: string) => void) {
  const page = shell(root, "Welcome");
  page.append(
    el("p", "lede", "Rampai is for writing in your own words. Your drafts stay on your own devices and sync between them directly, with no server in between."),
    el("p", "", "To link your devices, Rampai gives you seven recovery words. They make the key that keeps your drafts private, and they are the only way to add another device or get your drafts back."),
  );
  const actions = el("div", "actions");
  actions.append(
    button("Start my writing", true, () => {
      session.setItem(PENDING, JSON.stringify(generatePassphrase()));
      session.removeItem(POSITIONS);
      go("#/recovery");
    }),
    button("I already write with Rampai on another device", false, () => go("#/pair")),
  );
  const later = button("Not now: write on this device only", false, async () => {
    await saveDeviceKey(store, await generateKey(), "random");
    go("#/");
  });
  later.classList.add("quiet");
  page.append(actions, later);
}

export function recoveryPage(root: HTMLElement, session: Store, go: (hash: string) => void) {
  const words = pending(session);
  if (!words) return go("#/welcome");
  const page = shell(root, "Your recovery words");
  const list = el("ol", "words");
  list.setAttribute("aria-label", "Recovery words, in order");
  words.forEach((w) => list.append(el("li", "", w)));
  page.append(
    list,
    el("p", "", "Write these seven words down, in this order, and keep them somewhere safe. Rampai cannot show them again or recover them for you."),
    el("p", "soft", "Anyone who has them can read your drafts. Do not store them with your devices."),
  );
  page.append(button("I wrote them down", true, () => go("#/recovery/confirm")));
}

export function confirmPage(root: HTMLElement, store: Store, session: Store, go: (hash: string) => void) {
  const words = pending(session);
  if (!words) return go("#/welcome");
  let positions: number[] = JSON.parse(session.getItem(POSITIONS) ?? "null") ?? confirmPositions();
  session.setItem(POSITIONS, JSON.stringify(positions));

  const page = shell(root, "Check your words");
  page.append(el("p", "", "To be sure you wrote them down, type these words from your list."));
  const form = el("form", "words-form");
  const inputs = positions.map((p) => {
    const label = el("label", "", `Word ${p + 1}`);
    const input = el("input");
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    label.append(input);
    form.append(label);
    return input;
  });
  const message = el("p", "form-message");
  message.setAttribute("role", "alert");
  const submit = el("button", "primary", "Confirm");
  submit.type = "submit";
  form.append(message, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!confirmMatches(words, positions, inputs.map((i) => i.value))) {
      message.textContent = "Those do not match your words. Look at your notes, or go back to see the words again.";
      return;
    }
    submit.disabled = true;
    message.textContent = "Making your key…";
    await saveDeviceKey(store, await deriveKey(words), "passphrase");
    session.removeItem(PENDING);
    session.removeItem(POSITIONS);
    go("#/");
  });
  page.append(form, button("Show my words again", false, () => go("#/recovery")));
  inputs[0]?.focus();
  positions = positions.slice();
}

export function pairPage(root: HTMLElement, store: Store, go: (hash: string) => void) {
  const page = shell(root, "Add this device");
  page.append(el("p", "", "Type the seven recovery words from your other device, in order."));
  const form = el("form", "words-form");
  const label = el("label", "", "Recovery words");
  const input = el("input");
  input.type = "text";
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.placeholder = "seven words, separated by spaces";
  label.append(input);
  const message = el("p", "form-message");
  message.setAttribute("role", "alert");
  const submit = el("button", "primary", "Add this device");
  submit.type = "submit";
  form.append(label, message, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const check = checkPassphrase(input.value);
    if (!check.ok) {
      message.textContent = check.problem ?? "";
      return;
    }
    submit.disabled = true;
    message.textContent = "Making your key…";
    await saveDeviceKey(store, await deriveKey(check.words), "passphrase");
    go("#/");
  });
  page.append(form, button("Back", false, () => go("#/welcome")));
  input.focus();
}

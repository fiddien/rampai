import { generateKey } from "../sync/crypto";
import { deriveKey, saveDeviceKey, wordsMatchKey, type KeySource } from "../sync/keys";
import { navBar } from "./nav";
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

/**
 * A device that already has a key sees the usual bar, with Recovery words marked;
 * a first-time writer sees only the wordmark, since there is nowhere else to go yet.
 */
function shell(root: HTMLElement, title: string, existing?: KeySource): HTMLElement {
  let header: HTMLElement;
  if (existing) header = navBar("words", { wordsMissing: existing === "random" });
  else {
    header = el("header", "toolbar");
    const brand = el("a", "brand");
    brand.innerHTML = "<b>Rampai</b>";
    brand.href = "#/welcome";
    header.append(brand);
  }
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

/** Words waiting to be confirmed, if any. A damaged value counts as none. */
const pending = (session: Pick<Storage, "getItem">): string[] | undefined => {
  try {
    const parsed: unknown = JSON.parse(session.getItem(PENDING) ?? "null");
    return Array.isArray(parsed) && parsed.every((w) => typeof w === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * A device that already has recovery words is linked to the writer's other
 * devices. New words would cut it off from them, so replacing them is offered
 * only behind a plain warning, never as part of the ordinary welcome.
 */
function guardExistingWords(page: HTMLElement, go: (hash: string) => void, proceed: () => void, heading?: string) {
  // Under its own heading (after the words check) this is a quiet section, not the page's lede.
  if (heading) page.append(el("h2", "home-sub", heading));
  page.append(
    el("p", heading ? "" : "lede", "This device already has recovery words, and is linked to your other devices by them."),
    el(
      "p",
      "",
      "Setting up different words would cut this device off from the others: it could no longer read what they send, nor they what it sends. Your drafts on this device stay where they are either way.",
    ),
  );
  const actions = el("div", "actions");
  // The bar above already leads back to the drafts; under a heading, only the replacing is offered.
  if (!heading) actions.append(button("Back to my drafts", true, () => go("#/")));
  actions.append(
    button("Replace this device's recovery words", false, () => {
      if (confirm("Replace the recovery words on this device? It will stop syncing with your other devices until they use the same new words.")) proceed();
    }),
  );
  page.append(actions);
}

/**
 * The words are never stored, so they cannot be shown again. What a writer can
 * do is check that the words they wrote down make this device's key.
 */
function checkWordsForm(page: HTMLElement, deviceKey: CryptoKey) {
  const part = el("section", "backup-part");
  part.setAttribute("aria-labelledby", "check-heading");
  const heading = el("h2", "home-sub", "Check the words you wrote down");
  heading.id = "check-heading";
  const note = el("p", "soft", "Rampai never keeps your words, so it cannot show them again. Type them here to check that the ones you wrote down are right.");
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
  message.setAttribute("role", "status");
  const submit = el("button", "primary", "Check");
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
    message.textContent = "Checking…";
    const right = await wordsMatchKey(check.words, deviceKey);
    message.textContent = right
      ? "These are the right words for this device. Keep them safe."
      : "These words make a different key from this device's. Compare them with what you wrote down, word by word.";
    if (right) input.value = "";
    submit.disabled = false;
  });
  part.append(heading, note, form);
  page.append(part);
}

export function welcomePage(root: HTMLElement, store: Store, session: Store, go: (hash: string) => void, existing?: KeySource, deviceKey?: CryptoKey) {
  if (existing === "passphrase") {
    const page = shell(root, "Recovery words", existing);
    if (deviceKey) checkWordsForm(page, deviceKey);
    guardExistingWords(
      page,
      go,
      () => {
        root.replaceChildren();
        welcomePage(root, store, session, go);
      },
      deviceKey ? "Replace them" : undefined,
    );
    return;
  }
  const page = shell(root, "Welcome", existing);
  page.append(
    el("p", "lede", "Rampai is for writing in your own words. Your drafts stay on your own devices and sync between them directly, with no server in between."),
    el(
      "p",
      "",
      "To link your devices, Rampai gives you seven recovery words. They make the key that keeps your drafts private, and they are the only way to add another device or open a backup. There is no copy of your drafts anywhere else, so keep them on at least one device, or in a backup.",
    ),
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

export function recoveryPage(root: HTMLElement, session: Store, go: (hash: string) => void, existing?: KeySource) {
  const words = pending(session);
  if (!words) return go("#/welcome");
  const page = shell(root, "Your recovery words", existing);
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

export function confirmPage(root: HTMLElement, store: Store, session: Store, go: (hash: string) => void, existing?: KeySource) {
  const words = pending(session);
  if (!words) return go("#/welcome");
  let positions: number[];
  try {
    const saved: unknown = JSON.parse(session.getItem(POSITIONS) ?? "null");
    positions = Array.isArray(saved) && saved.every((n) => Number.isInteger(n) && n >= 0 && n < words.length) ? saved : confirmPositions();
  } catch {
    positions = confirmPositions();
  }
  session.setItem(POSITIONS, JSON.stringify(positions));

  const page = shell(root, "Check your words", existing);
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
}

export function pairPage(root: HTMLElement, store: Store, go: (hash: string) => void, existing?: KeySource) {
  if (existing === "passphrase") {
    const page = shell(root, "Add this device", existing);
    guardExistingWords(page, go, () => {
      root.replaceChildren();
      pairPage(root, store, go);
    });
    return;
  }
  const page = shell(root, "Add this device", existing);
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
  page.append(form, button("Back", false, () => go(existing ? "#/" : "#/welcome")));
  input.focus();
}

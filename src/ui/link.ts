import type { KeySource } from "../sync/keys";
import { navBar } from "./nav";
import { chunked } from "../sync/chunks";
import { LibrarySync } from "../sync/librarySync";
import type { Store } from "../sync/library";
import { encrypted } from "../sync/transport";
import { tabNotifier } from "../sync/tabs";
import { joinLink, startLink, type DeviceLink } from "../sync/webrtc";

const WRONG_KEY_MS = 6000;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function codeBox(label: string, readOnly: boolean): { wrap: HTMLElement; box: HTMLTextAreaElement } {
  const wrap = el("label", "code-box", label);
  const box = el("textarea");
  box.rows = 4;
  box.readOnly = readOnly;
  box.spellcheck = false;
  box.autocapitalize = "none";
  wrap.append(box);
  return { wrap, box };
}

async function copy(box: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(box.value);
    return true;
  } catch {
    box.select();
    return document.execCommand?.("copy") ?? false;
  }
}

/**
 * Link two devices that have the same recovery words. One shows a code, the
 * other pastes it and shows an answer, and the answer is pasted back. Then the
 * two exchange their libraries over a direct connection, sealed with the key.
 * The link lasts while this page is open.
 */
export function linkPage(root: HTMLElement, store: Store, key: CryptoKey, source: KeySource) {
  const header = navBar("link", { wordsMissing: source === "random" });
  const page = el("main", "page onboarding");
  page.append(el("h1", "home-title", "Link a device"));
  root.append(header, page);

  page.append(
    el("p", "lede", "Link two devices that are on the same network, with no server in between. Your drafts go from one to the other, sealed with your recovery words."),
  );
  if (source === "random") {
    const warn = el("p", "form-message");
    warn.innerHTML = 'This device has no recovery words yet, so it cannot be linked. <a href="#/welcome">Make recovery words</a> first, and use the same words on the other device.';
    page.append(warn);
    return;
  }

  const status = el("p", "link-status");
  status.setAttribute("role", "status");
  const steps = el("div", "link-steps");
  const choose = el("div", "actions");
  const showCode = el("button", "primary", "Show a code on this device");
  const enterCode = el("button", "tool-text", "Enter a code from the other device");
  showCode.type = enterCode.type = "button";
  choose.append(showCode, enterCode);
  const demo = el("p", "soft");
  demo.innerHTML = 'Want to see how it works first? <a href="#two-devices">Watch two simulated devices sync</a>.';
  page.append(choose, steps, status, demo);

  const say = (text: string) => (status.textContent = text);
  const fail = (e: unknown) => say(e instanceof Error ? e.message : "Something went wrong. Try again.");

  // ——— After the connection opens ———
  const tabs = tabNotifier(key);
  async function linked(link: DeviceLink) {
    choose.hidden = true;
    steps.replaceChildren();
    say("Linked. Looking for drafts to exchange…");
    let accepted = false;
    let settled = false;
    let received = 0;
    let created = 0;
    let deleted = 0;
    let unsaved = 0;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const summary = () => {
      const parts: string[] = [];
      if (received) parts.push(`${plural(received, "update", "updates")} received (${plural(created, "new draft", "new drafts")})`);
      if (deleted) parts.push(`${plural(deleted, "draft", "drafts")} deleted here, as on the other device`);
      if (unsaved) parts.push(`${plural(unsaved, "draft", "drafts")} could not be saved, because this device's storage is full`);
      return parts.length ? `Up to date. ${parts.join("; ")}.` : "Linked. Both devices already have the same drafts.";
    };
    const report = () => say(settled ? summary() : `Receiving… ${plural(received, "update", "updates")} so far.`);
    const wrong = setTimeout(() => {
      if (!accepted) say("These devices were made with different recovery words, so nothing can be shared. Check the words on both.");
    }, WRONG_KEY_MS);

    const sealed = encrypted(chunked(link.transport), key);
    const sync = new LibrarySync(
      store,
      sealed,
      {
        onActivity() {
          accepted = true;
          clearTimeout(wrong);
        },
        onUpdate(_id, isNew) {
          received += 1;
          if (isNew) created += 1;
          report();
        },
        onDeleted() {
          deleted += 1;
          report();
        },
        onStorageFull() {
          unsaved += 1;
          report();
        },
        // Every request has been answered: the libraries are level.
        onSettled() {
          settled = true;
          report();
        },
      },
      // A draft open in another tab of this browser hears about it too, so that tab's next save does not overwrite it.
      (id, update) => tabs.send(id, update),
    );
    link.onClosed(() => {
      clearTimeout(wrong);
      sync.stop();
      tabs.close();
      say("The link has closed. Your drafts are saved on this device.");
    });
    sync.start();
    const done = el("a", "primary", "Back to my drafts");
    (done as HTMLAnchorElement).href = "#/";
    steps.append(done);
  }

  // ——— Device A shows a code ———
  showCode.addEventListener("click", async () => {
    choose.hidden = true;
    say("Making a code…");
    try {
      const started = await startLink();
      const mine = codeBox("1. Copy this code to the other device", true);
      mine.box.value = started.offer;
      const copyButton = el("button", "tool-text", "Copy");
      copyButton.type = "button";
      copyButton.addEventListener("click", async () => say((await copy(mine.box)) ? "Copied." : "Select the code and copy it by hand."));
      const theirs = codeBox("2. Paste the answer code from the other device", false);
      const connect = el("button", "primary", "Connect");
      connect.type = "button";
      connect.addEventListener("click", async () => {
        connect.disabled = true;
        say("Connecting…");
        try {
          await linked(await started.accept(theirs.box.value));
        } catch (e) {
          fail(e);
          connect.disabled = false;
        }
      });
      steps.append(mine.wrap, copyButton, theirs.wrap, connect);
      say("Waiting for the answer code.");
    } catch (e) {
      fail(e);
      choose.hidden = false;
    }
  });

  // ——— Device B enters a code ———
  enterCode.addEventListener("click", () => {
    choose.hidden = true;
    const offer = codeBox("1. Paste the code from the other device", false);
    const make = el("button", "primary", "Make an answer code");
    make.type = "button";
    steps.append(offer.wrap, make);
    make.addEventListener("click", async () => {
      make.disabled = true;
      say("Making an answer code…");
      try {
        const joined = await joinLink(offer.box.value);
        const mine = codeBox("2. Copy this answer code back to the other device", true);
        mine.box.value = joined.answer;
        const copyButton = el("button", "tool-text", "Copy");
        copyButton.type = "button";
        copyButton.addEventListener("click", async () => say((await copy(mine.box)) ? "Copied." : "Select the code and copy it by hand."));
        steps.append(mine.wrap, copyButton);
        say("Waiting for the other device to connect…");
        await linked(await joined.connected);
      } catch (e) {
        fail(e);
        make.disabled = false;
      }
    });
  });
}

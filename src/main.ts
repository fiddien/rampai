import "prosemirror-view/style/prosemirror.css";
import "./style.css";
import { EditorView } from "prosemirror-view";
import type { Node } from "prosemirror-model";
import { createEditorState, schema } from "./editor";
import { newBlockId } from "./editor/blockIds";
import { DocBinding } from "./sync/binding";
import { createDoc } from "./sync/model";
import { connect } from "./sync/peer";
import { BroadcastChannelTransport, MemoryLink, encrypted, type Transport } from "./sync/transport";
import { generateKey, exportKey, importKey } from "./sync/crypto";
import { loadSnapshot, autosave, deviceStore } from "./sync/storage";
import { typedOnlyField } from "./ui/typedOnlyInput";
import { buildToolbar, wordCount, MOD, ALT } from "./ui/toolbar";
import { buildOutline } from "./ui/outline";
import { libraryPage } from "./ui/library";
import { buildFinish, type FinishPanel } from "./ui/finish";
import { draftKey, getDraft, updateDraft } from "./sync/library";
import { getTitle, setTitle, isFinished } from "./sync/meta";

const KEY_KEY = "rampai:key:v1";
const store = deviceStore();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", html = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

// ——— Gentle feedback ———

const toast = el("div", "toast");
toast.setAttribute("role", "status");
document.body.append(toast);
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function say(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
const refusePaste = () => say("Rampai only takes typed words. Try saying it in your own.");

// ——— Chrome fades while the writer types, and returns when the mouse moves ———

let lastMouse = { x: -1, y: -1 };
document.addEventListener("keydown", (e) => {
  const inEditor = (e.target as HTMLElement | null)?.closest?.(".ProseMirror");
  if (inEditor && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace")) {
    document.body.classList.add("typing");
  }
});
document.addEventListener("mousemove", (e) => {
  if (Math.abs(e.clientX - lastMouse.x) + Math.abs(e.clientY - lastMouse.y) > 6) document.body.classList.remove("typing");
  lastMouse = { x: e.clientX, y: e.clientY };
});

function mountEditor(place: HTMLElement, doc: ReturnType<typeof createDoc>, initial: Node | undefined, onChange: () => void) {
  let binding!: DocBinding;
  const view = new EditorView(place, {
    state: createEditorState(initial, { onBlockedPaste: refusePaste }),
    dispatchTransaction: (tr) => {
      binding.dispatch(tr);
      onChange();
    },
  });
  view.dom.setAttribute("aria-label", "Draft");
  view.dom.setAttribute("spellcheck", "true");
  binding = new DocBinding(doc, view);
  onChange();
  return { view, binding };
}

// ——— The writing page: one draft, saved on this device, synced across its tabs ———

async function writingPage(root: HTMLElement, id: string) {
  const DRAFT_KEY = draftKey(id);
  let key: CryptoKey;
  try {
    const stored = localStorage.getItem(KEY_KEY);
    key = stored ? await importKey(stored) : await generateKey();
    if (!stored) localStorage.setItem(KEY_KEY, await exportKey(key));
  } catch {
    key = await generateKey();
  }

  const doc = createDoc();
  loadSnapshot(doc, DRAFT_KEY);

  const header = el("header", "toolbar chrome");
  const brand = el("a", "brand", "<b>Rampai</b> · ‹ Drafts");
  brand.href = "#/";
  header.append(brand);
  const page = el("main", "page");
  const title = el("input", "draft-name chrome");
  title.type = "text";
  title.setAttribute("aria-label", "Title");
  title.maxLength = 120;
  title.value = getTitle(doc);
  // Typed-only holds for the title too: no paste, no dropped text.
  typedOnlyField(title, refusePaste);
  // A blank title is only filled in with the default when the writer leaves the field.
  title.addEventListener("input", () => title.value.trim() && setTitle(doc, title.value));
  title.addEventListener("blur", () => {
    setTitle(doc, title.value);
    title.value = getTitle(doc);
  });
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      view.focus();
    }
  });
  doc.subscribe(() => {
    if (document.activeElement !== title) title.value = getTitle(doc);
  });
  page.append(title);
  const surface = el("div");
  page.append(surface);
  page.append(
    el(
      "div",
      "keys chrome",
      `Type <kbd>#</kbd> for a heading, <kbd>&gt;</kbd> for a quote, <kbd>-</kbd> for a list, then a space. ` +
        `<kbd>${ALT}</kbd> <kbd>↑</kbd> <kbd>↓</kbd> moves the block you're in. ` +
        `<kbd>${MOD}</kbd> <kbd>Shift</kbd> <kbd>O</kbd> opens the outline, where whole sections move. ` +
        `<kbd>${MOD}</kbd> <kbd>B</kbd> and <kbd>${MOD}</kbd> <kbd>I</kbd> for bold and italic. ` +
        `Pasting is switched off on purpose. <a href="#two-devices">See two devices sync</a>.`,
    ),
  );
  const footer = el("footer", "footer chrome");
  const inner = el("div", "footer-inner");
  const words = el("span");
  const status = el("span", "status", "Not saved yet");
  inner.append(words, el("span", "spacer"), status);
  footer.append(inner);
  root.append(header, page, footer);

  let view!: EditorView;
  const toolbar = buildToolbar(() => view);
  header.append(toolbar.element);
  const outline = buildOutline(() => view);
  const outlineButton = el("button", "tool", "Outline");
  outlineButton.type = "button";
  outlineButton.title = `Show only the headings, and move whole sections (${MOD}+Shift+O)`;
  outlineButton.setAttribute("aria-pressed", "false");
  const toggleOutline = () => {
    outline.toggle();
    outlineButton.setAttribute("aria-pressed", String(!outline.element.hidden));
  };
  outlineButton.addEventListener("click", toggleOutline);
  header.append(outlineButton);
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
      e.preventDefault();
      toggleOutline();
    }
  });
  root.append(outline.element);

  // Finishing: say what the piece claims and read it aloud. A finished piece is read-only until reopened.
  const finishButton = el("button", "tool", "Finish");
  finishButton.type = "button";
  finishButton.title = "Say what this piece claims, and mark it finished";
  finishButton.setAttribute("aria-pressed", "false");
  let finish!: FinishPanel;
  const syncPressed = () => finishButton.setAttribute("aria-pressed", String(!!finish?.open));
  finish = buildFinish(doc, () => (view ? wordCount(view.state) : 0), refusePaste, (finished) => {
    finishButton.textContent = finished ? "Finished" : "Finish";
    view?.setProps({ editable: () => !finished });
    title.readOnly = finished;
    document.body.classList.toggle("finished", finished);
    // The toolbar and outline follow the draft's read-only state at once.
    if (view) {
      toolbar.update(view.state);
      outline.update();
    }
    syncPressed();
  });
  finishButton.addEventListener("click", () => {
    finish.toggle();
    syncPressed();
  });
  header.append(finishButton);
  page.append(finish.element);
  const update = () => {
    if (!view) return;
    outline.update();
    // The finish panel follows the document itself (doc.subscribe), so it is not refreshed here too.
    toolbar.update(view.state);
    const n = wordCount(view.state);
    words.textContent = `${n} ${n === 1 ? "word" : "words"}`;
  };
  const mounted = mountEditor(surface, doc, undefined, update);
  view = mounted.view;
  view.setProps({ editable: () => !isFinished(doc) });
  update();

  const saver = autosave(
    doc,
    DRAFT_KEY,
    () => {
      status.textContent = "Saved on this device";
      status.classList.remove("failed");
      status.classList.add("ok");
      updateDraft(store, id, { title: getTitle(doc), words: wordCount(view.state), updatedAt: Date.now(), finished: isFinished(doc) });
    },
    400,
    // If this draft was deleted from another tab, don't write it back.
    () => !!getDraft(store, id),
    () => {
      status.textContent = "Not saved: this device's storage is full or blocked";
      status.classList.remove("ok");
      status.classList.add("failed");
    },
  );
  // Leaving the page (a link, Back, or closing the tab) must not drop the last words typed.
  window.addEventListener("pagehide", saver.flush);
  document.addEventListener("visibilitychange", () => document.hidden && saver.flush());
  // Other tabs of this browser are other replicas of the same draft.
  if ("BroadcastChannel" in window) {
    connect(mounted.binding, encrypted(new BroadcastChannelTransport(`rampai:draft:${id}`), key));
  }
  view.focus();
}

// ——— Two devices, one draft ———

function seedDraft(): Node {
  const p = (type: string, text: string) => schema.node(type, { id: newBlockId() }, text ? [schema.text(text)] : []);
  return schema.node("doc", null, [
    p("heading1", "Two devices, one draft"),
    p("paragraph", "Turn the network off. On the laptop, move this paragraph down with Alt+↓. On the phone, add a sentence to it."),
    p("paragraph", "Turn the network back on. The phone's sentence follows the paragraph to its new place."),
    p("paragraph", "Everything between the devices is encrypted. The line under each one shows what it last received."),
  ]);
}

function tap(inner: Transport, show: (bytes: Uint8Array) => void): Transport {
  return {
    send: inner.send,
    onMessage: (listener) =>
      inner.onMessage((data) => {
        show(data);
        listener(data);
      }),
  };
}

function hex(bytes: Uint8Array, n = 28): string {
  return Array.from(bytes.subarray(0, n), (b) => b.toString(16).padStart(2, "0")).join(" ") + (bytes.length > n ? " …" : "");
}

async function twoDevicesPage(root: HTMLElement) {
  const key = await generateKey();
  const link = new MemoryLink();

  const header = el("header", "toolbar");
  header.style.maxWidth = "72rem";
  header.append(el("a", "brand", "<b>Rampai</b> · two devices, one draft"));
  (header.querySelector(".brand") as HTMLAnchorElement).href = "#";
  const network = el("button", "network");
  network.type = "button";
  network.setAttribute("aria-pressed", "true");
  const setNetworkLabel = () => {
    network.innerHTML = `<span class="dot"></span>${link.isOnline ? "Same network: on" : "Same network: off"}`;
    network.setAttribute("aria-pressed", String(link.isOnline));
  };
  setNetworkLabel();
  header.append(network);

  const intro = el(
    "div",
    "duo-intro",
    "<p>Rampai keeps every draft on your own devices and syncs them directly when they share a network. " +
      "There is no server in between. This page simulates a laptop and a phone so you can try it in one window.</p>",
  );
  const grid = el("div", "duo-grid");
  const duo = el("main", "duo");
  duo.append(intro, grid);
  root.append(header, duo);

  const laptopDoc = createDoc(1);
  const devices: { name: string; transport: Transport; from?: boolean }[] = [
    { name: "Laptop", transport: link.a },
    { name: "Phone", transport: link.b, from: true },
  ];
  const peers: { hello(): void }[] = [];

  for (const d of devices) {
    const box = el("section", "device");
    box.setAttribute("aria-label", d.name);
    const head = el("div", "device-head", `<b>${d.name}</b>`);
    const surface = el("div");
    const wire = el("div", "wire", "Waiting for the other device…");
    box.append(head, surface, wire);
    grid.append(box);

    const doc = d.from ? createDoc(2) : laptopDoc;
    if (d.from) doc.import(laptopDoc.export({ mode: "snapshot" }));
    let view!: EditorView;
    const toolbar = buildToolbar(() => view, true);
    head.append(toolbar.element);
    const mounted = mountEditor(surface, doc, d.from ? undefined : seedDraft(), () => view && toolbar.update(view.state));
    view = mounted.view;
    toolbar.update(view.state);

    const watched = tap(d.transport, (b) => {
      wire.textContent = `Received ${b.length} encrypted bytes: ${hex(b)}`;
    });
    peers.push(connect(mounted.binding, encrypted(watched, key)));
  }

  link.whenReconnected(() => peers.forEach((p) => p.hello()));
  network.addEventListener("click", () => {
    link.setOnline(!link.isOnline);
    setNetworkLabel();
    say(link.isOnline ? "Back on the same network. Catching up…" : "Off the network. Keep writing on both.");
  });
}

// ——— Routing ———

function route() {
  // Each page sets up its own replicas, so switching pages starts clean.
  if (routed) {
    location.reload();
    return;
  }
  routed = true;
  const root = document.getElementById("app")!;
  root.replaceChildren();
  document.body.classList.remove("typing");
  const draftId = /^#\/draft\/([\w-]+)$/.exec(location.hash)?.[1];
  if (location.hash === "#two-devices") void twoDevicesPage(root);
  else if (draftId && getDraft(store, draftId)) void writingPage(root, draftId);
  else libraryPage(root, store, (newId) => (location.hash = `#/draft/${newId}`));
}
let routed = false;
window.addEventListener("hashchange", route);
route();

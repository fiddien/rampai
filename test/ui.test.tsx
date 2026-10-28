// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { EditorView } from "prosemirror-view";
import { createEditorState } from "../src/editor";
import { BackBar, NavBar } from "../src/ui/Nav";
import { Toolbar } from "../src/ui/Toolbar";
import { ShortcutsModal } from "../src/ui/Shortcuts";
import { PairPage, WelcomePage } from "../src/ui/Onboarding";
import { BackupPage } from "../src/ui/BackupPage";
import { LibraryPage } from "../src/ui/LibraryPage";
import { generateKey } from "../src/sync/crypto";
import { createDraft } from "../src/sync/library";
import { useRef } from "react";
import { useTypedOnly } from "../src/ui/typedOnly";
import { MemoryStore, renderApp } from "./render";

describe("navigation bar", () => {
  test("offers the four places, in order, and marks only the current page", () => {
    const { container } = renderApp(<NavBar active="link" />);
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>("nav a"));
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Drafts", "#/"],
      ["Link a device", "#/link"],
      ["Backup", "#/backup"],
      ["Recovery words", "#/welcome"],
    ]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null, null]);
    expect(container.querySelector(".brand")!.getAttribute("href")).toBe("#/");
  });

  test("a dot, with a spoken note, shows on Recovery words only while the device has none", () => {
    const { container, rerender } = renderApp(<NavBar active="drafts" wordsMissing />);
    expect(container.querySelector(".nav-dot")).not.toBeNull();
    expect(container.querySelector("nav")!.textContent).toContain("(not set up yet)");
    rerender(<NavBar active="drafts" />);
    expect(container.querySelector(".nav-dot")).toBeNull();
  });

  test("the writing page has one way out", () => {
    const { container } = renderApp(<BackBar />);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("#/");
  });
});

function editor() {
  const view: EditorView = new EditorView(document.createElement("div"), {
    state: createEditorState(),
    dispatchTransaction: (tr) => view.updateState(view.state.apply(tr)),
  });
  return view;
}

describe("toolbar", () => {
  test("the writing page shows bold, italic and one block menu, without block moves", () => {
    const view = editor();
    const { container } = renderApp(<Toolbar view={view} tick={0} />);
    expect(Array.from(container.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["B", "I"]);
    expect(Array.from(container.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Text", "Heading", "Subheading", "Quote", "List"]);
  });

  test("the menu follows the caret's block and changes it", () => {
    const view = editor();
    const { container, rerender } = renderApp(<Toolbar view={view} tick={0} />);
    const menu = () => container.querySelector<HTMLSelectElement>("select")!;
    expect(menu().value).toBe("paragraph");
    fireEvent.change(menu(), { target: { value: "heading1" } });
    expect(view.state.doc.child(0).type.name).toBe("heading1");
    rerender(<Toolbar view={view} tick={1} />);
    expect(menu().value).toBe("heading1");
  });

  test("everything is disabled while the draft is read-only", () => {
    const view = editor();
    view.setProps({ editable: () => false });
    const { container } = renderApp(<Toolbar view={view} tick={0} />);
    expect(container.querySelector("select")!.disabled).toBe(true);
    expect(Array.from(container.querySelectorAll("button")).every((b) => b.disabled)).toBe(true);
  });

  test("the compact toolbar of the two-device demo keeps the moves and has no menu", () => {
    const view = editor();
    const { container } = renderApp(<Toolbar view={view} tick={0} compact />);
    expect(container.querySelector("select")).toBeNull();
    expect(Array.from(container.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["B", "I", "↑", "↓"]);
  });
});

describe("shortcuts panel", () => {
  test("lists the shortcuts and the typed-only note", () => {
    renderApp(<ShortcutsModal opened onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Bold");
    expect(dialog.textContent).toContain("Pasting is switched off on purpose");
  });
});

describe("a device that already has recovery words", () => {
  test("the Recovery words page offers the check and guards replacing", async () => {
    renderApp(<WelcomePage />, { device: { key: await generateKey(), source: "passphrase" } });
    expect(screen.getByText("Check the words you wrote down")).toBeTruthy();
    expect(screen.getByText(/already has recovery words/)).toBeTruthy();
    expect(screen.queryByText("Start my writing")).toBeNull();
  });

  test("replacing them needs an explicit confirmation", async () => {
    renderApp(<WelcomePage />, { device: { key: await generateKey(), source: "passphrase" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace this device's recovery words" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep them" }));
    expect(screen.queryByText("Start my writing")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Replace this device's recovery words" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Replace them" }));
    expect(await screen.findByText("Start my writing")).toBeTruthy();
  });

  test("pairing again is guarded too", async () => {
    const { container } = renderApp(<PairPage />, { device: { key: await generateKey(), source: "passphrase" } });
    expect(container.querySelector("input")).toBeNull();
    expect(container.textContent).toMatch(/cut this device off/);
  });

  test("a device without words, or with a random key, gets the ordinary welcome, which promises no recovery of drafts", async () => {
    for (const device of [undefined, { key: await generateKey(), source: "random" as const }]) {
      const { container, unmount } = renderApp(<WelcomePage />, { device });
      expect(container.textContent).toMatch(/Start my writing/);
      expect(container.textContent).not.toMatch(/get your drafts back/);
      expect(container.textContent).toMatch(/keep them on at least one device, or in a backup/);
      unmount();
    }
  });

  test("choosing not now saves a device-only key and goes to the drafts", async () => {
    const store = new MemoryStore();
    const { ctx } = renderApp(<WelcomePage />, { store });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Not now/ })));
    await vi.waitFor(() => expect(ctx.go).toHaveBeenCalledWith("#/"));
    expect(store.getItem("rampai:key-source:v1")).toBe("random");
    expect(ctx.refreshDevice).toHaveBeenCalled();
  });
});

describe("backup page", () => {
  test("a device without recovery words is asked to make them first", async () => {
    const { container } = renderApp(<BackupPage />, { device: { key: await generateKey(), source: "random" } });
    expect(container.textContent).toMatch(/no recovery words yet/);
    expect(container.querySelector("input[type=file]")).toBeNull();
  });

  test("a device with words can save and restore", async () => {
    const { container } = renderApp(<BackupPage />, { device: { key: await generateKey(), source: "passphrase" } });
    expect(screen.getByRole("button", { name: "Save a backup" })).toBeTruthy();
    expect(container.querySelector("input[type=file]")).not.toBeNull();
    expect(container.textContent).toMatch(/No backup has been saved from this device yet/);
  });
});

describe("drafts home", () => {
  test("lists drafts, and asks before deleting", async () => {
    const store = new MemoryStore();
    createDraft(store);
    renderApp(<LibraryPage />, { store, device: { key: await generateKey(), source: "passphrase" } });
    expect(screen.getByText("My first bad draft")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete “My first bad draft”" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(screen.getByText(/Nothing here yet/)).toBeTruthy());
  });

  test("warns when this browser keeps nothing", () => {
    renderApp(<LibraryPage />, { persists: false });
    expect(screen.getByRole("alert").textContent).toMatch(/not keeping anything Rampai saves/);
  });
});

describe("typed-only fields", () => {
  test("refuse paste, drop and outside-text input events, and allow typing", () => {
    const blocked = vi.fn();
    function Field() {
      const ref = useRef<HTMLInputElement>(null);
      useTypedOnly(ref, blocked);
      return <input aria-label="field" ref={ref} />;
    }
    renderApp(<Field />);
    const input = screen.getByLabelText("field");
    expect(fireEvent.paste(input)).toBe(false);
    expect(fireEvent.drop(input)).toBe(false);
    const fromPaste = new InputEvent("beforeinput", { inputType: "insertFromPaste", cancelable: true, bubbles: true });
    input.dispatchEvent(fromPaste);
    expect(fromPaste.defaultPrevented).toBe(true);
    const typing = new InputEvent("beforeinput", { inputType: "insertText", data: "a", cancelable: true, bubbles: true });
    input.dispatchEvent(typing);
    expect(typing.defaultPrevented).toBe(false);
    expect(blocked).toHaveBeenCalledTimes(3);
  });
});

describe("recovery words page", () => {
  const words = "abandon ability able about above absent absorb".split(" ");

  test("offers to copy the words or download them, numbered, with a warning in the file", async () => {
    const { RecoveryPage, wordsAsText, wordsFile } = await import("../src/ui/Onboarding");
    const session = new MemoryStore();
    session.setItem("rampai:pending-words", JSON.stringify(words));
    renderApp(<RecoveryPage />, { session });
    expect(screen.getByRole("button", { name: "Copy the words" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download as a text file" })).toBeTruthy();
    expect(wordsAsText(words).split("\n")).toEqual(words.map((w, i) => `${i + 1}. ${w}`));
    const file = wordsFile(words);
    expect(file).toContain("7. absorb");
    expect(file).toMatch(/delete this file/);
  });

  test("the download saves a text file named for Rampai", async () => {
    const { RecoveryPage } = await import("../src/ui/Onboarding");
    const session = new MemoryStore();
    session.setItem("rampai:pending-words", JSON.stringify(words));
    const created = vi.fn(() => "blob:words");
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    let downloaded = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });
    renderApp(<RecoveryPage />, { session });
    fireEvent.click(screen.getByRole("button", { name: "Download as a text file" }));
    expect(downloaded).toBe("rampai-recovery-words.txt");
    expect(created).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});

describe("theme", () => {
  test("the main button is ink on paper in both schemes, so its text always shows", async () => {
    const { cssVariables, theme } = await import("../src/app/theme");
    const vars = cssVariables(theme as never);
    for (const scheme of [vars.light, vars.dark]) {
      expect(scheme["--mantine-primary-color-filled"]).toBe("var(--ink)");
      expect(scheme["--mantine-primary-color-contrast"]).toBe("var(--bg)");
    }
  });
});

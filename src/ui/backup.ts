import type { KeySource } from "../sync/keys";
import type { Store } from "../sync/library";
import { BackupError, backupFileName, makeBackup, readBackup, restoreBackup } from "../sync/backup";
import { tabNotifier } from "../sync/tabs";
import { navBar } from "./nav";

const LAST_BACKUP = "rampai:last-backup:v1";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** What a restore did, in one sentence. */
export function restoreSummary(r: { created: string[]; merged: string[]; unchanged: string[]; failed: string[]; storageFull: boolean }, createdAt: number): string {
  const parts: string[] = [];
  if (r.created.length) parts.push(`${plural(r.created.length, "draft", "drafts")} brought back`);
  if (r.merged.length) parts.push(`${plural(r.merged.length, "draft", "drafts")} merged with what was here`);
  if (r.unchanged.length) parts.push(`${plural(r.unchanged.length, "draft was", "drafts were")} already up to date`);
  const from = createdAt ? `the backup of ${day(createdAt)}` : "the backup";
  let text = parts.length ? `From ${from}: ${parts.join(", ")}.` : `${from[0].toUpperCase()}${from.slice(1)} holds no drafts.`;
  if (r.failed.length) {
    text += r.storageFull
      ? ` ${plural(r.failed.length, "draft", "drafts")} could not be saved, because this device's storage is full.`
      : ` ${plural(r.failed.length, "draft", "drafts")} in it could not be read.`;
  }
  return text;
}

/**
 * Backup and restore. A backup is the way back from a lost device when no
 * other device has the drafts: one file, sealed with the recovery words.
 */
export function backupPage(root: HTMLElement, store: Store, key: CryptoKey, source: KeySource) {
  root.append(navBar("backup", { wordsMissing: source !== "passphrase" }));
  const page = el("main", "page onboarding");
  page.append(el("h1", "home-title", "Backup"));
  root.append(page);

  if (source !== "passphrase") {
    const why = el("p", "lede");
    why.innerHTML =
      'A backup is sealed with your recovery words, so that only you can open it, on any device. This device has no recovery words yet. <a href="#/welcome">Make them</a> first.';
    page.append(why);
    return;
  }

  page.append(
    el(
      "p",
      "lede",
      "Your drafts live only on your devices. A backup puts all of them in one file, sealed with your recovery words, so you can get them back if you lose every device.",
    ),
    el("p", "soft", "Keep the file anywhere you like: a USB stick, a cloud folder, an email to yourself. Without your words, nobody can read it."),
  );

  // ——— Save ———
  const save = el("section", "backup-part");
  save.setAttribute("aria-labelledby", "save-heading");
  const saveHeading = el("h2", "home-sub", "Save a backup");
  saveHeading.id = "save-heading";
  const last = el("p", "soft");
  const showLast = () => {
    const t = Number(store.getItem(LAST_BACKUP));
    last.textContent = t ? `Last backup from this device: ${day(t)}.` : "No backup has been saved from this device yet.";
  };
  showLast();
  const saveButton = el("button", "primary", "Save a backup");
  saveButton.type = "button";
  const saveStatus = el("p", "form-message");
  saveStatus.setAttribute("role", "status");
  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    try {
      const { bytes, count } = await makeBackup(store, key);
      const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/octet-stream" }));
      const a = el("a");
      a.href = url;
      a.download = backupFileName();
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      store.setItem(LAST_BACKUP, String(Date.now()));
      showLast();
      saveStatus.textContent = `Saved ${plural(count, "draft", "drafts")} to ${a.download}.`;
    } catch {
      saveStatus.textContent = "The backup could not be made. Try again.";
    } finally {
      saveButton.disabled = false;
    }
  });
  save.append(saveHeading, last, saveButton, saveStatus);

  // ——— Restore ———
  const restore = el("section", "backup-part");
  restore.setAttribute("aria-labelledby", "restore-heading");
  const restoreHeading = el("h2", "home-sub", "Restore from a backup");
  restoreHeading.id = "restore-heading";
  const note = el("p", "soft", "Drafts in the backup are merged with the ones here, so nothing written since is lost. Drafts deleted here since the backup come back.");
  const label = el("label", "file-pick");
  const input = el("input");
  input.type = "file";
  input.accept = ".rampai";
  label.append("Choose a backup file", input);
  const restoreStatus = el("p", "form-message");
  restoreStatus.setAttribute("role", "status");
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    restoreStatus.textContent = "Opening the backup…";
    const tabs = tabNotifier(key);
    try {
      const backup = await readBackup(new Uint8Array(await file.arrayBuffer()), key);
      const report = restoreBackup(store, backup, (id, snapshot) => tabs.send(id, snapshot));
      restoreStatus.textContent = restoreSummary(report, backup.createdAt);
      if (report.created.length || report.merged.length) {
        const back = el("a", "", "See your drafts");
        back.href = "#/";
        restoreStatus.append(" ", back);
      }
    } catch (e) {
      restoreStatus.textContent = e instanceof BackupError ? e.message : "That file could not be read.";
    } finally {
      tabs.close();
      input.value = "";
    }
  });
  restore.append(restoreHeading, note, label, restoreStatus);

  page.append(save, restore);
}

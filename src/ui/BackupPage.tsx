import { useState } from "react";
import { Anchor, Button, FileInput, Text, Title } from "@mantine/core";
import { BackupError, backupFileName, makeBackup, readBackup, restoreBackup, type RestoreReport } from "../sync/backup";
import { tabNotifier } from "../sync/tabs";
import { useApp } from "../app/context";
import { NavBar } from "./Nav";
import { plural } from "./format";

const LAST_BACKUP = "rampai:last-backup:v1";
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/** What a restore did, in one sentence. */
export function restoreSummary(r: RestoreReport, createdAt: number): string {
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
export function BackupPage() {
  const { store, device } = useApp();
  const [last, setLast] = useState(() => Number(store.getItem(LAST_BACKUP)) || 0);
  const [saveStatus, setSaveStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState("");
  const [restored, setRestored] = useState(false);
  if (!device) return null;
  const key = device.key;

  return (
    <>
      <NavBar active="backup" wordsMissing={device.source !== "passphrase"} />
      <main className="page onboarding">
        <Title order={1} className="home-title">
          Backup
        </Title>
        {device.source !== "passphrase" ? (
          <p className="lede">
            A backup is sealed with your recovery words, so that only you can open it, on any device. This device has no recovery words yet.{" "}
            <Anchor href="#/welcome">Make them</Anchor> first.
          </p>
        ) : (
          <>
            <p className="lede">Your drafts live only on your devices. A backup puts all of them in one file, sealed with your recovery words, so you can get them back if you lose every device.</p>
            <Text className="soft">Keep the file anywhere you like: a USB stick, a cloud folder, an email to yourself. Without your words, nobody can read it.</Text>

            <section className="backup-part" aria-labelledby="save-heading">
              <Title order={2} className="home-sub" id="save-heading">
                Save a backup
              </Title>
              <Text className="soft" mb="sm">
                {last ? `Last backup from this device: ${day(last)}.` : "No backup has been saved from this device yet."}
              </Text>
              <Button
                loading={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    const { bytes, count } = await makeBackup(store, key);
                    const url = URL.createObjectURL(new Blob([bytes.slice()], { type: "application/octet-stream" }));
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = backupFileName();
                    document.body.append(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 10_000);
                    const now = Date.now();
                    store.setItem(LAST_BACKUP, String(now));
                    setLast(now);
                    setSaveStatus(`Saved ${plural(count, "draft", "drafts")} to ${a.download}.`);
                  } catch {
                    setSaveStatus("The backup could not be made. Try again.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Save a backup
              </Button>
              <p className="form-message" role="status" style={{ marginTop: 8 }}>
                {saveStatus}
              </p>
            </section>

            <section className="backup-part" aria-labelledby="restore-heading">
              <Title order={2} className="home-sub" id="restore-heading">
                Restore from a backup
              </Title>
              <Text className="soft">Drafts in the backup are merged with the ones here, so nothing written since is lost. Drafts deleted here since the backup come back.</Text>
              <FileInput
                className="file-pick"
                label="Choose a backup file"
                placeholder="rampai-backup-….rampai"
                accept=".rampai"
                clearable={false}
                value={null}
                onChange={async (file) => {
                  if (!file) return;
                  setRestoreStatus("Opening the backup…");
                  setRestored(false);
                  const tabs = tabNotifier(key);
                  try {
                    const backup = await readBackup(new Uint8Array(await file.arrayBuffer()), key);
                    const report = restoreBackup(store, backup, (id, snapshot) => tabs.send(id, snapshot));
                    setRestoreStatus(restoreSummary(report, backup.createdAt));
                    setRestored(report.created.length + report.merged.length > 0);
                  } catch (e) {
                    setRestoreStatus(e instanceof BackupError ? e.message : "That file could not be read.");
                  } finally {
                    tabs.close();
                  }
                }}
              />
              <p className="form-message" role="status">
                {restoreStatus} {restored && <Anchor href="#/">See your drafts</Anchor>}
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}

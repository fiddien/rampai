import { open, seal } from "./crypto";
import { draftKey, listDrafts, type Store } from "./library";
import { mergeDraft, type MergeResult } from "./merge";
import { fromBase64, readSnapshot, toBase64 } from "./storage";

/**
 * A backup is one file holding every draft on this device, sealed with the key
 * from the writer's recovery words. It can sit anywhere (a USB stick, a cloud
 * folder, an email to oneself), because without the words nobody can read it.
 *
 * Layout: "RMPB" | format (1 byte) | flags (1 byte) | sealed payload.
 * The payload is JSON, deflated when the browser can:
 *   { format: 1, createdAt, drafts: [{ id, snapshot (base64 Loro snapshot) }] }
 * The four letters and the format byte are in the clear, so a wrong file is
 * told apart from a right file sealed with different words.
 */
const MAGIC = [0x52, 0x4d, 0x50, 0x42]; // "RMPB"
const FORMAT = 1;
const DEFLATED = 1;

export interface Backup {
  createdAt: number;
  drafts: { id: string; snapshot: Uint8Array }[];
}

export class BackupError extends Error {
  constructor(
    readonly reason: "not-a-backup" | "newer-format" | "wrong-words" | "damaged",
    message: string,
  ) {
    super(message);
  }
}

const canDeflate = () => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes.slice()).then(() => writer.close()).catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** Every saved draft on this device, sealed into one file. */
export async function makeBackup(store: Store, key: CryptoKey, now = Date.now()): Promise<{ bytes: Uint8Array; count: number }> {
  const drafts: { id: string; snapshot: string }[] = [];
  for (const d of listDrafts(store)) {
    const snapshot = readSnapshot(store, draftKey(d.id));
    if (snapshot) drafts.push({ id: d.id, snapshot: toBase64(snapshot) });
  }
  let payload: Uint8Array = new TextEncoder().encode(JSON.stringify({ format: FORMAT, createdAt: now, drafts }));
  const deflate = canDeflate();
  if (deflate) payload = await pipe(payload, new CompressionStream("deflate-raw"));
  const sealed = await seal(key, payload);
  const bytes = new Uint8Array(6 + sealed.length);
  bytes.set(MAGIC, 0);
  bytes[4] = FORMAT;
  bytes[5] = deflate ? DEFLATED : 0;
  bytes.set(sealed, 6);
  return { bytes, count: drafts.length };
}

/** Open a backup file with this device's key, saying plainly what is wrong if it cannot be opened. */
export async function readBackup(bytes: Uint8Array, key: CryptoKey): Promise<Backup> {
  if (bytes.length < 6 || MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new BackupError("not-a-backup", "That file is not a Rampai backup.");
  }
  if (bytes[4] > FORMAT) {
    throw new BackupError("newer-format", "That backup was made by a newer version of Rampai. Reload the page to update, then try again.");
  }
  let payload: Uint8Array;
  try {
    payload = await open(key, bytes.subarray(6));
  } catch {
    throw new BackupError("wrong-words", "That backup was sealed with different recovery words, so this device cannot open it.");
  }
  try {
    if (bytes[5] & DEFLATED) payload = await pipe(payload, new DecompressionStream("deflate-raw"));
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as { createdAt?: unknown; drafts?: unknown };
    if (!Array.isArray(parsed.drafts)) throw new Error("no drafts");
    const drafts = parsed.drafts
      .filter((d): d is { id: string; snapshot: string } => !!d && typeof d.id === "string" && typeof d.snapshot === "string")
      .map((d) => ({ id: d.id, snapshot: fromBase64(d.snapshot) }));
    return { createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0, drafts };
  } catch {
    throw new BackupError("damaged", "That backup opened, but its contents are damaged.");
  }
}

export interface RestoreReport {
  created: string[];
  merged: string[];
  unchanged: string[];
  failed: string[];
  storageFull: boolean;
}

/** Ids become storage keys, so only plain ones are restored. */
const VALID_ID = /^[\w-]{1,64}$/;

/**
 * Bring every draft in a backup into this device. Drafts merge with what is
 * here, so nothing written since the backup is lost; drafts deleted here since
 * the backup come back, because restoring is the writer's own choice.
 */
export function restoreBackup(store: Store, backup: Backup, onRestored: (id: string, snapshot: Uint8Array) => void = () => {}): RestoreReport {
  const report: RestoreReport = { created: [], merged: [], unchanged: [], failed: [], storageFull: false };
  for (const { id, snapshot } of backup.drafts) {
    if (!VALID_ID.test(id)) {
      report.failed.push(id);
      continue;
    }
    const result: MergeResult = mergeDraft(store, id, snapshot, { restore: true });
    if (result === "created") report.created.push(id);
    else if (result === "merged") report.merged.push(id);
    else if (result === "unchanged") report.unchanged.push(id);
    else {
      report.failed.push(id);
      if (result === "storage-full") report.storageFull = true;
    }
    if (result === "created" || result === "merged") onRestored(id, snapshot);
  }
  return report;
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `rampai-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.rampai`;
}

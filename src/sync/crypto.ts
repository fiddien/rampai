/**
 * Every update is encrypted before it leaves a device, with AES-GCM and a
 * 256-bit key shared only by the writer's paired devices. AES-GCM also
 * authenticates, so a tampered message fails to open instead of corrupting
 * the draft.
 */
const IV_BYTES = 12;

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  return btoa(String.fromCharCode(...raw));
}

export async function importKey(base64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function seal(key: CryptoKey, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain.slice()));
  const out = new Uint8Array(IV_BYTES + cipher.length);
  out.set(iv, 0);
  out.set(cipher, IV_BYTES);
  return out;
}

export async function open(key: CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  const iv = sealed.slice(0, IV_BYTES);
  const cipher = sealed.slice(IV_BYTES);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher));
}

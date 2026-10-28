/**
 * Link codes travel between devices by copy and paste, or as QR codes. The
 * first code (the offer) is shown as a link to Rampai's Link page, so a
 * phone's ordinary camera app can open it with the code filled in. The code
 * sits after the #, which browsers never send to the server.
 */
const CODE = /rampai[012]\.[\w.:~!*-]+/;

export function linkUrl(code: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#/link?code=${code}`;
}

/** The link code in pasted or scanned text: a bare code, or a Rampai link carrying one. */
export function codeFromText(text: string): string | undefined {
  const compact = text.replace(/\s+/g, "");
  const fromUrl = /[#&?]code=([^&#]+)/.exec(compact)?.[1];
  const candidate = fromUrl ? decodeURIComponent(fromUrl) : compact;
  return CODE.exec(candidate)?.[0];
}

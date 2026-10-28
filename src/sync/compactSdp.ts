/**
 * A short form of a WebRTC session description for a data channel, so link
 * codes make small QR codes. Only what differs between connections is kept:
 * the ICE username and password, the DTLS fingerprint, the DTLS role, and the
 * host candidates (address and port). The rest of the description is always
 * the same for Rampai's one data channel, and is written back on arrival.
 *
 * Form: ufrag ~ pwd ~ fingerprint ~ role ~ candidates, where the fingerprint
 * is its 32 bytes in base64url, the role is "p" (actpass), "a" (active) or "s"
 * (passive), and candidates are "address*port" joined by "!". ICE characters
 * "+" and "/" are written "-" and "_", so the whole form is safe in a link.
 */
const ROLE = { actpass: "p", active: "a", passive: "s" } as const;
const ROLE_BACK: Record<string, string> = { p: "actpass", a: "active", s: "passive" };

const ice = { to: (s: string) => s.replace(/\+/g, "-").replace(/\//g, "_"), from: (s: string) => s.replace(/-/g, "+").replace(/_/g, "/") };
const b64url = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};

/** The short form, or undefined if this description does not fit it (then the full one is sent). */
export function compactSdp(sdp: string): string | undefined {
  const one = (re: RegExp) => re.exec(sdp)?.[1];
  const ufrag = one(/^a=ice-ufrag:(\S+)$/m);
  const pwd = one(/^a=ice-pwd:(\S+)$/m);
  const fp = one(/^a=fingerprint:sha-256 ([0-9A-Fa-f:]{95})$/m);
  const role = one(/^a=setup:(actpass|active|passive)$/m) as keyof typeof ROLE | undefined;
  if (!ufrag || !pwd || !fp || !role) return undefined;
  if (!/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/m.test(sdp)) return undefined;
  // Several media sections, or ICE characters the short form cannot carry, mean the full form.
  if ((sdp.match(/^m=/gm) ?? []).length !== 1 || /[~!*\s]/.test(ufrag + pwd)) return undefined;
  const candidates = [...sdp.matchAll(/^a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host\b/gim)].map((m) => `${m[1]}*${m[2]}`);
  if (candidates.length === 0 || candidates.some((c) => /[~!]/.test(c))) return undefined;
  const fingerprint = b64url.encode(Uint8Array.from(fp.split(":"), (h) => parseInt(h, 16)));
  return [ice.to(ufrag), ice.to(pwd), fingerprint, ROLE[role], candidates.join("!")].join("~");
}

/** The full description for a short form. */
export function expandSdp(short: string): string {
  const [ufrag, pwd, fingerprint, role, candidates] = short.split("~");
  const setup = ROLE_BACK[role];
  if (!ufrag || !pwd || !fingerprint || !setup || !candidates) throw new Error("not a short description");
  const fp = Array.from(b64url.decode(fingerprint), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
  if (fp.length !== 95) throw new Error("bad fingerprint");
  const session = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b % 10).join("").replace(/^0/, "1");
  const lines = [
    "v=0",
    `o=- ${session}0000000000 2 IN IP4 127.0.0.1`,
    "s=-",
    "t=0 0",
    "a=group:BUNDLE 0",
    "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    "c=IN IP4 0.0.0.0",
    ...candidates.split("!").map((c, i) => {
      const at = c.lastIndexOf("*");
      const address = c.slice(0, at);
      const port = c.slice(at + 1);
      if (!address || !/^\d+$/.test(port)) throw new Error("bad candidate");
      // Host candidates, highest priority first, as the browser listed them.
      return `a=candidate:${i + 1} 1 udp ${2113937151 - i * 256} ${address} ${port} typ host generation 0`;
    }),
    `a=ice-ufrag:${ice.from(ufrag)}`,
    `a=ice-pwd:${ice.from(pwd)}`,
    "a=ice-options:trickle",
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${setup}`,
    "a=mid:0",
    "a=sctp-port:5000",
    "a=max-message-size:262144",
  ];
  return lines.join("\r\n") + "\r\n";
}

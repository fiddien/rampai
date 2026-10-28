import { describe, expect, test } from "vitest";
import { encode } from "uqr";
import jsQR from "jsqr";
import { codeFromText, linkUrl } from "../src/sync/linkCodes";
import { parseRoute } from "../src/app/router";
import { encodeSignal } from "../src/sync/webrtc";

const sdp = "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\n" +
  "a=candidate:1 1 udp 2113937151 0b5f2a3c-1d2e-4f50-9a8b-7c6d5e4f3a2b.local 54400 typ host generation 0 network-cost 999\r\n".repeat(3) +
  "a=ice-ufrag:abcd\r\na=ice-pwd:abcdefghijklmnopqrstuvwx\r\na=fingerprint:sha-256 " + "AB:".repeat(31) + "AB\r\na=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\n";

/** Draw a QR code as RGBA pixels, as a camera would see a screen. */
function pixels(text: string, scale = 4) {
  const qr = encode(text, { ecc: "L", border: 3 });
  const n = qr.size * scale;
  const data = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = qr.data[Math.floor(y / scale)][Math.floor(x / scale)] ? 0 : 255;
      data.set([v, v, v, 255], (y * n + x) * 4);
    }
  return { data, n, version: qr.version };
}

describe("link codes as QR codes", () => {
  test("a real-sized offer, as a link, fits a QR code that decodes back to the same code", async () => {
    const offer = await encodeSignal({ t: "offer", s: sdp });
    const url = linkUrl(offer, "https://fiddien.github.io/rampai/");
    const { data, n, version } = pixels(url);
    expect(version).toBeLessThanOrEqual(25);
    const read = jsQR(data, n, n);
    expect(read?.data).toBe(url);
    expect(codeFromText(read!.data)).toBe(offer);
  });

  test("codes are found in links, bare, or wrapped across lines", () => {
    const code = "rampai1.AbC_d-9";
    expect(codeFromText(`https://x.y/rampai/#/link?code=${code}`)).toBe(code);
    expect(codeFromText(` ${code}\n`)).toBe(code);
    expect(codeFromText("rampai1.AbC_\nd-9")).toBe(code);
    expect(codeFromText("https://example.com/")).toBeUndefined();
  });

  test("the Link page reads a code from the address", () => {
    expect(parseRoute("#/link?code=rampai1.abc-_9")).toEqual({ page: "link", code: "rampai1.abc-_9" });
    expect(parseRoute("#/link")).toEqual({ page: "link" });
  });
});

import { compactSdp, expandSdp } from "../src/sync/compactSdp";
import { decodeSignal } from "../src/sync/webrtc";

const chromeOffer = [
  "v=0", "o=- 4096396529320108226 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0", "a=extmap-allow-mixed", "a=msid-semantic: WMS",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
  "a=candidate:3674500190 1 udp 2113937151 e4613761-f61e-444d-95a3-2b56f5eefa13.local 37104 typ host generation 0 network-cost 999",
  "a=candidate:3674500191 1 udp 2113939711 fe80::1c2b:3cff:fe4d:5e6f 37105 typ host generation 0 network-cost 999",
  "a=candidate:1 1 tcp 1518280447 192.168.1.5 9 typ host tcptype active generation 0",
  "a=ice-ufrag:ZWqI", "a=ice-pwd:ixPa2C5+2u6bNmR/wxv2yksz", "a=ice-options:trickle",
  "a=fingerprint:sha-256 7E:5F:6A:5B:33:EC:13:2E:73:B2:59:0C:A1:52:2C:24:31:41:C6:B2:AA:8A:F8:56:6D:A7:42:09:92:82:24:83",
  "a=setup:actpass", "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144", "",
].join("\r\n");
const firefoxAnswer = [
  "v=0", "o=mozilla...THIS_IS_SDPARTA-99.0 1 0 IN IP4 0.0.0.0", "s=-", "t=0 0", "a=fingerprint:sha-256 7E:5F:6A:5B:33:EC:13:2E:73:B2:59:0C:A1:52:2C:24:31:41:C6:B2:AA:8A:F8:56:6D:A7:42:09:92:82:24:83",
  "a=group:BUNDLE 0", "a=ice-options:trickle", "a=msid-semantic:WMS *", "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
  "a=candidate:0 1 UDP 2122252543 0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.local 50000 typ host", "a=sendrecv", "a=ice-pwd:0123456789abcdef01234567", "a=ice-ufrag:a1b2c3d4",
  "a=mid:0", "a=setup:active", "a=sctp-port:5000", "a=max-message-size:1073741823", "",
].join("\r\n");

describe("short session descriptions", () => {
  test("keep everything a connection needs, from Chrome and from Firefox", () => {
    for (const [sdp, setup] of [[chromeOffer, "actpass"], [firefoxAnswer, "active"]] as const) {
      const short = compactSdp(sdp)!;
      expect(short).toBeTruthy();
      const full = expandSdp(short);
      for (const line of sdp.split("\r\n").filter((l) => /^a=(ice-ufrag|ice-pwd|fingerprint):/.test(l))) expect(full).toContain(line);
      expect(full).toContain(`a=setup:${setup}`);
      expect(full).toMatch(/^m=application 9 UDP\/DTLS\/SCTP webrtc-datachannel$/m);
    }
    const full = expandSdp(compactSdp(chromeOffer)!);
    expect(full).toContain("e4613761-f61e-444d-95a3-2b56f5eefa13.local 37104 typ host");
    expect(full).toContain("fe80::1c2b:3cff:fe4d:5e6f 37105 typ host");
    expect(full).not.toContain("tcp");
  });

  test("make a code a third of the size, for a small QR code, and decode as the same kind", async () => {
    const short = await encodeSignal({ t: "offer", s: chromeOffer });
    expect(short.startsWith("rampai2.o~")).toBe(true);
    expect(short.length).toBeLessThan(220);
    const qr = encode(linkUrl(short, "https://fiddien.github.io/rampai/"), { ecc: "L", border: 3 });
    expect(qr.version).toBeLessThanOrEqual(10);
    expect((await decodeSignal(short, "offer")).s).toContain("a=ice-pwd:ixPa2C5+2u6bNmR/wxv2yksz");
    await expect(decodeSignal(short, "answer")).rejects.toThrow(/not the answer code/);
  });

  test("an unusual description is sent whole instead", async () => {
    const twoSections = chromeOffer.replace("a=mid:0", "a=mid:0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111");
    expect(compactSdp(twoSections)).toBeUndefined();
    expect((await encodeSignal({ t: "offer", s: twoSections })).startsWith("rampai1.")).toBe(true);
    expect(compactSdp(chromeOffer.replace(/^a=candidate:.*udp.*$/gm, "x"))).toBeUndefined();
  });

  test("codes in the short form survive a link and the address bar", () => {
    const code = `rampai2.o~${compactSdp(chromeOffer)}`;
    expect(codeFromText(linkUrl(code, "https://x.y/rampai/"))).toBe(code);
    expect(parseRoute(`#/link?code=${code}`)).toEqual({ page: "link", code });
    expect(parseRoute(`#/link?code=${encodeURIComponent(code)}`)).toEqual({ page: "link", code });
  });
});

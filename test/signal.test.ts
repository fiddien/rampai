import { describe, expect, test } from "vitest";
import { decodeSignal, encodeSignal } from "../src/sync/webrtc";

const sdp = "v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\n" + "a=candidate:1 1 udp 2113937151 192.168.1.5 54400 typ host\r\n".repeat(20);

describe("connection codes", () => {
  test("a code round-trips, is made of safe characters, and is shorter than the description", async () => {
    const code = await encodeSignal({ t: "offer", s: sdp });
    expect(code).toMatch(/^rampai1\.[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(sdp.length);
    expect(await decodeSignal(code, "offer")).toEqual({ t: "offer", s: sdp });
  });

  test("a code survives being wrapped, spaced or copied with whitespace around it", async () => {
    const code = await encodeSignal({ t: "answer", s: sdp });
    const messy = `  ${code.slice(0, 40)}\n${code.slice(40)} \n`;
    expect((await decodeSignal(messy, "answer")).s).toBe(sdp);
  });

  test("garbage, a truncated code, and the wrong kind of code are refused with a helpful message", async () => {
    const offer = await encodeSignal({ t: "offer", s: sdp });
    await expect(decodeSignal("hello", "offer")).rejects.toThrow(/not a code from the other device/);
    await expect(decodeSignal(offer.slice(0, 30), "offer")).rejects.toThrow(/not a code/);
    await expect(decodeSignal(offer, "answer")).rejects.toThrow(/not the answer code/);
  });
});

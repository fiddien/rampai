import type { Transport } from "./transport";
import { compactSdp, expandSdp } from "./compactSdp";

/**
 * A direct connection between two browsers, with no server. The two devices
 * swap a short code each (by copy and paste, or a QR code), and the
 * connection is a WebRTC data channel between them.
 *
 * Only the local network is used: no STUN or TURN server is configured, so the
 * devices can find each other only through the addresses they share on one
 * network. The channel is encrypted by WebRTC, and everything sent over it is
 * sealed again with the key from the writer's recovery words, so a code that
 * reached the wrong device would connect it to nothing it could read.
 */
const ICE_WAIT_MS = 4000;
const BUFFER_HIGH = 1 << 20;

export interface DeviceLink {
  transport: Transport;
  close(): void;
  /** Called once when the connection ends, for any reason. */
  onClosed(listener: () => void): void;
}

// ——— Codes ———

type Signal = { t: "offer" | "answer"; s: string };

const b64 = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  decode: (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes.slice()]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/**
 * A code is the session description. Usually only its varying parts are sent
 * (`rampai2.`, about a quarter of the size, for a small QR code); a description
 * that does not fit that form is sent whole, deflated (`rampai1.`).
 */
export async function encodeSignal(signal: Signal): Promise<string> {
  const short = compactSdp(signal.s);
  if (short) return `rampai2.${signal.t === "offer" ? "o" : "a"}~${short}`;
  const raw = new TextEncoder().encode(JSON.stringify(signal));
  if (typeof CompressionStream === "undefined") return `rampai0.${b64.encode(raw)}`;
  return `rampai1.${b64.encode(await pipe(raw, new CompressionStream("deflate-raw")))}`;
}

export async function decodeSignal(code: string, expect: Signal["t"]): Promise<Signal> {
  const text = code.trim().replace(/\s+/g, "");
  const dot = text.indexOf(".");
  const tag = text.slice(0, dot);
  const body = text.slice(dot + 1);
  try {
    if (tag === "rampai2") {
      const kind = body.startsWith("o~") ? "offer" : body.startsWith("a~") ? "answer" : undefined;
      if (kind !== expect) throw new Error("wrong kind");
      return { t: kind, s: expandSdp(body.slice(2)) };
    }
    if ((tag !== "rampai0" && tag !== "rampai1") || !body) throw new Error("not a code");
    const bytes = b64.decode(body);
    const raw = tag === "rampai1" ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
    const signal = JSON.parse(new TextDecoder().decode(raw)) as Signal;
    if (signal.t !== expect || typeof signal.s !== "string") throw new Error("wrong kind");
    return signal;
  } catch {
    throw new Error(expect === "offer" ? "That is not a code from the other device. Copy it again in full." : "That is not the answer code. Copy it again in full.");
  }
}

// ——— Connection ———

function newConnection(): RTCPeerConnection {
  // No iceServers: the local network only.
  return new RTCPeerConnection({ iceServers: [] });
}

function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, ICE_WAIT_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

function linkOver(pc: RTCPeerConnection, channel: RTCDataChannel): Promise<DeviceLink> {
  channel.binaryType = "arraybuffer";
  const listeners = new Set<(data: Uint8Array) => void>();
  const closed = new Set<() => void>();
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    closed.forEach((f) => f());
  };
  channel.addEventListener("message", (e) => listeners.forEach((l) => l(new Uint8Array(e.data as ArrayBuffer))));
  channel.addEventListener("close", end);
  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") end();
  });

  // Send in order, and wait when the channel's buffer is full.
  let sending: Promise<void> = Promise.resolve();
  channel.bufferedAmountLowThreshold = BUFFER_HIGH / 2;
  const waitForRoom = () =>
    channel.bufferedAmount < BUFFER_HIGH
      ? Promise.resolve()
      : new Promise<void>((resolve) => channel.addEventListener("bufferedamountlow", () => resolve(), { once: true }));
  const transport: Transport = {
    send(data) {
      sending = sending.then(async () => {
        if (channel.readyState !== "open") return;
        await waitForRoom();
        channel.send(data.slice());
      });
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const link: DeviceLink = {
    transport,
    close() {
      channel.close();
      pc.close();
      end();
    },
    onClosed: (f) => void closed.add(f),
  };
  if (channel.readyState === "open") return Promise.resolve(link);
  return new Promise((resolve, reject) => {
    channel.addEventListener("open", () => resolve(link), { once: true });
    pc.addEventListener("connectionstatechange", () => pc.connectionState === "failed" && reject(new Error("The devices could not reach each other. Are they on the same network?")));
  });
}

/** Device A: make an offer code to show, and later accept the answer code that comes back. */
export async function startLink(): Promise<{ offer: string; accept(answer: string): Promise<DeviceLink> }> {
  const pc = newConnection();
  const channel = pc.createDataChannel("rampai", { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const offer = await encodeSignal({ t: "offer", s: pc.localDescription!.sdp });
  return {
    offer,
    async accept(answerCode) {
      const answer = await decodeSignal(answerCode, "answer");
      await pc.setRemoteDescription({ type: "answer", sdp: answer.s });
      return linkOver(pc, channel);
    },
  };
}

/** Device B: take the offer code, make an answer code to show, and wait for the connection. */
export async function joinLink(offerCode: string): Promise<{ answer: string; connected: Promise<DeviceLink> }> {
  const offer = await decodeSignal(offerCode, "offer");
  const pc = newConnection();
  const opened = new Promise<RTCDataChannel>((resolve) => pc.addEventListener("datachannel", (e) => resolve(e.channel), { once: true }));
  await pc.setRemoteDescription({ type: "offer", sdp: offer.s });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  const answer = await encodeSignal({ t: "answer", s: pc.localDescription!.sdp });
  return { answer, connected: opened.then((channel) => linkOver(pc, channel)) };
}

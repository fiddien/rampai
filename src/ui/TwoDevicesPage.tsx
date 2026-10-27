import { useEffect, useState } from "react";
import type { Node } from "prosemirror-model";
import { schema } from "../editor/schema";
import { newBlockId } from "../editor/blockIds";
import { createDoc } from "../sync/model";
import { connect } from "../sync/peer";
import { MemoryLink, encrypted, type Transport } from "../sync/transport";
import { generateKey } from "../sync/crypto";
import { useApp } from "../app/context";
import { Toolbar } from "./Toolbar";
import { useEditor } from "./useEditor";
import type { LoroDoc } from "loro-crdt";

function seedDraft(): Node {
  const p = (type: string, text: string) => schema.node(type, { id: newBlockId() }, text ? [schema.text(text)] : []);
  return schema.node("doc", null, [
    p("heading1", "Two devices, one draft"),
    p("paragraph", "Turn the network off. On the laptop, move this paragraph down with Alt+↓. On the phone, add a sentence to it."),
    p("paragraph", "Turn the network back on. The phone's sentence follows the paragraph to its new place."),
    p("paragraph", "Everything between the devices is encrypted. The line under each one shows what it last received."),
  ]);
}

function hex(bytes: Uint8Array, n = 28): string {
  return Array.from(bytes.subarray(0, n), (b) => b.toString(16).padStart(2, "0")).join(" ") + (bytes.length > n ? " …" : "");
}

function Device({ name, doc, initial, transport, keyPromise, register }: { name: string; doc: LoroDoc; initial?: Node; transport: Transport; keyPromise: Promise<CryptoKey>; register: (hello: () => void) => () => void }) {
  const { say } = useApp();
  const { ref, handle, tick } = useEditor(doc, { initial, onBlockedPaste: () => say("Rampai only takes typed words. Try saying it in your own.") });
  const [wire, setWire] = useState("Waiting for the other device…");
  useEffect(() => {
    if (!handle) return;
    let stop = () => {};
    let cancelled = false;
    void keyPromise.then((key) => {
      if (cancelled) return;
      const watched: Transport = {
        send: transport.send,
        onMessage: (listener) =>
          transport.onMessage((data) => {
            setWire(`Received ${data.length} encrypted bytes: ${hex(data)}`);
            listener(data);
          }),
      };
      const peer = connect(handle.binding, encrypted(watched, key));
      const unregister = register(peer.hello);
      stop = () => {
        unregister();
        peer.stop();
      };
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [handle, transport, keyPromise, register]);
  return (
    <section className="device" aria-label={name}>
      <div className="device-head">
        <b>{name}</b>
        <Toolbar view={handle?.view} tick={tick} compact />
      </div>
      <div ref={ref} />
      <div className="wire">{wire}</div>
    </section>
  );
}

/** Two simulated devices on one page, with a switch for the network between them. */
export function TwoDevicesPage() {
  const { say } = useApp();
  const [setup] = useState(() => {
    const link = new MemoryLink();
    const laptop = createDoc(1);
    const phone = createDoc(2);
    const hellos = new Set<() => void>();
    link.whenReconnected(() => hellos.forEach((h) => h()));
    const register = (hello: () => void) => {
      hellos.add(hello);
      return () => void hellos.delete(hello);
    };
    return { link, laptop, phone, register, key: generateKey(), seed: seedDraft() };
  });
  const [online, setOnline] = useState(true);
  // The phone starts as a copy of the laptop's draft, as pairing would leave it.
  const [phoneReady, setPhoneReady] = useState(false);
  useEffect(() => {
    if (phoneReady) return;
    const id = setTimeout(() => {
      setup.phone.import(setup.laptop.export({ mode: "snapshot" }));
      setPhoneReady(true);
    });
    return () => clearTimeout(id);
  }, [phoneReady, setup]);

  return (
    <>
      <header className="toolbar" style={{ maxWidth: "72rem" }}>
        <a className="brand" href="#/">
          <b>Rampai</b> · two devices, one draft
        </a>
        <button
          type="button"
          className="network"
          aria-pressed={online}
          onClick={() => {
            setup.link.setOnline(!online);
            setOnline(!online);
            say(!online ? "Back on the same network. Catching up…" : "Off the network. Keep writing on both.");
          }}
        >
          <span className="dot" />
          {online ? "Same network: on" : "Same network: off"}
        </button>
      </header>
      <main className="duo">
        <div className="duo-intro">
          <p>
            Rampai keeps every draft on your own devices and syncs them directly when they share a network. There is no server in between. This page simulates a laptop and
            a phone so you can try it in one window.
          </p>
        </div>
        <div className="duo-grid">
          <Device name="Laptop" doc={setup.laptop} initial={setup.seed} transport={setup.link.a} keyPromise={setup.key} register={setup.register} />
          {phoneReady && <Device name="Phone" doc={setup.phone} transport={setup.link.b} keyPromise={setup.key} register={setup.register} />}
        </div>
      </main>
    </>
  );
}

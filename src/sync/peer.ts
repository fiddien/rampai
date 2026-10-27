import { VersionVector } from "loro-crdt";
import type { Transport } from "./transport";
import type { DocBinding } from "./binding";

const UPDATE = 0;
const HELLO = 1;

function frame(kind: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 1);
  out[0] = kind;
  out.set(body, 1);
  return out;
}

/**
 * Connects a bound document to a transport.
 *
 * Local changes are sent as Loro updates. On connecting (and after a
 * reconnect), a device says hello with its version vector, and the other side
 * answers with exactly the changes it is missing.
 */
export function connect(binding: DocBinding, transport: Transport): { hello(): void; stop(): void } {
  const { doc } = binding;
  const unsubscribeLocal = doc.subscribeLocalUpdates((update) => transport.send(frame(UPDATE, update)));
  const unsubscribeRemote = transport.onMessage((data) => {
    const kind = data[0];
    const body = data.subarray(1);
    if (kind === UPDATE) {
      binding.receive(body);
    } else if (kind === HELLO) {
      const theirs = VersionVector.decode(body);
      const missing = doc.export({ mode: "update", from: theirs });
      if (missing.length > 0) transport.send(frame(UPDATE, missing));
    }
  });
  const hello = () => transport.send(frame(HELLO, doc.oplogVersion().encode()));
  hello();
  return {
    hello,
    stop() {
      unsubscribeLocal();
      unsubscribeRemote();
    },
  };
}

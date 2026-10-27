import { useEffect, useRef, useState } from "react";
import { Anchor, Button, CopyButton, Group, Text, Textarea } from "@mantine/core";
import { chunked } from "../sync/chunks";
import { LibrarySync } from "../sync/librarySync";
import { encrypted } from "../sync/transport";
import { tabNotifier } from "../sync/tabs";
import { joinLink, startLink, type DeviceLink } from "../sync/webrtc";
import { useApp } from "../app/context";
import { NavBar } from "./Nav";
import { plural } from "./format";

const WRONG_KEY_MS = 6000;

type Step = { kind: "choose" } | { kind: "offer"; offer: string; accept(answer: string): Promise<DeviceLink> } | { kind: "join"; answer?: string } | { kind: "linked" };

function CodeBox({ label, value, onChange, readOnly }: { label: string; value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
  return (
    <Textarea
      className="code-box"
      label={label}
      value={value}
      readOnly={readOnly}
      autosize
      minRows={3}
      maxRows={6}
      spellCheck={false}
      autoCapitalize="none"
      styles={{ input: { fontFamily: "var(--mantine-font-family-monospace)", fontSize: 12 } }}
      onChange={(e) => onChange?.(e.currentTarget.value)}
    />
  );
}

function Copy({ value }: { value: string }) {
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Button variant="default" size="xs" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      )}
    </CopyButton>
  );
}

/**
 * Link two devices that have the same recovery words. One shows a code, the
 * other pastes it and shows an answer, and the answer is pasted back. Then the
 * two exchange their libraries over a direct connection, sealed with the key.
 * The link lasts while this page is open.
 */
export function LinkPage() {
  const { store, device } = useApp();
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [status, setStatus] = useState("");
  const [answerIn, setAnswerIn] = useState("");
  const [offerIn, setOfferIn] = useState("");
  const [busy, setBusy] = useState(false);
  const live = useRef<{ close(): void } | null>(null);

  // Leaving the page ends the link.
  useEffect(() => () => live.current?.close(), []);

  if (!device) return null;
  const key = device.key;
  const fail = (e: unknown) => setStatus(e instanceof Error ? e.message : "Something went wrong. Try again.");

  function linked(link: DeviceLink) {
    setStep({ kind: "linked" });
    setStatus("Linked. Looking for drafts to exchange…");
    let accepted = false;
    let settled = false;
    const n = { received: 0, created: 0, deleted: 0, unsaved: 0 };
    const summary = () => {
      const parts: string[] = [];
      if (n.received) parts.push(`${plural(n.received, "update", "updates")} received (${plural(n.created, "new draft", "new drafts")})`);
      if (n.deleted) parts.push(`${plural(n.deleted, "draft", "drafts")} deleted here, as on the other device`);
      if (n.unsaved) parts.push(`${plural(n.unsaved, "draft", "drafts")} could not be saved, because this device's storage is full`);
      return parts.length ? `Up to date. ${parts.join("; ")}.` : "Linked. Both devices already have the same drafts.";
    };
    const report = () => setStatus(settled ? summary() : `Receiving… ${plural(n.received, "update", "updates")} so far.`);
    const wrong = setTimeout(() => {
      if (!accepted) setStatus("These devices were made with different recovery words, so nothing can be shared. Check the words on both.");
    }, WRONG_KEY_MS);
    const tabs = tabNotifier(key);
    const sync = new LibrarySync(
      store,
      encrypted(chunked(link.transport), key),
      {
        onActivity() {
          accepted = true;
          clearTimeout(wrong);
        },
        onUpdate(_id, isNew) {
          n.received += 1;
          if (isNew) n.created += 1;
          report();
        },
        onDeleted() {
          n.deleted += 1;
          report();
        },
        onStorageFull() {
          n.unsaved += 1;
          report();
        },
        // Every request has been answered: the libraries are level.
        onSettled() {
          settled = true;
          report();
        },
      },
      // A draft open in another tab of this browser hears about it too, so that tab's next save does not overwrite it.
      (id, update) => tabs.send(id, update),
    );
    let closed = false;
    const end = () => {
      if (closed) return;
      closed = true;
      clearTimeout(wrong);
      sync.stop();
      tabs.close();
    };
    link.onClosed(() => {
      end();
      setStatus("The link has closed. Your drafts are saved on this device.");
    });
    live.current = {
      close() {
        end();
        link.close();
      },
    };
    sync.start();
  }

  return (
    <>
      <NavBar active="link" wordsMissing={device.source === "random"} />
      <main className="page onboarding">
        <h1 className="home-title">Link a device</h1>
        <p className="lede">
          Link two devices that are on the same network, with no server in between. Your drafts go from one to the other, sealed with your recovery words.
        </p>
        {device.source === "random" ? (
          <p className="form-message">
            This device has no recovery words yet, so it cannot be linked. <Anchor href="#/welcome">Make recovery words</Anchor> first, and use the same words on the other
            device.
          </p>
        ) : (
          <>
            {step.kind === "choose" && (
              <Group className="actions">
                <Button
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    setStatus("Making a code…");
                    try {
                      const started = await startLink();
                      setStep({ kind: "offer", offer: started.offer, accept: started.accept });
                      setStatus("Waiting for the answer code.");
                    } catch (e) {
                      fail(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Show a code on this device
                </Button>
                <Button variant="default" onClick={() => setStep({ kind: "join" })}>
                  Enter a code from the other device
                </Button>
              </Group>
            )}
            {step.kind === "offer" && (
              <div className="link-steps">
                <CodeBox label="1. Copy this code to the other device" value={step.offer} readOnly />
                <Copy value={step.offer} />
                <CodeBox label="2. Paste the answer code from the other device" value={answerIn} onChange={setAnswerIn} />
                <Button
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    setStatus("Connecting…");
                    try {
                      linked(await step.accept(answerIn));
                    } catch (e) {
                      fail(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Connect
                </Button>
              </div>
            )}
            {step.kind === "join" && (
              <div className="link-steps">
                <CodeBox label="1. Paste the code from the other device" value={offerIn} onChange={setOfferIn} readOnly={!!step.answer} />
                {!step.answer ? (
                  <Button
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      setStatus("Making an answer code…");
                      try {
                        const joined = await joinLink(offerIn);
                        setStep({ kind: "join", answer: joined.answer });
                        setStatus("Waiting for the other device to connect…");
                        setBusy(false);
                        linked(await joined.connected);
                      } catch (e) {
                        fail(e);
                        setBusy(false);
                      }
                    }}
                  >
                    Make an answer code
                  </Button>
                ) : (
                  <>
                    <CodeBox label="2. Copy this answer code back to the other device" value={step.answer} readOnly />
                    <Copy value={step.answer} />
                  </>
                )}
              </div>
            )}
            {step.kind === "linked" && (
              <div className="link-steps">
                <Button component="a" href="#/">
                  Back to my drafts
                </Button>
              </div>
            )}
            <p className="link-status" role="status">
              {status}
            </p>
            <Text className="soft">
              Want to see how it works first? <Anchor href="#two-devices">Watch two simulated devices sync</Anchor>.
            </Text>
          </>
        )}
      </main>
    </>
  );
}

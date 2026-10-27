import { useState } from "react";
import { Anchor, Button, CopyButton, Group, Text, Textarea } from "@mantine/core";
import { joinLink, startLink, type DeviceLink } from "../sync/webrtc";
import { startSession, useLinkSession, useLinkStatus, type LinkSession } from "../app/linkSession";
import { useApp } from "../app/context";
import { NavBar } from "./Nav";

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
 * two exchange their libraries over a direct connection, sealed with the key,
 * and stay linked while the app is open on both: drafts open on either side
 * receive the other's edits as they are typed.
 */
export function LinkPage() {
  const { store, device } = useApp();
  const current = useLinkSession();
  // The session this page started stays on screen after it ends, to say how it ended.
  const [mine, setMine] = useState<LinkSession | null>(null);
  const session = current ?? mine;
  const status = useLinkStatus(session);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const [message, setMessage] = useState("");
  const [answerIn, setAnswerIn] = useState("");
  const [offerIn, setOfferIn] = useState("");
  const [busy, setBusy] = useState(false);

  if (!device) return null;
  const key = device.key;
  const fail = (e: unknown) => setMessage(e instanceof Error ? e.message : "Something went wrong. Try again.");
  const linked = (link: DeviceLink) => {
    setMine(startSession(store, key, link));
    setStep({ kind: "linked" });
    setMessage("");
  };
  const isLinked = !!current && status.state === "linked";

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
            {isLinked && (
              <Group className="actions">
                <Button component="a" href="#/">
                  Back to my drafts
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    // Keep showing this session, so the page says it has ended.
                    setMine(current);
                    current?.close();
                  }}
                >
                  Unlink
                </Button>
              </Group>
            )}
            {!isLinked && (step.kind === "choose" || step.kind === "linked") && (
              <Group className="actions">
                <Button
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    setMessage("Making a code…");
                    try {
                      const started = await startLink();
                      setStep({ kind: "offer", offer: started.offer, accept: started.accept });
                      setMessage("Waiting for the answer code.");
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
            {!isLinked && step.kind === "offer" && (
              <div className="link-steps">
                <CodeBox label="1. Copy this code to the other device" value={step.offer} readOnly />
                <Copy value={step.offer} />
                <CodeBox label="2. Paste the answer code from the other device" value={answerIn} onChange={setAnswerIn} />
                <Button
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    setMessage("Connecting…");
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
            {!isLinked && step.kind === "join" && (
              <div className="link-steps">
                <CodeBox label="1. Paste the code from the other device" value={offerIn} onChange={setOfferIn} readOnly={!!step.answer} />
                {!step.answer ? (
                  <Button
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      setMessage("Making an answer code…");
                      try {
                        const joined = await joinLink(offerIn);
                        setStep({ kind: "join", answer: joined.answer });
                        setMessage("Waiting for the other device to connect…");
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
            <p className="link-status" role="status">
              {message || status.text}
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

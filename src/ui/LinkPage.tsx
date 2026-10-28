import { useEffect, useRef, useState } from "react";
import { Anchor, Button, CopyButton, Group, Text, Textarea } from "@mantine/core";
import { joinLink, startLink, type DeviceLink } from "../sync/webrtc";
import { startSession, useLinkSession, useLinkStatus, type LinkSession } from "../app/linkSession";
import { useApp } from "../app/context";
import { NavBar } from "./Nav";
import { QrCode } from "./Qr";
import { QrScanner } from "./QrScanner";
import { codeFromText, linkUrl } from "../sync/linkCodes";

/** A code that arrived in a scanned link before this device was set up, kept for after. */
export const PENDING_LINK_CODE = "rampai:pending-link-code";

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
 * Link two devices that have the same recovery words. One shows a code, as a
 * QR code and as text; the other scans it (with its own camera app, or here)
 * or pastes it, and shows an answer the same way, which goes back. Then the
 * two exchange their libraries over a direct connection, sealed with the key,
 * and stay linked while the app is open on both: drafts open on either side
 * receive the other's edits as they are typed.
 */
export function LinkPage({ code }: { code?: string }) {
  const { store, device, session: tabSession } = useApp();
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
  const [scanning, setScanning] = useState<"offer" | "answer" | null>(null);

  const key = device?.key;
  const fail = (e: unknown) => setMessage(e instanceof Error ? e.message : "Something went wrong. Try again.");
  const linked = (link: DeviceLink) => {
    if (!key) return;
    setMine(startSession(store, key, link));
    setStep({ kind: "linked" });
    setMessage("");
  };

  async function show() {
    setBusy(true);
    setMessage("Making a code…");
    try {
      const started = await startLink();
      setStep({ kind: "offer", offer: started.offer, accept: started.accept });
      setMessage("Waiting for the other device's answer.");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function join(offer: string) {
    setStep({ kind: "join" });
    setOfferIn(offer);
    setBusy(true);
    setMessage("Making an answer code…");
    try {
      const joined = await joinLink(offer);
      setStep({ kind: "join", answer: joined.answer });
      setMessage("Waiting for the other device to connect…");
      setBusy(false);
      linked(await joined.connected);
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  }

  async function accept(answer: string, offerStep: Extract<Step, { kind: "offer" }>) {
    setBusy(true);
    setMessage("Connecting…");
    try {
      linked(await offerStep.accept(answer));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  // A code that arrived in the address (scanned with the phone's camera app) starts the answer at once.
  const usedCode = useRef(false);
  useEffect(() => {
    if (usedCode.current || !device || device.source !== "passphrase") return;
    const arrived = code ?? tabSession.getItem(PENDING_LINK_CODE) ?? undefined;
    if (!arrived) return;
    usedCode.current = true;
    tabSession.removeItem(PENDING_LINK_CODE);
    // The code has done its work; keep it out of the address bar and the history.
    history.replaceState(history.state, "", `${location.pathname}${location.search}#/link`);
    void join(arrived);
  }, [code, device]);

  if (!device) return null;
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
                <Button loading={busy} onClick={show}>
                  Show a code on this device
                </Button>
                <Button variant="default" onClick={() => setStep({ kind: "join" })}>
                  Scan or enter a code from the other device
                </Button>
              </Group>
            )}
            {!isLinked && step.kind === "offer" && (
              <div className="link-steps">
                <div className="qr-pair">
                  <Text fw={500}>1. Scan this with the other device</Text>
                  <QrCode value={linkUrl(step.offer)} label="Link code for the other device" />
                  <Text c="dimmed">Its camera app opens Rampai with the code filled in. No camera? Copy the code instead.</Text>
                  <Copy value={step.offer} />
                </div>
                <Text fw={500} mt="md">
                  2. Then bring its answer back here
                </Text>
                <Button variant="default" onClick={() => setScanning("answer")}>
                  Scan the answer
                </Button>
                <CodeBox label="Or paste the answer code" value={answerIn} onChange={setAnswerIn} />
                <Button loading={busy} disabled={!codeFromText(answerIn)} onClick={() => accept(codeFromText(answerIn)!, step)}>
                  Connect
                </Button>
                <QrScanner
                  opened={scanning === "answer"}
                  title="Scan the answer"
                  onClose={() => setScanning(null)}
                  onCode={(answer) => {
                    setScanning(null);
                    setAnswerIn(answer);
                    void accept(answer, step);
                  }}
                />
              </div>
            )}
            {!isLinked && step.kind === "join" && (
              <div className="link-steps">
                {!step.answer ? (
                  <>
                    <Button variant="default" onClick={() => setScanning("offer")}>
                      Scan the other device's code
                    </Button>
                    <CodeBox label="Or paste the code from the other device" value={offerIn} onChange={setOfferIn} />
                    <Button loading={busy} disabled={!codeFromText(offerIn)} onClick={() => join(codeFromText(offerIn)!)}>
                      Make an answer code
                    </Button>
                    <QrScanner
                      opened={scanning === "offer"}
                      title="Scan the other device's code"
                      onClose={() => setScanning(null)}
                      onCode={(offer) => {
                        setScanning(null);
                        void join(offer);
                      }}
                    />
                  </>
                ) : (
                  <div className="qr-pair">
                    <Text fw={500}>Show this answer to the other device</Text>
                    <QrCode value={step.answer} label="Answer code for the other device" />
                    <Text c="dimmed">On the other device, choose "Scan the answer". No camera? Copy the code instead.</Text>
                    <Copy value={step.answer} />
                  </div>
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

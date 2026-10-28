import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, CopyButton, Group, Stack, Text, TextInput, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { generateKey } from "../sync/crypto";
import { deriveKey, saveDeviceKey, wordsMatchKey, type KeySource } from "../sync/keys";
import { checkPassphrase, confirmMatches, confirmPositions, generatePassphrase } from "../sync/passphrase";
import { useApp, type Session } from "../app/context";
import { BareBar, NavBar } from "./Nav";

/**
 * Setting up a writer's devices. The recovery words are shown once and kept
 * only in this tab's session until the writer proves they wrote them down;
 * then the key made from them is what the device keeps. Pasting is allowed in
 * these fields: they hold a passphrase, not the writer's own prose.
 */
const PENDING = "rampai:pending-words";
const POSITIONS = "rampai:pending-positions";

/** Words waiting to be confirmed, if any. A damaged value counts as none. */
export function pendingWords(session: Pick<Session, "getItem">): string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(session.getItem(PENDING) ?? "null");
    return Array.isArray(parsed) && parsed.every((w) => typeof w === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** A device that already has a key sees the usual bar; a first-time writer sees only the wordmark. */
function Shell({ title, existing, children }: { title: string; existing?: KeySource; children: ReactNode }) {
  return (
    <>
      {existing ? <NavBar active="words" wordsMissing={existing === "random"} /> : <BareBar />}
      <main className="page onboarding">
        <Title order={1} className="home-title">
          {title}
        </Title>
        {children}
      </main>
    </>
  );
}

function Lede({ children }: { children: ReactNode }) {
  return <p className="lede">{children}</p>;
}

function Redirect({ to }: { to: string }) {
  const { go } = useApp();
  useEffect(() => go(to), [go, to]);
  return null;
}

function wordsInputProps() {
  return { autoComplete: "off", autoCapitalize: "none", spellCheck: false } as const;
}

/**
 * A device that already has recovery words is linked to the writer's other
 * devices. New words would cut it off from them, so replacing them is offered
 * only behind a plain warning, never as part of the ordinary welcome.
 */
function GuardExistingWords({ onReplace, heading }: { onReplace: () => void; heading?: string }) {
  const { go } = useApp();
  return (
    <section className={heading ? "backup-part" : undefined}>
      {heading && (
        <Title order={2} className="home-sub">
          {heading}
        </Title>
      )}
      {heading ? (
        <p>This device already has recovery words, and is linked to your other devices by them.</p>
      ) : (
        <Lede>This device already has recovery words, and is linked to your other devices by them.</Lede>
      )}
      <p>
        Setting up different words would cut this device off from the others: it could no longer read what they send, nor they what it sends. Your drafts on this device
        stay where they are either way.
      </p>
      <Group className="actions">
        {/* The bar above already leads back to the drafts; under a heading, only the replacing is offered. */}
        {!heading && <Button onClick={() => go("#/")}>Back to my drafts</Button>}
        <Button
          variant="default"
          onClick={() =>
            modals.openConfirmModal({
              title: "Replace the recovery words on this device?",
              children: <Text size="sm">It will stop syncing with your other devices until they use the same new words.</Text>,
              labels: { confirm: "Replace them", cancel: "Keep them" },
              confirmProps: { color: "red" },
              onConfirm: onReplace,
            })
          }
        >
          Replace this device's recovery words
        </Button>
      </Group>
    </section>
  );
}

/**
 * The words are never stored, so they cannot be shown again. What a writer can
 * do is check that the words they wrote down make this device's key.
 */
function CheckWords({ deviceKey }: { deviceKey: CryptoKey }) {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="backup-part" aria-labelledby="check-heading">
      <Title order={2} className="home-sub" id="check-heading">
        Check the words you wrote down
      </Title>
      <Text className="soft">Rampai never keeps your words, so it cannot show them again. Type them here to check that the ones you wrote down are right.</Text>
      <form
        className="words-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const check = checkPassphrase(value);
          if (!check.ok) return setMessage(check.problem ?? "");
          setBusy(true);
          setMessage("Checking…");
          const right = await wordsMatchKey(check.words, deviceKey);
          setMessage(
            right
              ? "These are the right words for this device. Keep them safe."
              : "These words make a different key from this device's. Compare them with what you wrote down, word by word.",
          );
          if (right) setValue("");
          setBusy(false);
        }}
      >
        <TextInput label="Recovery words" placeholder="seven words, separated by spaces" value={value} onChange={(e) => setValue(e.currentTarget.value)} {...wordsInputProps()} />
        <p className="form-message" role="status">
          {message}
        </p>
        <Button type="submit" loading={busy}>
          Check
        </Button>
      </form>
    </section>
  );
}

export function WelcomePage() {
  const { store, session, device, go, refreshDevice } = useApp();
  const [replacing, setReplacing] = useState(false);
  if (device?.source === "passphrase" && !replacing) {
    return (
      <Shell title="Recovery words" existing="passphrase">
        <CheckWords deviceKey={device.key} />
        <GuardExistingWords heading="Replace them" onReplace={() => setReplacing(true)} />
      </Shell>
    );
  }
  return (
    <Shell title="Welcome" existing={device?.source}>
      <Lede>Rampai is for writing in your own words. Your drafts stay on your own devices and sync between them directly, with no server in between.</Lede>
      <p>
        To link your devices, Rampai gives you seven recovery words. They make the key that keeps your drafts private, and they are the only way to add another device or
        open a backup. There is no copy of your drafts anywhere else, so keep them on at least one device, or in a backup.
      </p>
      <Group className="actions">
        <Button
          onClick={() => {
            session.setItem(PENDING, JSON.stringify(generatePassphrase()));
            session.removeItem(POSITIONS);
            go("#/recovery");
          }}
        >
          Start my writing
        </Button>
        <Button variant="default" onClick={() => go("#/pair")}>
          I already write with Rampai on another device
        </Button>
      </Group>
      <Button
        variant="subtle"
        color="gray"
        px={0}
        onClick={async () => {
          await saveDeviceKey(store, await generateKey(), "random");
          await refreshDevice();
          go("#/");
        }}
      >
        Not now: write on this device only
      </Button>
    </Shell>
  );
}

/** The words as plain text, numbered, for the clipboard or a file. */
export function wordsAsText(words: string[]): string {
  return words.map((w, i) => `${i + 1}. ${w}`).join("\n");
}

/** A small text file with the words, so they can go to a password manager or a printer. */
export function wordsFile(words: string[]): string {
  return [
    "Rampai recovery words",
    "",
    wordsAsText(words),
    "",
    "Anyone who has these words can read your drafts.",
    "Keep them in a password manager or on paper, then delete this file.",
    "",
  ].join("\n");
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function RecoveryPage() {
  const { session, device, go } = useApp();
  const words = pendingWords(session);
  if (!words) return <Redirect to="#/welcome" />;
  return (
    <Shell title="Your recovery words" existing={device?.source}>
      <ol className="words" aria-label="Recovery words, in order">
        {words.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ol>
      <Group gap="xs">
        <CopyButton value={wordsAsText(words)} timeout={2500}>
          {({ copied, copy }) => (
            <Button variant="default" size="xs" onClick={copy}>
              {copied ? "Copied" : "Copy the words"}
            </Button>
          )}
        </CopyButton>
        <Button variant="default" size="xs" onClick={() => downloadText("rampai-recovery-words.txt", wordsFile(words))}>
          Download as a text file
        </Button>
      </Group>
      <p>Write these seven words down, in this order, and keep them somewhere safe. Rampai cannot show them again or recover them for you.</p>
      <Text className="soft">
        Anyone who has them can read your drafts. If you copy or download them, put them in a password manager or print them, then delete the file and clear the
        clipboard: a copy left on this device sits right beside the drafts it unlocks.
      </Text>
      <Group className="actions">
        <Button onClick={() => go("#/recovery/confirm")}>I wrote them down</Button>
      </Group>
    </Shell>
  );
}

function savedPositions(session: Session, total: number): number[] {
  try {
    const saved: unknown = JSON.parse(session.getItem(POSITIONS) ?? "null");
    if (Array.isArray(saved) && saved.every((n) => Number.isInteger(n) && n >= 0 && n < total)) return saved;
  } catch {
    // Damaged: choose afresh.
  }
  const fresh = confirmPositions();
  session.setItem(POSITIONS, JSON.stringify(fresh));
  return fresh;
}

export function ConfirmPage() {
  const { store, session, device, go, refreshDevice } = useApp();
  const words = pendingWords(session);
  const [positions] = useState(() => (words ? savedPositions(session, words.length) : []));
  const [answers, setAnswers] = useState<string[]>(() => positions.map(() => ""));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  if (!words) return <Redirect to="#/welcome" />;
  return (
    <Shell title="Check your words" existing={device?.source}>
      <p>To be sure you wrote them down, type these words from your list.</p>
      <form
        className="words-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!confirmMatches(words, positions, answers)) {
            setMessage("Those do not match your words. Look at your notes, or go back to see the words again.");
            return;
          }
          setBusy(true);
          setMessage("Making your key…");
          await saveDeviceKey(store, await deriveKey(words), "passphrase");
          session.removeItem(PENDING);
          session.removeItem(POSITIONS);
          await refreshDevice();
          go("#/");
        }}
      >
        <Stack gap="sm">
          {positions.map((p, i) => (
            <TextInput
              key={p}
              ref={i === 0 ? first : undefined}
              label={`Word ${p + 1}`}
              value={answers[i]}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setAnswers((a) => a.map((x, j) => (j === i ? v : x)));
              }}
              {...wordsInputProps()}
            />
          ))}
        </Stack>
        <p className="form-message" role="alert">
          {message}
        </p>
        <Button type="submit" loading={busy}>
          Confirm
        </Button>
      </form>
      <Button variant="default" onClick={() => go("#/recovery")}>
        Show my words again
      </Button>
    </Shell>
  );
}

export function PairPage() {
  const { store, device, go, refreshDevice } = useApp();
  const [replacing, setReplacing] = useState(false);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (device?.source === "passphrase" && !replacing) {
    return (
      <Shell title="Add this device" existing="passphrase">
        <GuardExistingWords onReplace={() => setReplacing(true)} />
      </Shell>
    );
  }
  return (
    <Shell title="Add this device" existing={device?.source}>
      <p>Type the seven recovery words from your other device, in order.</p>
      <form
        className="words-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const check = checkPassphrase(value);
          if (!check.ok) return setMessage(check.problem ?? "");
          setBusy(true);
          setMessage("Making your key…");
          await saveDeviceKey(store, await deriveKey(check.words), "passphrase");
          await refreshDevice();
          go("#/");
        }}
      >
        <TextInput
          label="Recovery words"
          placeholder="seven words, separated by spaces"
          value={value}
          onChange={(e) => setValue(e.currentTarget.value)}
          data-autofocus
          autoFocus
          {...wordsInputProps()}
        />
        <p className="form-message" role="alert">
          {message}
        </p>
        <Button type="submit" loading={busy}>
          Add this device
        </Button>
      </form>
      <Button variant="default" onClick={() => go(device ? "#/" : "#/welcome")}>
        Back
      </Button>
    </Shell>
  );
}

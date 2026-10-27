import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button, Checkbox, Group, Textarea } from "@mantine/core";
import type { LoroDoc } from "loro-crdt";
import { canFinish, finishedAt, getProposition, markFinished, reopen, setProposition } from "../sync/meta";
import { useDocValue } from "./useEditor";
import { useTypedOnly } from "./typedOnly";

export interface FinishHandle {
  focus(): void;
}

/**
 * The exit test: say in one sentence what the piece claims, and read it aloud.
 * Works the same whether the writer began from a topic or from a claim.
 */
export const Finish = forwardRef<FinishHandle, { doc: LoroDoc; words: number; onBlockedPaste: () => void }>(function Finish({ doc, words, onBlockedPaste }, ref) {
  const at = useDocValue(doc, finishedAt);
  const stored = useDocValue(doc, getProposition);
  const finished = at !== undefined;
  const [claim, setClaim] = useState(stored);
  const [aloud, setAloud] = useState(false);
  const claimRef = useRef<HTMLTextAreaElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  useTypedOnly(claimRef, onBlockedPaste);
  useImperativeHandle(ref, () => ({ focus: () => (finished ? backRef.current : claimRef.current)?.focus() }), [finished]);

  // The claim follows the document (another device may change it) unless the writer is typing in it.
  useEffect(() => {
    if (document.activeElement !== claimRef.current) setClaim(stored);
  }, [stored]);
  // Each finish is its own read-aloud, so a finish or a reopen (here or elsewhere) starts the check afresh.
  useEffect(() => setAloud(false), [finished]);

  if (finished) {
    return (
      <section className="finish" aria-label="Finishing this piece">
        <div className="finish-done" role="status">
          <p className="finish-note">Finished {new Date(at).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.</p>
          <q className="finish-claim">{stored}</q>
          <Button
            ref={backRef}
            variant="subtle"
            color="gray"
            size="compact-sm"
            onClick={() => {
              reopen(doc);
              setTimeout(() => claimRef.current?.focus());
            }}
          >
            Reopen as a draft
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className="finish" aria-label="Finishing this piece">
      <Textarea
        ref={claimRef}
        label="In one sentence, what is this piece saying?"
        placeholder="A topic is fine to begin with; a claim is better to end with."
        autosize
        minRows={2}
        maxLength={400}
        value={claim}
        classNames={{ input: "finish-input" }}
        onChange={(e) => {
          setClaim(e.currentTarget.value);
          setProposition(doc, e.currentTarget.value);
          // The read-aloud applies to the claim as it stands now.
          setAloud(false);
        }}
      />
      <Group mt="sm" gap="md">
        <Checkbox className="finish-check" label="I read it aloud, and it hangs together." checked={aloud} onChange={(e) => setAloud(e.currentTarget.checked)} />
        <Button
          disabled={!canFinish(claim, words, aloud)}
          onClick={() => {
            if (!canFinish(claim, words, aloud)) return;
            markFinished(doc);
            setTimeout(() => backRef.current?.focus());
          }}
        >
          Mark as finished
        </Button>
      </Group>
    </section>
  );
});

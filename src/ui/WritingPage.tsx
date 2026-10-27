import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "@mantine/hooks";
import { createDoc, wordsOf } from "../sync/model";
import { autosave, loadSnapshot } from "../sync/storage";
import { draftKey, getDraft, updateDraft } from "../sync/library";
import { getTitle, isFinished, setTitle } from "../sync/meta";
import { connect } from "../sync/peer";
import { BroadcastChannelTransport, encrypted } from "../sync/transport";
import { useApp } from "../app/context";
import { useLinkSession, useLinkStatus } from "../app/linkSession";
import { BackBar } from "./Nav";
import { Toolbar, ToolButton } from "./Toolbar";
import { Outline } from "./Outline";
import { Finish, type FinishHandle } from "./Finish";
import { ShortcutsModal } from "./Shortcuts";
import { useDocValue, useEditor } from "./useEditor";
import { useTypedOnly } from "./typedOnly";
import { MOD, plural, wordCount } from "./format";

const refuseMessage = "Rampai only takes typed words. Try saying it in your own.";

/** One draft, saved on this device and synced with its other tabs. */
export function WritingPage({ id }: { id: string }) {
  const { store, device, say } = useApp();
  const refuse = () => say(refuseMessage);
  const [doc] = useState(() => {
    const d = createDoc();
    loadSnapshot(d, draftKey(id));
    return d;
  });
  const { ref, handle, tick } = useEditor(doc, { onBlockedPaste: refuse });
  const view = handle?.view;

  const finished = useDocValue(doc, isFinished);
  const storedTitle = useDocValue(doc, getTitle);
  const [title, setTitleField] = useState(storedTitle);
  const titleRef = useRef<HTMLInputElement>(null);
  // Typed-only holds for the title too: no paste, no dropped text.
  useTypedOnly(titleRef, refuse);
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitleField(storedTitle);
  }, [storedTitle]);

  const [outlineOpen, setOutlineOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(finished);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [saveProblem, setSaveProblem] = useState(false);
  const finishRef = useRef<FinishHandle>(null);

  // A finished piece is read-only until reopened, here or on another device; its panel shows.
  useEffect(() => {
    view?.setProps({ editable: () => !finished });
    document.body.classList.toggle("finished", finished);
    if (finished) setFinishOpen(true);
    return () => document.body.classList.remove("finished");
  }, [view, finished]);

  // Saved shortly after each change, and at once when the writer leaves.
  useEffect(() => {
    const saver = autosave(
      doc,
      draftKey(id),
      () => {
        setSaveProblem(false);
        updateDraft(store, id, { title: getTitle(doc), words: wordsOf(doc), updatedAt: Date.now(), finished: isFinished(doc) });
      },
      400,
      // If this draft was deleted from another tab, don't write it back.
      () => !!getDraft(store, id),
      () => setSaveProblem(true),
    );
    const onHidden = () => document.hidden && saver.flush();
    window.addEventListener("pagehide", saver.flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      saver.flush();
      saver.stop();
      window.removeEventListener("pagehide", saver.flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [doc, id, store]);

  // Other tabs of this browser are other replicas of the same draft.
  useEffect(() => {
    if (!handle || !device || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannelTransport(`rampai:draft:${id}`);
    const peer = connect(handle.binding, encrypted(channel, device.key));
    return () => {
      peer.stop();
      channel.close();
    };
  }, [handle, device, id]);

  // While linked to another device, this draft's edits go there as they are typed, and its edits come here.
  const session = useLinkSession();
  const live = useLinkStatus(session).live;
  useEffect(() => (session && handle ? session.attach(id, handle.binding) : undefined), [session, handle, id]);

  useEffect(() => {
    view?.focus();
  }, [view]);

  useHotkeys(
    [
      ["mod+shift+O", () => setOutlineOpen((o) => !o)],
      ["mod+/", () => setShortcutsOpen(true)],
    ],
    [],
    true,
  );

  const words = view ? wordCount(view.state) : wordsOf(doc);
  return (
    <>
      <BackBar>
        <Toolbar view={view} tick={tick} />
        <ToolButton aria-pressed={outlineOpen} title={`Show only the headings, and move whole sections (${MOD}+Shift+O)`} onClick={() => setOutlineOpen((o) => !o)}>
          Outline
        </ToolButton>
        <ToolButton
          aria-pressed={finishOpen}
          title="Say what this piece claims, and mark it finished"
          onClick={() => {
            setFinishOpen((o) => !o);
            setTimeout(() => finishRef.current?.focus());
          }}
        >
          {finished ? "Finished" : "Finish"}
        </ToolButton>
        <ToolButton className="shortcuts-open" title={`Keyboard shortcuts (${MOD}+/)`} aria-label="Keyboard shortcuts" aria-haspopup="dialog" onClick={() => setShortcutsOpen(true)}>
          ?
        </ToolButton>
      </BackBar>
      <main className="page">
        {/* Nothing sits at the bottom of the page. The count shares the title's line, and a save is silent unless it failed. */}
        <div className="title-row chrome">
          <input
            ref={titleRef}
            className="draft-name"
            type="text"
            aria-label="Title"
            placeholder="Give it a title"
            title="Click to rename this draft"
            maxLength={120}
            value={title}
            onChange={(e) => {
              setTitleField(e.currentTarget.value);
              // A blank title is only filled in with the default when the writer leaves the field.
              if (e.currentTarget.value.trim()) setTitle(doc, e.currentTarget.value);
            }}
            onBlur={() => {
              setTitle(doc, title);
              setTitleField(getTitle(doc));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                view?.focus();
              }
            }}
          />
          <span className="count" title={saveProblem ? "" : "Saved on this device"}>
            {plural(words, "word", "words")}
          </span>
          {live && (
            <span className="count linked" title="Edits go to your other device as you type">
              linked
            </span>
          )}
          <span className="save-problem" role="alert">
            {saveProblem ? "Not saved: this device's storage is full or blocked" : ""}
          </span>
        </div>
        {/* The panel opens under the title, above the draft; nothing is added below the writing. */}
        {finishOpen && <Finish ref={finishRef} doc={doc} words={words} onBlockedPaste={refuse} />}
        <div ref={ref} />
      </main>
      {outlineOpen && <Outline view={view} tick={tick} />}
      <ShortcutsModal opened={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}

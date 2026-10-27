import { useEffect, useState } from "react";
import { Alert, Button, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { createDraft, deleteDraft, listDrafts, partitionDrafts, type DraftEntry } from "../sync/library";
import { draftVersion } from "../sync/librarySync";
import { useApp } from "../app/context";
import { NavBar } from "./Nav";
import { editedLabel, plural } from "./format";

/** The home screen: every draft saved on this device, and a way to begin a new one. */
export function LibraryPage() {
  const { store, device, persists, go } = useApp();
  const [entries, setEntries] = useState(() => listDrafts(store));
  const refresh = () => setEntries(listDrafts(store));

  // Another tab may add, delete or finish a draft.
  useEffect(() => {
    const on = (e: StorageEvent) => e.key?.startsWith("rampai:") && setEntries(listDrafts(store));
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, [store]);

  const confirmDelete = (d: DraftEntry) =>
    modals.openConfirmModal({
      title: `Delete “${d.title}”?`,
      children: (
        <Text size="sm">It cannot be brought back. Linked devices delete it too when they next link, unless one of them has newer writing in it.</Text>
      ),
      labels: { confirm: "Delete", cancel: "Keep it" },
      confirmProps: { color: "red" },
      onConfirm: () => {
        deleteDraft(store, d.id, draftVersion(store, d.id));
        refresh();
      },
    });

  const row = (d: DraftEntry) => (
    <li key={d.id} className="draft-row">
      <a className="draft-link" href={`#/draft/${d.id}`}>
        <span className="draft-title">{d.title}</span>
        <span className="draft-meta">
          {plural(d.words, "word", "words")} · {editedLabel(d.updatedAt)}
        </span>
      </a>
      <Button variant="subtle" color="gray" size="compact-sm" aria-label={`Delete “${d.title}”`} onClick={() => confirmDelete(d)}>
        Delete
      </Button>
    </li>
  );

  const { inProgress, finished } = partitionDrafts(entries);
  return (
    <>
      <NavBar active="drafts" wordsMissing={device?.source !== "passphrase"} />
      {!persists && (
        <Alert className="page" color="red" variant="light" role="alert" my="md">
          This browser is not keeping anything Rampai saves, so your drafts will be lost when you close this tab. Allow site storage for Rampai to keep them.
        </Alert>
      )}
      <main className="page home">
        <Title order={1} className="home-title">
          Your drafts
        </Title>
        <Button onClick={() => go(`#/draft/${createDraft(store).id}`)}>Start a new draft</Button>
        <ul className="drafts" aria-label="Drafts">
          {inProgress.map(row)}
          {entries.length === 0 && <li className="draft-empty">Nothing here yet. Your first one is allowed to be bad.</li>}
        </ul>
        {finished.length > 0 && (
          <>
            <Title order={2} className="home-sub">
              Finished
            </Title>
            <ul className="drafts" aria-label="Finished pieces">
              {finished.map(row)}
            </ul>
          </>
        )}
      </main>
    </>
  );
}

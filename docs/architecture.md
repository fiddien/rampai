# Architecture

Rampai is **local-first** in the sense of Kleppmann, Wiggins, van Hardenberg, and McGranaghan, *Local-first software* (Ink & Switch, 2019). The writer's device holds the real copy of every draft; other devices are peers, not clients of a server. Three commitments follow, in the order the product values them: typing must feel instant, switching devices must feel seamless, and nobody but the writer can read a draft.

## The document model

A draft is a Loro document with one top-level container:

```
blocks: MovableList<Map{ id: string, type: BlockType, text: Text }>
```

Block types are `paragraph`, `heading1`, `heading2`, `quote`, and `list_item`. Bold and italic are rich-text marks on each block's `Text` (configured to expand after, so typing at the end of bold text stays bold). A line break inside a block is a `"\n"` character.

### Why a movable list, and why our own binding

Reordering blocks is central to Rampai: writers dump ideas, then cut and reorganize. So the one thing sync must never do is lose or misplace an edit because another device moved the block at the same time.

The off-the-shelf binding, `loro-prosemirror` 0.4.4, stores blocks in a plain list. A move becomes a delete plus an insert of a copy, so a concurrent edit to the original lands in the wrong block. `research/loro-prosemirror-move.test.ts` reproduces it: device A moves "One" to the end while device B appends " edited" to "One"; after sync both show `["Two edited", "Three", "One"]`. The test asserts that broken result on purpose, so it will fail, and prompt a second look, if the library fixes it.

Rampai's binding (`src/sync/model.ts`, `src/sync/binding.ts`) writes each editor change into Loro as the smallest set of operations.

1. **Order.** `planOrder` (`src/sync/order.ts`) compares block ids. Blocks on the longest increasing subsequence of current positions stay put; every other block gets one `move`. Dragging a block to the end is one move of that block, not a shift of all the others.
2. **Text.** A common-prefix/common-suffix diff turns each change into one delete and one insert at the right offset, so concurrent typing in the same block interleaves instead of overwriting.
3. **Marks.** Bold and italic ranges are compared and rewritten only when they differ.

Remote updates are imported into Loro, and the editor is patched with ProseMirror's own diff (`findDiffStart`/`findDiffEnd`), so undo history and the selection outside the changed stretch survive. If the block holding the caret was moved by the other device, the caret is found again by block id and offset.

`test/binding.test.ts` covers the move-and-edit case, the caret, formatting, deletion during an edit, and thirty random concurrent sessions (typing, splitting, moving, deleting, retyping blocks, syncing at random points) that must converge.

## The interface

The interface is React 19 with **Mantine 9** components, chosen so that every page, whoever builds it, speaks the same visual and accessible vocabulary: buttons, inputs, modals, notifications, tables. A Mantine theme (`src/app/theme.ts`) carries Rampai's look: IBM Plex Sans for the interface, Newsreader for the writer's words and headings, an ink primary colour, one blue accent for links and focus, and Mantine's page colours pointed at the same CSS variables the writing surface uses, in light and dark. Only the Mantine stylesheets in use are imported (`src/mantine.css`); a page that starts using another component adds its file there.

The app never reloads between pages. `src/app/router.ts` reads the address after `#`, and each page is a component that cleans up after itself when it unmounts: the editor is destroyed, autosave flushes and stops, tab channels close, listeners are removed. This is what lets a link between devices outlive a page change.

ProseMirror keeps its own DOM. `useEditor` (`src/ui/useEditor.ts`) mounts it on a ref and binds it to the Loro document; React re-renders only what sits around it (toolbar, outline, word count) once per transaction. `useDocValue` reads a value from the Loro document and re-renders when the document changes, whether the change was typed here or arrived from another device.

## Typed only

`src/editor/typedOnly.ts` refuses `paste`, drops from outside, and the `insertFromPaste`/`insertFromDrop`/`insertFromYank` input events. Dragging the writer's own text within the draft is still allowed. The rule trusts the writer; it is a speed bump against habit, not anti-cheat. A stricter focus mode for schools is a later idea. Plain text fields (the title, the claim) follow the same rule through `useTypedOnly` (`src/ui/typedOnly.ts`).

## Sync and encryption

Every message between devices is sealed with AES-GCM using a 256-bit key that only the writer's paired devices hold (`src/sync/crypto.ts`). AES-GCM authenticates as well as encrypts, so a tampered message fails to open and is dropped rather than applied.

The protocol (`src/sync/peer.ts`) has two messages. `UPDATE` carries a Loro update. `HELLO` carries a version vector; the receiver answers with exactly the changes the sender lacks. Devices say hello on connecting and after reconnecting, which is how a phone catches up after a day away from home.

Transports (`src/sync/transport.ts`) move opaque bytes:

- `BroadcastChannelTransport` syncs tabs of one browser.
- `MemoryLink` joins two endpoints in one page, with an online switch that queues messages while offline; the tests use it to stand in for two devices.

Drafts are saved on the device as Loro snapshots (`src/sync/storage.ts`, localStorage for now), one per draft id. A draft's title lives in a `meta` map in its own document (`src/sync/meta.ts`), so it syncs; `src/sync/library.ts` keeps a small index of titles, word counts and edit times, only to draw the home screen. The index is a cache; the documents are the truth. The single draft of the first version is adopted into the library once.

## What comes next

**Native apps with same-network sync.** The writer chose same-network sync only, so there is no relay to run or pay for. The plan is a Tauri shell (Rust core, this TypeScript UI) on desktop and mobile, with peers discovered over mDNS and connected directly on the local network. A new device pairs by entering the writer's seven-word passphrase, from which the shared key is derived. Cloud sync is deliberately set aside for now.

**Linking two devices** (`src/ui/link.ts`, `src/sync/webrtc.ts`, `src/sync/librarySync.ts`, `src/sync/chunks.ts`). One device shows a code and the other pastes it and shows an answer, which is pasted back; the codes are the WebRTC session descriptions, deflated and written in URL-safe characters (about 570 characters each). The connection is a WebRTC data channel with no ICE servers configured, so only the local network is used and no server is involved. Over it, messages are cut into 16 KB pieces (`chunked`) and sealed with the key from the recovery words (`encrypted`), so a code that reached the wrong device connects it to nothing it can read. A device made with different words is told so after six seconds of messages that fail to open, and receives nothing.

`LibrarySync` brings two libraries level and works the same on both sides. Each lists its draft ids (`INDEX`) and says hello for each draft with its version vector (`HELLO`); the other answers with exactly the changes missing (`UPDATE`). A draft the other side has never seen is requested with an empty hello, so it arrives whole. Updates are merged with Loro, saved as snapshots, and the library index gets the new title, word count and finished state. Draft ids from the other device become storage keys, so only plain ones are accepted. A draft open in another tab of the browser is told through its tab channel, so that tab's next save does not overwrite what arrived. A hello is always answered, with the missing changes or with `UPTODATE`, so each side knows when the two libraries are level instead of guessing from a pause; versions are compared rather than bytes, because Loro writes a small header even when nothing is missing.

Deleting follows one rule: **a deletion wins, unless the other device holds writing in that draft which the deleting device never saw.** A deleted draft leaves a tombstone with its version vector at the moment of deletion, and tombstones travel in `INDEX`. A device whose copy is covered by that version deletes its copy too (and keeps the tombstone, so a third device hears of it); a device with newer writing keeps the draft and sends it back whole, and the deleting device takes it back and drops its tombstone. A draft is saved before it is listed, so when storage is full the home screen never lists a draft whose words are not on the device, and the Link page says what could not be saved. Pieces are reassembled before a message can be opened and checked, so a message over 64 MB is dropped.

**Codes as QR codes** (`src/sync/compactSdp.ts`, `src/sync/linkCodes.ts`, `src/ui/Qr.tsx`, `src/ui/QrScanner.tsx`). Each code is shown as a QR code as well as text. The first code is a link to Rampai's Link page carrying the code after the `#` (which browsers never send to a server), so the other device's ordinary camera app opens Rampai with the code filled in and the answer made at once; a device not set up yet keeps the code through setting up its recovery words. The answer is scanned in the app, with the browser's own barcode reader where there is one and jsQR otherwise (loaded only when the scanner opens). To keep the QR codes small enough to read from a screen, codes carry only what differs between connections: the ICE username and password, the DTLS fingerprint and role, and the host candidates (`rampai2.`, about 100 characters instead of 570); the rest of the description is the same for Rampai's one data channel and is written back on arrival. A description that does not fit that form (an unexpected media section, say) is sent whole and deflated (`rampai1.`), and older codes still decode.

**Live editing while linked** (`src/app/linkSession.ts`). A link is an app-wide session: it outlives page changes and lasts until either device unlinks or closes the app. A draft open in an editor *attaches* to it (`LibrarySync.attach`): its local Loro updates go to the other device as they are typed, and the other device's updates are applied straight into the editor, which saves them. Hellos for an open draft are answered from the live document rather than the saved one, so unsaved writing is included. An update that arrives before something it depends on is held by Loro as pending; the receiver then says hello for that draft, and the sender answers with exactly what is missing. The same path brings over a draft started on one device while linked. The bar shows a green dot on "Link a device", and the writing page says "linked" beside the word count.

Limits for now: drafts edited in a second tab of the same browser reach the other device at the next link, not live. A closed app means a new code exchange, since browsers cannot find each other again without a server or local discovery; the native app's mDNS discovery removes that. The real connection was tested between two browser profiles on one machine with the browser's local-address hiding turned off; on a real network, browsers show addresses as mDNS names, which usually resolve on a home network but can be blocked on guest or corporate ones.

**Recovery words and the device key** (`src/sync/passphrase.ts`, `src/sync/keys.ts`, `src/ui/onboarding.ts`). The key that seals every message is made from seven random words from the 2048-word BIP-39 English list (77 bits), through scrypt (N = 2^16, r = 8, p = 1, so about 64 MB per guess, from `@noble/hashes`). The salt is fixed because a new device has only the words to start from; with a random 77-bit passphrase a shared salt gives an attacker nothing to precompute that the search itself would not cost. The words are shown once and kept only in session storage until the writer retypes three of them (positions chosen at random and kept across reloads), and then only the derived key is stored, with a note of whether it came from words. A second device types the words and derives the same key. Writers can also skip ("write on this device only"), which keeps a random key and a home-screen prompt to make words later; making words later replaces that key, which is safe because nothing is stored encrypted under it. Pasting is allowed in these fields, because they hold a passphrase and not the writer's own prose. Because BIP-39 words are unique in their first four letters, four letters are enough: a shortened or misspelt word is resolved to its listed word before the key is made. A device that already has words is warned, and asked to confirm, before they are replaced, since new words cut it off from the writer's other devices. When the browser keeps nothing across a reload (storage blocked or full), the welcome is skipped and the writer is told that drafts will not outlast the tab. In Chromium on a desktop, deriving the key takes about 0.4 s; phones are still to be timed. The words are never stored, so they cannot be shown again; instead the Recovery words page lets a writer type them to check that what they wrote down makes this device's key.

**Backup and restore** (`src/sync/backup.ts`, `src/sync/merge.ts`, `src/ui/backup.ts`). With no server, a backup is the way back when every device is lost. It is one file holding every draft's Loro snapshot, as JSON, deflated, and sealed with the key from the recovery words; the first bytes (`RMPB`, a format number, a flag) are in the clear, so a file that is not a backup, one from a newer version, and one sealed with different words each get their own message. Restoring goes through the same `mergeDraft` as linking: drafts merge with what is on the device, so nothing written since the backup is lost, and a draft that is already up to date is left alone. The one difference is deliberate: a draft deleted on this device since the backup comes back, because restoring is the writer's own choice, and its tombstone is removed. Other tabs with a restored draft open are told, as with linking. Backups need recovery words, because a backup sealed with a device-only key would be lost with the device.

Not yet: the key is held in localStorage on the web build (native builds will use the platform keychain), the passphrase cannot be shown again after setup, and the words must match on both devices for the link to carry anything.

**Finishing** (`src/sync/meta.ts`, `src/ui/finish.ts`) is the exit test from the design brief: the main proposition in one sentence, plus a read-aloud check. The proposition and a `finishedAt` time live in the draft's `meta` map, so they sync; the read-aloud check is asked each time and not stored. A finished piece is read-only until reopened: `DocBinding.dispatch` refuses every local edit while the editor is not editable, so no toolbar button, shortcut or outline move can change it. The title is not part of the text and stays editable, so a finished piece can still be renamed. `finishedAt` is a last-writer-wins register, so a finish made offline can merge with edits from another device that its read-aloud never covered; the writer can reopen and finish again. The same test serves topic-first and claim-first writers.

**Outline mode** (`src/editor/outline.ts`, `src/ui/outline.ts`) lists the headings. A section is a heading plus everything under it, up to the next heading of the same or a higher rank, so moving a section carries its subsections. Sections swap only with a sibling of the same level, which keeps a subsection inside its parent. A move is one replace of the two adjacent ranges with their blocks reordered; the blocks keep their ids, so the binding writes it to Loro as block moves and another device's concurrent edit follows the text (`test/outline.test.ts`).

**Next editor features**, in rough order: footnotes (an inline node whose body is its own Loro text), drag handles for blocks, the whiteboard, books, and the AI reader as comments.

**Game progress** syncs as an append-only event log in the same encrypted channel, so streaks and badges agree across devices.

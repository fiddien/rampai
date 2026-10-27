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

## Typed only

`src/editor/typedOnly.ts` refuses `paste`, drops from outside, and the `insertFromPaste`/`insertFromDrop`/`insertFromYank` input events. Dragging the writer's own text within the draft is still allowed. The rule trusts the writer; it is a speed bump against habit, not anti-cheat. A stricter focus mode for schools is a later idea.

## Sync and encryption

Every message between devices is sealed with AES-GCM using a 256-bit key that only the writer's paired devices hold (`src/sync/crypto.ts`). AES-GCM authenticates as well as encrypts, so a tampered message fails to open and is dropped rather than applied.

The protocol (`src/sync/peer.ts`) has two messages. `UPDATE` carries a Loro update. `HELLO` carries a version vector; the receiver answers with exactly the changes the sender lacks. Devices say hello on connecting and after reconnecting, which is how a phone catches up after a day away from home.

Transports (`src/sync/transport.ts`) move opaque bytes:

- `BroadcastChannelTransport` syncs tabs of one browser.
- `MemoryLink` joins two simulated devices on one page, with an online switch that queues messages while offline.

Drafts are saved on the device as Loro snapshots (`src/sync/storage.ts`, localStorage for now).

## What comes next

**Native apps with same-network sync.** The writer chose same-network sync only, so there is no relay to run or pay for. The plan is a Tauri shell (Rust core, this TypeScript UI) on desktop and mobile, with peers discovered over mDNS and connected directly on the local network. A new device pairs by entering the writer's seven-word passphrase, from which the shared key is derived. Cloud sync is deliberately set aside for now.

**Pairing and keys.** The web build keeps its key in localStorage, which is enough for a demo and not for real use. Pairing will derive the key from the passphrase with a memory-hard KDF and keep it in the platform keychain.

**Next editor features**, in rough order: footnotes (an inline node whose body is its own Loro text), drag handles for blocks, Outline mode (headings only, reorderable), the whiteboard, books, and the AI reader as comments.

**Game progress** syncs as an append-only event log in the same encrypted channel, so streaks and badges agree across devices.

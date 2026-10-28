# Rampai

*A gentle ramp to clear thinking.*

Rampai is a writing app for people who want to think more clearly by writing in their own words. Text enters a draft only by typing; pasting is switched off on purpose. Drafts live on the writer's own devices and sync directly between them, encrypted, with no server in between.

This repository holds the first **tracer bullet**: a thin, working path through the parts that are hardest to change later.

- A block editor with Word-style shortcuts, Markdown-style shortcuts, and blocks that move with <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>.
- A home screen of drafts saved on the device. Every new draft is titled "My first bad draft", and the title can be changed in place and syncs between devices.
- Finishing a piece: say in one sentence what it claims and confirm a read-aloud; the piece is then listed as finished and read-only until reopened.
- Recovery words: a seven-word passphrase makes the key that keeps drafts private. A second device types the words and gets the same key. Setup is skippable. The words can be checked later against the device's key.
- Backup and restore: every draft in one file, sealed with the recovery words; restoring merges with what is on the device.
- Drag handles in the margin move a block with a mouse or a finger.
- Link a device: two devices with the same recovery words swap a code each (scanned as a QR code, or copied), then exchange every draft directly over WebRTC on the local network, sealed with the key. While linked, edits to open drafts go between the devices as they are typed.
- A slim navigation bar (Drafts, Link a device, Recovery words) on every page but the writing page, which keeps only a back link, bold, italic, a block menu, Outline, Finish, and a `?` panel for keyboard shortcuts.
- Outline mode (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>): headings only, and whole sections move with their text.
- The typed-only rule (paste and drop from outside are refused).
- A local-first document model on [Loro](https://loro.dev), where each block keeps its identity when it moves.
- AES-GCM encryption of every update that leaves a device.
- Sync between tabs of one browser.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173 (the drafts home)
npm test           # unit, property, and concurrency tests
npm run build      # static build in dist/
```

## Layout

```
src/app/      React app frame: Mantine theme, providers, routes (no reloads)
src/ui/       pages and panels, built from Mantine components
src/editor/   ProseMirror schema, shortcuts, input rules, block ids, typed-only rule
src/sync/     Loro model and binding, block-order planning, crypto, transports, storage, backup
test/         tests, including random concurrent sessions that must converge
research/     experiments kept as evidence for design decisions
docs/         architecture notes and what comes next
```

See [docs/architecture.md](docs/architecture.md) for why it is built this way.

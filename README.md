# Rampai

*A gentle ramp to clear thinking.*

Rampai is a writing app for people who want to think more clearly by writing in their own words. Text enters a draft only by typing; pasting is switched off on purpose. Drafts live on the writer's own devices and sync directly between them, encrypted, with no server in between.

This repository holds the first **tracer bullet**: a thin, working path through the parts that are hardest to change later.

- A block editor with Word-style shortcuts, Markdown-style shortcuts, and blocks that move with <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>.
- Outline mode (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>): headings only, and whole sections move with their text.
- The typed-only rule (paste and drop from outside are refused).
- A local-first document model on [Loro](https://loro.dev), where each block keeps its identity when it moves.
- AES-GCM encryption of every update that leaves a device.
- Sync between tabs of one browser, and a simulated two-device page (`#two-devices`) with an on/off network switch.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173, and /#two-devices for the sync demo
npm test           # unit, property, and concurrency tests
npm run build      # static build in dist/
```

## Layout

```
src/editor/   ProseMirror schema, shortcuts, input rules, block ids, typed-only rule
src/sync/     Loro model and binding, block-order planning, crypto, transports, storage
src/ui/       toolbar
test/         tests, including random concurrent sessions that must converge
research/     experiments kept as evidence for design decisions
docs/         architecture notes and what comes next
```

See [docs/architecture.md](docs/architecture.md) for why it is built this way.

# First-pass routing exercise (manual, not an agent A/B evaluation)

Brief: build a compact four-tab project dashboard with changes, archive and settings, keyboard navigation, loading feedback, and safe cancellation.

- `opentui` selects React because the existing app is React; its `references/react/` and `opentui-react` supply lifecycle, props and hooks.
- `opentui-design` asks for primary overview/status region, subordinate history, 80×24 and 120×40 layout, visible focus, loading/error states, and a route back from detail to list.
- `opentui-components` selects built-in box, text, scrollbox, diff and input/select components. Neither termcn nor tuiparts is needed for this brief unless a richer compound control is explicitly requested.
- `opentui-test-and-ship` requires rendered-frame/input and clean shutdown evidence. Existing project `bun test test/tui` passed 18 tests on 2026-09-25, including compact navigation, focus after resize, loading/reduced-motion, and cancellation. This is evidence about the existing app, **not** a before/after evaluation of these new skills or a packaged artifact test.

Outstanding evaluation: run a fresh agent with and without the skills on the briefs in `briefs.md`, inspect terminal frames, and score differences. Do not claim the skill improves visual quality until this is done.

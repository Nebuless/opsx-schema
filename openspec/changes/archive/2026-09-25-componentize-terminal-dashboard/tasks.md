## 1. Component vocabulary and stable dashboard shell

- [x] 1.1 Implement only the repeated passive frame, section, row, state and bounded-review presentation roles needed by `src/tui/app.tsx` and `src/tui/settings.tsx`; keep render data and action handlers in current owners, and verify that the shell still exposes one active tab, status and contextual footer at 100x32 and 60x18.
- [x] 1.2 Exercise Tab/Shift+Tab, 1-4, ?, filter/editor focus and resize in a real PTY; verify no duplicate keyboard handling or clipped action cue with `NO_COLOR=1` and reduced motion.

## 2. Visible Settings choices and stateful reviews

- [x] 2.1 Compose `src/tui/settings.tsx` stage choices with grouped schema, profile, migration, skill-host and provider sections; select through rows exceeding viewport height after async discovery and resize, and verify the actual selected row and its full identity remain visible.
- [x] 2.2 Compose distinct staged-review, exact-effects preview, Apply confirmation, result and separate MCP provider-review/approval surfaces; verify target, action, destination, reason, state and back/next cue in long, scrollable plans at both terminal sizes without modifying the switch or provider-consent flow.
- [x] 2.3 Exercise a disposable project's OMP and Atomic host choices through stage, read-only preview and cancel; verify zero writes and no 'applied' styling. Inspect no-op, blocked, partial/recovery and historical result states; only evidence-backed targets may say verified applied. Verify provider approval still requires its own immediate interactive consent.

## 3. Read-only view hierarchy

- [x] 3.1 Compose `src/tui/overview.tsx` into summary, active planning/checked progress and completed-history sections using shared presentation; verify independent pending/error/empty states, known fractions and Unknown totals without a fabricated bar or lingering pending animation.
- [x] 3.2 Compose `src/tui/browser.tsx` Changes and Archive list/detail/file views with selected-row, bounded content and breadcrumb/back cues; verify filter and selection survive the return path, archived data remains historical and neither view exposes a write action.

## 4. End-to-end contract and release check

- [x] 4.1 Exercise all four tabs at 100x32 and 60x18, including resize, long host paths, both host selections, review paging, no color and reduced motion; compare actual screen/selection visibility and truthful state labels against this change's scenarios and the completed dashboard change's safety contract.
- [x] 4.2 Run affected TypeScript and focused TUI checks; keep only regression tests for observable boundaries that could plausibly regress, record any unavailable evidence, and revalidate with `openspec validate componentize-terminal-dashboard --type change --strict` before implementation handoff.

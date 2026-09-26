# Terminal dashboard visual redesign and skill-host coverage

Each checkbox is an independently verifiable implementation outcome. The corresponding Backlog group ticket has an acceptance criterion with the same `[X.Y]` tag and order; neither tracker is checked merely because the other is.

## 1. Real OMP and Atomic skill hosts - OPSX-12

- [x] 1.1 Verify OMP and Atomic skill destinations, discoverability and shared physical ownership against each host's current contract; expose separate skill-host choices from profile selections in `src/resources/index.ts` and Settings, with unsupported or colliding targets explicitly blocked. Verify staging both hosts writes nothing.
- [x] 1.2 Extend `SwitchRequest` and the read-only preview in `src/switch/index.ts` and all CLI/Settings consumers so each selected skill host shows exact skill artifact, action and destination; verify preview/CLI parity and freshness invalidation when selection or target changes.
- [x] 1.3 Include selected host effects in the guarded Apply journal and recovery path in `src/switch/index.ts`/`src/resources/index.ts`; verify a disposable project install for each supported host and an interrupted/shared-target operation never reports full success or writes outside its reviewed targets.

## 2. Coherent four-tab visual navigation - OPSX-11

- [x] 2.1 Adapt compatible termcn Panel/Divider/Badge or equivalent OpenTUI primitives into a restrained shared section/color vocabulary; apply it to `src/tui/app.tsx` with one keyboard owner, visible tab/focus/status and contextual hints. Verify existing Tab/Shift+Tab, 1–4 and help navigation in a real PTY.
- [x] 2.2 Compose `src/tui/overview.tsx` into Summary, Active Changes and Completed Changes with distinct loading/empty/error treatment, separate planning versus checked progress, a bounded known-only progress display and explicit Unknown. Verify with known, unknown and pending data in a real terminal.
- [x] 2.3 Give `src/tui/browser.tsx` Changes and Archive a visible list -> detail -> file hierarchy, selection, filter and back cues while keeping them read-only; verify historical labeling, bounded diff, filter preservation and failure/empty distinctions with keyboard interaction.

## 3. Legible Settings review and outcomes - OPSX-13

- [x] 3.1 Group `src/tui/settings.tsx` schema, profiles, migrations, skill hosts and MCP provider/host rows with separate selection semantics, stage labels and selected-item context. Verify that stage and staged review do not write and that OMP/Atomic appear as skill hosts, not agent profiles.
- [x] 3.2 Present the fresh `SwitchPreview` as a clearly read-only exact-effects review, then a separate Apply confirmation with target/action/diagnostic labels. Verify cancellation, no-op, collision and stale-preview paths write nothing; preserve existing provider preview and its independent safety approval.
- [x] 3.3 Render post-Apply per-target Applied, Unchanged, Blocked or Recovery Needed only from observed journal/recovery or refreshed destination evidence, including partial results and actionable recovery information; verify a mixed-success operation is never colored or labeled wholly applied.

## 4. Responsive and motion-safe interaction - OPSX-14

- [x] 4.1 Apply the approved motion decision to real pending reads and known-progress changes only, with static NO_COLOR/reduced-motion equivalents and cancellation on settle/inactive view. Verify frequent keyboard navigation stays immediate, unknown progress never animates and idle CPU is not driven by a lingering timer.
- [x] 4.2 Exercise actual 100x32 and 60x18 terminal sessions across all four tabs, Settings stage/preview/result, list/detail/file and a resize; adjust overflow/scroll/footer so active tab, selection, state and mode actions stay readable with NO_COLOR and reduced motion.
- [x] 4.3 Exercise an end-to-end disposable project with OMP and Atomic preview, cancel, successful Apply, partial/interrupted recovery and separate denied MCP approval; confirm actual destination contents and per-target TUI results, then run the affected typecheck and validation gates without mutating a user's live project.

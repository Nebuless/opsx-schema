## Context

`src/tui/app.tsx` owns the four-tab shell and global shortcuts. `overview.tsx` already groups summary, active, and completed reads; `browser.tsx` owns Changes/Archive list, detail and file levels; `settings.tsx` owns selection, staged review, schema preview, Apply confirmation, result, and separate MCP preview/provider approval. Most views still assemble `text` rows inside `scrollbox` containers. At 100x32, Settings can show a focused Atomic host while its checked row is below the list viewport; staged, preview and result screens are rendered from arrays of similar prose lines. The previous `design-rich-terminal-dashboard` spec improved framing, semantics and host choices but did not integrate a reusable component vocabulary. ADR 0001 keeps the Bun/OpenTUI React four-tab app, browsers read-only and Settings as the only interactive write surface; ADR 0002 protects revisions/provenance; ADR 0003 protects reviewed Apply and independent provider consent.

## Goals / Non-Goals

**Goals:** Compose the shell and each view from a small, coherent set of terminal-native presentation components. Make selection, state, section, destination, and action boundaries legible in both wide and narrow terminals. Correct row visibility and use bounded scroll regions without distorting truth about planned versus observed effects.

**Non-Goals:** Change the switching transaction or host contract; debug the separately reported Apply concern; install a full external UI library; add a second state/keyboard system; redesign non-TTY commands; replace OpenSpec authority or change data ownership.

## Selected Direction

Build passive project-owned OpenTUI React components on top of existing `<box>`, `<text>`, `<scrollbox>`, palette/motion helpers, and Core scroll refs. GHUI's pane/focus/footer composition and termcn's Box, Tabs, Scroll View, Badge, Progress Bar, Spinner and Dialog illustrate patterns—not source to copy wholesale. Start with Settings, then reuse the vocabulary in shell/Overview/browsers. A component must expose a useful repeated rendering contract, not own business state or synthesize effects.

```text
100x32: stable shell and two-region view where content permits
+--------------------------------------------------------------+
| opsx-schema | [1 Overview] 2 Changes 3 Archive 4 Settings  |
| SETTINGS > STAGED CHOICES       OpenSpec: READY               |
+-----------------------------+--------------------------------+
| CHOICES                     | SELECTED TARGET                |
| [x] OMP skills  <selected>  | State: selected for review     |
| [x] Atomic skills           | Destination: <verified path>   |
| [ ] agent profile ...       | Effect: would install / no-op  |
| ... bounded scroll ...      | ... bounded detail/review ...  |
+-----------------------------+--------------------------------+
| Space stage | Enter inspect | p preview | Esc back          |
+--------------------------------------------------------------+

60x18: same semantics, stacked; no second clipped column
+------------------------------------------+
| opsx-schema | [4 Settings] | READY       |
| SETTINGS > EXACT-EFFECTS PREVIEW         |
+------------------------------------------+
| Target: OMP skills                       |
| Action: would install / unchanged        |
| Destination: <wrapped or scrollable>     |
| ... bounded scroll ...                   |
+------------------------------------------+
| READ ONLY | Esc back | a confirm         |
+------------------------------------------+
```

These sketches specify hierarchy, not a mandatory two-column layout: use columns only if width and content permit genuinely readable identity and destination. At narrow width show one meaningful region at a time, with selected context/breadcrumb above it. Do not put a redundant full global key legend inside each view.

| Presentation role | Proposed project component | Behavior / ownership |
| --- | --- | --- |
| Shell framing | `DashboardFrame` and `ViewHeading` | Existing `app.tsx` owns tabs, help, status, key dispatch and viewport height; frame renders current view + contextual footer. |
| Grouping | `SectionPanel` | Shared title, optional subtitle/status, modest border/spacing; never one box per row. |
| Selection | `SelectableRow` and `SelectionContext` | Typed selected/staged/disabled markers and wrapped label; list owner retains cursor and scroll ref. Selection marker visibly follows the actual row. |
| State | `StateLabel` and `EffectRow` | Explicit words and muted/amber/cyan/green/error treatment; display input facts, do not infer write success from a checkbox. |
| Detail/review | `ReviewPanel` | Title, read-only/confirmation/historical status, scrollable target/action/destination/reason content and back/next cues outside the scroll viewport. |
| Pending/progress | Existing `PendingRead` plus known progress display | Reuse existing motion cancellation; unknown totals display Unknown without a bar. |

Use stable target identifiers and semantic render data already available from `SwitchPreview`, `SwitchApplyResult`, and Settings state. `selected for review` (choice), `staged only` (review), `would install` / `no-op` / `blocked` (read-only preview), `confirm exact plan` (consent), and `verified applied` / `unchanged` / `partial` / `recovery needed` / `unknown` (observed result) have distinct copy and treatments. Render the existing switch journal/recovery evidence; if it cannot establish a target outcome, show Unknown or Recovery needed rather than guessing. Provider preview/approval is a separate `ReviewPanel` mode with its own URL, host, permissions and config diff, preserving current handler and fresh interactive approval. A long destination wraps or is horizontally inspectable; never truncate the target/effect identity needed for consent.

## Implementation Guardrails

- Keep application-owned global keyboard dispatch and view-local handling gated by active tab. Presentational components receive data and children; they do not install global listeners, clear stdout, mutate a plan, or invoke Apply. Retain current Tab/Shift+Tab, 1-4, ?, Esc, search/filter, space/enter, review navigation, and separate provider authorization.
- Make the selected Settings row's actual renderable visible after row change, async catalog/profile arrival, and resize. Inspect the measured Core `ScrollBoxRenderable` viewport and wrapped child geometry; the current `scrollChildIntoView` plus conditional manual adjustment may need correction after new boxes alter row height. No assumption that row index equals visual line offset.
- Allocate shell, status, footer, and content heights from actual terminal dimensions and wrapping. At 60x18 the action cue and current stage cannot disappear behind an oversized header. Review scroll is separate from list scroll; do not let a full-screen review erase navigation context.
- Reuse `src/tui/theme.tsx` color and reduced-motion/NO_COLOR behavior. Labels and markers are primary; color is redundant. Do not animate selection or unknown progress. Genuine pending motion stops on settlement, inactive view and unmount.
- Do not change how `src/switch/index.ts` computes effects or `src/mcp/index.ts` gates provider consent. If current result data is insufficient for a verified per-target label, display Unknown; identify a separate domain change for approval rather than inventing a successful result.
- Changes/Archive stay read-only, preserve selected item and filter through list/detail/file/back, and keep each independent pending/error/empty state. Overview must distinguish planning readiness from checked task progress.
- Check upstream component patterns against installed `@opentui/react`/`core` versions and dependency/license surfaces before adapting code. Project-owned wrappers must remain small and behaviorless; avoid speculative general UI-kit APIs.

## Alternatives Considered

- Import GHUI wholesale: it is a useful interaction example, but importing its app patterns would add unrelated dependencies and duplicate keyboard/state ownership.
- Install termcn's full component set: breadth exceeds the narrow composition gap and may pull incompatible runtime assumptions. Individual recipes can be assessed later.
- Only reword prose arrays and add more colored borders: insufficient for actual row visibility, bounded reviews and reusable view hierarchy.
- Make two columns mandatory: fails at 60x18 and can hide exact destinations even at wider widths when paths wrap.

## Risks / Trade-offs

- Scroll geometry after a React render is renderer-dependent; verify the selected row itself in real PTYs instead of trusting the focus label or a text snapshot.
- Shared wrappers can become a second framework; keep fewer than the repeated patterns require, leave view state where it already lives, and remove a wrapper that only forwards props.
- Visual treatment could imply success; render from authoritative target/evidence state and distinguish historical/partial/no-op/blocked outcomes. Do not claim a behavioral Apply fix from this visual proposal.
- Extra borders consume narrow rows; show one bounded content region and concise status/action cues rather than nested frames.

## Migration Plan

No persistent data migration. Implement composition incrementally: establish shell/presentation primitives, replace Settings stage/review/result surfaces, then reuse the vocabulary in Overview and the two read-only browsers. Keep existing state transitions and source-of-truth models. Use disposable project roots and real PTY sessions at 100x32 and 60x18, including long paths, both hosts, NO_COLOR, reduced motion, resize, cancel, no-op, blocked/partial and recovery states; compare results with the original safety/keyboard contracts. If the new layout obscures an effect or cue, revert the presentation layer without touching stored project state.

## Open Questions

- None blocking planning. Exact width breakpoint and whether a third-party passive component is worth adopting require renderer proof during implementation; default to local composition when uncertain.

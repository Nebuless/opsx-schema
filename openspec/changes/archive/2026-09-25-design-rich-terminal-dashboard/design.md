## Context

The existing React OpenTUI application (`src/tui/app.tsx`) owns global tabs and keyboard dispatch. `overview.tsx` and `browser.tsx` present independent reads; `settings.tsx` owns stage/review/schema-preview/apply-confirm and separate MCP preview/provider-approval states, currently rendering many contiguous text lines. `SwitchRequest` has `schema`, `profiles`, and `migrations`; `SwitchApplyResult` has applied/unchanged/partial status and journal/recovery evidence, but Settings collapses it to one notice. `opsx-schema.json` enumerates five agent-profile targets and does not enumerate OMP/Atomic skill hosts. ADR 0001-0003 preserve OpenSpec lifecycle authority, retained revisions, recoverable Apply and separate provider approval. Prior terminal-dashboard-usability delta is complete but not synced to canonical specs.

## Goals / Non-Goals

**Goals:** Establish a terminal-native Operate visual language; make four tabs and Settings stages scannable; preserve truth when reads, counts or writes are partial; integrate verified OMP/Atomic skill hosts without treating profile checkboxes as host checkboxes; make motion useful but never a keyboard latency tax.

**Non-Goals:** Rebuild read-only browsers as editors, change OpenSpec readiness logic, infer a fix for the user's separate partial-Apply report, install unrelated termcn runtime/Ink, configure MCP, or invent a host path based solely on its display name.

## Selected Direction

Settings is the structural prototype, then shared section rhythm expands to the shell and read tabs. Keep the current application-owned state machine, renderer and keyboard ownership. Adapt a small number of termcn registry presentation recipes (Panel/Card/Divider, Badge/Definition, List/Breadcrumb, Alert/Status, Progress) only after checking each registry item's source, imports and 0.5.x type/terminal behavior; prefer direct existing OpenTUI primitives when a component's dependencies or handlers conflict. Tabs/Wizard/Confirm/Checkbox Group are design references only unless adapted to be passive renderers; do not register competing global listeners or call stdout clearing. The approved Emil Kowalski reference supplies a frequency/purpose filter: keyboard tab/list actions are immediate; infrequent pending-read and meaningful known-progress transitions may move briefly, with a static reduced-motion path. Impeccable supplies coherent hierarchy and color treatment, not a separate runtime.

```text
+------------------------- 100x32 ---------------------------+
| opsx-schema  project + core status | [Overview Changes ...] |
+----------------------------+-------------------------------+
| CURRENT SECTION            | CONTEXT / SELECTION           |
| grouped items and states   | detail, preview or result     |
+----------------------------+-------------------------------+
| current-mode action hint; stage and safety cues            |
+------------------------------------------------------------+

+------------- 60x18 ---------------+
| title + current tab + status       |
| navigation / breadcrumb            |
| one scrollable grouped panel       |
| selected item / action hint        |
+-----------------------------------+
```

Settings' selected group and operation stage take precedence over decorative chrome. The review uses a clear `READ ONLY` heading; confirmation names exact effects; result lists each target's observed state. Provider preview/approval retains distinct keys and user authorization. Do not equate an overall `applied` status or the accepted `y` with every individual host write; derive target rows from the journal/recovery evidence or refreshed destination inspections. If evidence cannot establish a target state, say `Unknown / inspect recovery` and do not paint it as Applied.

## Implementation Guardrails

- `src/tui/app.tsx`: one keyboard owner for tabs/help/focus. Keep four tabs, original shortcuts and error/read states; layout width/height selection should not create a second keymap. Contextual footer must not be clipped at 60x18.
- `src/tui/overview.tsx` and `src/tui/browser.tsx`: use shared visual tokens/section treatment without replacing read models. Preserve independent pending/empty/error cases, active-vs-historical identification, name filtering, selected row across navigation, bounded file/diff viewing, and separate planning/checked progress.
- `src/tui/settings.tsx`: group schema, profile, migration, skill host, MCP provider and MCP host distinctly. Map stage -> staged review -> schema preview -> apply confirmation -> per-target result with a back path; cancel/no-op remains write-free. Scope provider installation to its existing separate approval callback and show actual provider URL/permissions/config diff before it.
- `src/resources/index.ts`, `src/switch/index.ts`, `opsx-schema.json` only where appropriate: first verify actual OMP and Atomic host-discovery contracts and inspect shared physical targets, symlinks, owned resources and collision policy. Add a distinct skill-host dimension rather than mislabeling agent profiles. Preview and Apply must agree on targets and guard against freshness changes; all host effects join the recoverable journal. Do not fabricate a destination or silently skip an unavailable host. Keep any CLI request/preview consumer coherent with the changed contract; do not introduce a UI-only write path.
- Palette: active focus distinct; cyan/info for read preview, amber/staged, green/verified applied, red/blocked/error, muted/unchanged; explicit state words and markers remain under NO_COLOR. Do not use green for mere confirmation. Bound borders to sections; no box per row.
- Motion: use the existing OpenTUI engine only where it can run conditionally and stop on settle, unmount, inactive tab and reduced motion. Unknown progress has neither percentage nor animation; never animate high-frequency navigation. No unconditional timers or Ink hooks. Readability must precede any animation frame.
- Compatibility: inspect candidate termcn registry JSON/source and license, local `@opentui/react`/`core` APIs and typecheck before importing; every adopted piece has one focus/keyboard owner. Avoid unnecessary new dependencies.

## Alternatives Considered

- Wholesale termcn registry install: attractive catalog breadth but imports/hooks and global keys can conflict with OpenTUI 0.5.x and existing navigation; selective adaptation is safer.
- Adopt tuiparts adapter: current advertised 0.4.3 peer range does not match installed 0.5.x; no need to make it the project migration driver.
- Restyle by concatenating more text into Settings notices: retains the precise ambiguity users reported and cannot expose per-target outcomes.
- Treat OMP/Atomic as profiles: existing profile IDs and targets are semantically separate from host skill-install destinations; would misrepresent effects and shared ownership.

## Risks / Trade-offs

- Discovering Atomic's host-specific skill path and OMP/shared profile overlap is a gate before mutation; host resolution must be evidence-backed and unavailable targets blocked. No fixed path is assumed here.
- Existing switch preview token/journal may require a versioned request/result change to carry skill-host selections and observed per-target states; migrate all callers instead of adding a UI-only special case.
- A source-copied registry component adds maintenance; prefer simple passive visual recipes. Trial against 100x32 and 60x18 PTYs with NO_COLOR/reduced-motion and input/resize, rather than trusting web screenshots or tests alone.
- Animation can waste CPU and introduce status confusion; keep rare, cancelable and static by default in non-animated environments.

## Migration Plan

No automatic migration of existing project schemas, pins or skills. A future implementation should stage the new host-selection contract without changing old selection meaning; old profile requests continue to target their profiles and no host is implicitly selected. Current installations remain untouched until explicit reviewed Apply. Verify target inventory and transaction recovery in disposable project roots, then typecheck and exercise real PTY flows at both widths. If a target fails, report partial journal/recovery and retain safe rollback/retry guidance rather than marking full success.

## Open Questions

- Exact Atomic skill destination and supported discovery behavior must be verified from host-specific contract before a mutating implementation. OMP `.omp/skills/` is a project resource location, but project/user-scope and shared physical target policy still require evidence.
- No new repo-level architecture ADR is presumed unless host-resolution/transaction design changes ADR 0003 materially; review existing ADRs in the change-local manifest.

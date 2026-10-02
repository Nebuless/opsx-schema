## Context

The approved Change Register identity already exists in the working tree and in DESIGN.md, .impeccable/design.json and the tui-change-register delta. This change is a scoped component refinement, not another direction-selection round.

Observed implementation:

- src/tui/overview.tsx owns ProgressLine/AnimatedProgress and rounds ratio times track width. A nearly complete ratio can fill every cell. src/tui/model.ts already validates task counts, derives remaining work and keeps planning independent.
- src/tui/browser.tsx owns list/detail/file navigation, filtering, detail reads and bounded file/Git reads. It currently uses a showDiff boolean. File identity is inside the scrolling region; no selected-change progress stays above the file. Detail reads are currently gated to detail mode.
- The browser obtains active information through loadChangeDetail and archive information through archivedRecord, archivedFile and changeHistory. Historical checkboxes are counted from retained tasks.md; historical planning readiness is not known.
- boundedPreview defaults to 12,000 characters and 120 lines, sanitizing terminal control characters. Archive rejects files over 1 MiB. Source is safe display text, not raw bytes.
- Installed @opentui/core and @opentui/react already provide Markdown with syntaxStyle, tables, passive list rendering and code-block hooks. Declarations show capability-dependent Markdown links and a Tree-sitter client option; declarations alone do not prove safe runtime behavior or offline grammar handling.
- Existing read-tabs and shell-overview tests exercise keyboard navigation, bounded rendering and unknown-data semantics. Actual terminal inspection remains necessary.

Read the canonical dashboard usability, visual and component-composition specs alongside both change-local deltas. ADRs 0001, 0002, 0003, 0004, 0006 and 0007 all currently say Proposed; their status is not silently promoted. The root contracts and implemented boundaries are authoritative.

## Goals / Non-Goals

**Goals:**

- Make exact tasks checked/total and remaining work the leading progress signal. Show independent artifact readiness second.
- Use one small presentation for task progress across Overview, detail and reader context.
- Preserve change and file identity, status and progress while reading a large document.
- Provide native formatted Markdown, existing safe source text and separate Git comparison without new focus/navigation ownership.
- Prove honest data, safe previews, narrow layout and keyboard behavior in tests and an actual TTY.

**Non-Goals:**

No artifact editing, task toggling, lifecycle controls, domain/lifecycle replacement, remote content retrieval, dependency/registry installation, persisted reader preferences, new dashboard tabs, split file-list reader, expanded preview limits, unrelated cleanup or release changes. Optional provenance disclosure is not a required new control.

## Selected Direction

Use the approved selective-component brief with the existing palette, ruled register hierarchy, active/history vocabulary and NO_COLOR behavior.

### Progress and passive context

Move the already duplicated progress presentation into a focused shared TUI unit, retaining the existing model as the source of counts. Do not implement new task or artifact parsers. Keep pending/error data states visible at the view boundary rather than passing a fabricated zero ratio to a display component.

For valid positive totals, derive track fill from the exact count ratio. Use floor-style cells and reserve the final cell for checked equal to total. If percentages are shown, incomplete work must stay below 100%. Exact counts and remaining tasks are always available regardless of track resolution. Known zero tasks uses a no-checklist-tasks label with no determinate track; missing/invalid tasks remains Unknown.

Keep the existing reduced-motion and NO_COLOR static behavior. If transitions are retained, animate only a genuine known-to-known update, never an unknown-to-known invented starting value. Cap a transition against the current authoritative completion state, including a 100/100 to 99/100 regression, so its first frame cannot present a full current track. Unchanged data stays static.

Reuse shared headings, panels and theme for passive status labels and breadcrumb. Do not copy TermCN's global Left Arrow handler or TUI Parts' tab/focus primitives.

### Reader modes and key ownership

Keep browser list/detail/file state separate from reader mode. Represent the reader's Document/Source/Diff modes explicitly and remember the last content mode for returning from Diff. Select Document for case-insensitive .md and .markdown files; select Source for other files. Reset the initial mode on opening another file; do not persist preferences.

- Reader m: switch Document and Source for Markdown only. If invoked from Diff, select the alternate of its remembered content mode.
- Reader d: enter Diff or return to the remembered content mode.
- Existing j/k, arrows, page/home/end scrolling and Esc remain owned by the browser. Detail m continues to select summary because it is a different interaction context.
- Tab, Shift+Tab, keys 1-4 and ? remain global dashboard controls. Mode indicators are passive labels, not additional dashboard tabs. Update contextual hints/help where necessary.

Reset or clamp the content scroll to the new renderer's bounds on mode changes; do not reuse a raw-line scroll position as a Markdown or diff offset. Keep selected item, file cursor and name filter stable when returning through detail and list.

### Compact header and reads

Place breadcrumb, read-only/historical status, task-first progress and mode indicators outside the reading scrollbox. Keep the document/diff inside a single flexible bounded region. Remove duplicate title/framing where needed instead of stacking headers until no reading space remains.

At 100x32, show change name, file path, tasks, secondary planning and status. At 60x18, shorten labels and wrap or abbreviate long identity while keeping the full name/path reachable through the retained-file detail. Preserve at least a usable document region and visible current-mode/back hints. Schema/revision/provenance remain reachable through the existing summary, not additional obligatory header rows.

Reuse selected active detail and historical-task read results. Extend the selected active-detail read's lifetime into file mode where needed, keeping existing refreshVersion invalidation, request identity and cancellation guards. Do not start duplicate reads per render or eagerly read other records. Clear or visibly mark pending/failed context rather than showing another item's counts. A progress read failure does not hide successful file content, and a file failure does not falsify available progress.

### Native Markdown and safety

Document and Source consume the same boundedPreview output from the existing safe file reads. A Document/Source switch need not reread or expand the file. Diff retains the existing independent Git HEAD read and patch renderer, including untracked-file addition previews and unchanged/unavailable explanations.

Before wiring Document into the browser, run a focused local native-renderer test against the installed version. Cover headings, ordered/unordered lists, checked/unchecked task text, code, links, tables and truncated trailing structure. Use existing theme tokens for syntax styles and NO_COLOR equivalents. Tables must fit or remain scroll-reachable at narrow width. Use native renderer hooks only for an evidenced gap; do not build a second Markdown parser.

Verify the code and link paths do not initiate remote grammar/resource loads or URL opening. Prefer plain readable code blocks over extra syntax infrastructure when offline safety cannot be proved. Retain meaningful link text/destination safely without introducing URL actions or unsafe terminal hyperlink sequences. Source always exposes the same safe text if Markdown concealment or an unsupported construct needs inspection.

Retain explicit empty, pending, read-error, rendering-limitation and truncated states. A safe renderer limitation needs a visible explanation and selectable Source, not catch-and-hide fallback or a claim of full rendering. Keep truncation visible outside the document viewport so scrolling cannot hide it. Do not close incomplete fences by modifying stored or source text.

## Implementation Guardrails

- Primary paths: src/tui/overview.tsx, browser.tsx, model.ts and presentation.tsx; theme.tsx and app.tsx only for necessary styles/key guidance. A small src/tui reader or progress unit may separate repeated presentation, not introduce a generic framework.
- Existing domain reads, OpenSpec identity/pins and archive guards remain untouched. Settings stays the only write surface.
- Preserve containment, symlink refusal, bounded reads, safeReadError and async cancellation. Links, Markdown and viewed paths are untrusted content.
- No package.json, bun.lock, resources/ or provider configuration changes. Any required new interactive primitive or dependency must stop for separate approval.
- During apply, read Impeccable's current craft/build and finish requirements plus full Sideroom TypeScript guidance before code edits. Do not use web-browser screenshots as proof for this terminal interface.
- Keep existing uncommitted TUI delivery and release-label work intact. Do not count their tests or changes as new implementation evidence.

## Alternatives Considered

- Import the two component sets: rejected. TermCN progress mishandles unknown totals; its Markdown recipe lacks needed coverage; breadcrumb has global keys. TUI Parts Tabs owns focus and keyboard state. Adapting presentation costs less than integrating competing owners and new dependencies.
- Keep source-only reading: safe but misses the approved formatted-reading goal.
- Split reader with persistent file list: not selected. It sacrifices reading width and differs from the user's large-reader choice.
- Recompute status from rendered documents: rejected. It creates competing workflow authority, especially for archives.
- Add disclosure and persisted reader settings now: not necessary for the approved scope. Existing detail access preserves secondary information.

## Risks / Trade-offs

- R1: Native Markdown coverage and offline behavior are not fully proved. A focused installed-version test must precede integration. A material incompatibility requiring new dependencies or a weaker approved document contract triggers a user loopback, not silent substitution.
- R2: Current detail-only read lifetimes can leave reader headers stale or mismatched. Extend only selected-item reads and retain identity/cancellation/refresh guards; test races and independent failures.
- R3: A compact status header can consume narrow viewport space. Prefer shared labels and minimal framing, then prove 60x18 with long names, error and truncation.
- R4: Animation may imply full progress after task counts regress. Test transition boundaries against current exact counts, not only the target static frame.
- R5: Source cannot promise full/raw file fidelity because existing sanitation and limits are intentional. Label it bounded safe source and preserve explicit truncation.
- R6: An unarchived sibling delta touches visual hierarchy. This delta adds narrower requirements and leaves the sibling's modified block alone; archive/sync order must reconcile both later, outside this proposal.

## Migration Plan

No persisted data or schema migration is needed. Apply later to the existing terminal components and tests, then update command help/documentation and shipped design records from actual behavior. Rollback restores the prior presentation and source/diff reader without touching artifacts or OpenSpec metadata.

Apply acceptance requires focused TUI tests, pilotty at 100x32 and 60x18 with color/static modes, an independent review and bounded repair pass, strict OpenSpec validation, git diff --check and bun run check with an observed exit. Record commands, terminal captures and limitations in journey.md before checking implementation tasks. A passing pre-implementation suite is baseline evidence, not proof that the planned reader exists.

## Open Questions

No unresolved product or architecture choice blocks authoring tasks. Renderer coverage, no-network behavior and narrow layout remain explicit implementation proof obligations, not assumptions of success. If those trials contradict the approved route, stop and ask before changing scope; record any accepted loopback across journey, proposal, deltas, design, ADR and tasks.

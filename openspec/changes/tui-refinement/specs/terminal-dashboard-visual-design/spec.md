## ADDED Requirements

### Requirement: Task-first truthful progress presentation

Overview, active-change details and active file-reader context SHALL use a consistent task-first progress treatment showing exact checked/total tasks and remaining work when known, with planning readiness separately labeled and secondary. Optional percentages SHALL never replace exact counts. Known positive-total progress SHALL use a bounded proportional track. The final cell and any 100% label SHALL be reserved for checked equal to total; rounding and animated transitions SHALL NOT imply full completion earlier. Unknown or invalid totals SHALL have no track or percentage. Known zero-task results SHALL have an explicit no-tasks state without a percentage or track. Historical task progress SHALL be labeled historical rather than styled as active execution.

#### Scenario: Incomplete work near completion
- **GIVEN** an active change has 99 checked tasks out of 100
- **WHEN** progress is rendered at ordinary or narrow widths or during a transition from earlier progress
- **THEN** 99/100 and one remaining task are readable and at least one track cell stays unfilled with no 100% or completed label

#### Scenario: Exact completion and small tracks
- **GIVEN** valid task progress is 0/10, 1/10, 9/10 or 10/10
- **WHEN** the same progress presentation is used in Overview, details and reader context with a short track
- **THEN** exact counts remain truthful, only 10/10 fills the track fully, and progress remains understandable in NO_COLOR and reduced-motion modes

#### Scenario: Unknown, no tasks and historical counts
- **GIVEN** one item has unavailable task data, another has a successful zero-task read and an archive record has retained checklist counts
- **WHEN** their progress is displayed
- **THEN** Unknown and no-tasks states are distinct without determinate tracks, while the archive record's known counts have an explicit historical label without suggesting active execution

### Requirement: Compact persistent reader hierarchy

The Changes and Archive file reader SHALL display passive status labels and a noninteractive breadcrumb for tab, selected item and file. A compact header SHALL keep task progress primary, planning secondary and read-only or historical status visible above a large bounded reading region. Document / Source / Diff indicators SHALL identify the selected mode without introducing dashboard tabs, a competing focus owner or a navigable file sidebar. Secondary schema and provenance facts SHALL remain reachable through existing details rather than consuming the main reading viewport. This hierarchy SHALL retain the approved Change Register identity and active/history separation.

#### Scenario: Read a long document at ordinary size
- **GIVEN** the reader is open at 100x32
- **WHEN** the user scrolls a long document or Git comparison
- **THEN** file identity, selected mode, status and progress context remain separate from the scrolling document, with current actions and an Esc back cue discoverable

#### Scenario: Narrow reader without color or motion
- **GIVEN** the reader is open at 60x18 with NO_COLOR and reduced motion enabled
- **WHEN** the user reads a long-named file, switches modes and resizes
- **THEN** the interface compacts or wraps context without displacing all document content, essential identity and actions are readable or reachable, the mode and historical/read-only status remain explicit, and scrolling cannot cover the global shell

#### Scenario: Global and local navigation remain distinct
- **GIVEN** the reader is open on any content mode
- **WHEN** the user uses Tab, Shift+Tab, keys 1-4, ?, d, the document/source shortcut or Esc
- **THEN** global keys retain their existing functions, local reader keys act only in their context, and passive labels and breadcrumb do not intercept keyboard focus

# terminal-dashboard-usability Specification

## Purpose
Defines discoverable navigation, read-only inspection, progress, and state feedback for the four-tab dashboard across terminal widths and accessibility modes.

## Requirements

### Requirement: Discoverable four-tab navigation and visible selection

The dashboard SHALL retain the Overview, Changes, Archive, and Settings tabs, visibly identify the active tab and current selection without relying on color, and show keyboard hints for the active tab and interaction mode. Tab and Shift+Tab SHALL cycle through the four tabs, number keys 1–4 SHALL select the corresponding tab, and ? SHALL show or hide keyboard help.

#### Scenario: Switch tabs and discover current actions
- **GIVEN** the dashboard is open on any tab
- **WHEN** the user switches tabs with Tab, Shift+Tab, or a number key, or opens help with ?
- **THEN** the active tab is identifiable, help describes the existing tab actions, and the visible keyboard hints do not present unavailable actions as available

#### Scenario: Identify the focused list or file entry
- **GIVEN** a Changes, Archive, or Settings list is active
- **WHEN** the user moves the selection with its supported navigation keys
- **THEN** the selected row is visibly distinct from unselected rows, and the selection remains identifiable without color

### Requirement: Browse active changes and archived records as read-only details

The Changes and Archive tabs SHALL present separate selectable lists and item details. Changes SHALL identify active changes; Archive SHALL identify its records as historical and not active. Opening an item SHALL show its available identity, status or schema, provenance and progress information, and retained file list. These views SHALL allow reading file contents and Git comparisons only; they SHALL NOT provide lifecycle, artifact-editing, or archive-mutation actions.

#### Scenario: Open an active change or historical record
- **GIVEN** a list contains active changes or archived records
- **WHEN** the user selects an entry with the arrow or j/k keys and presses Enter
- **THEN** the dashboard opens details for that selected entry, identifies whether it is active or historical, and visibly indicates how to return to the list

#### Scenario: Inspect a retained file and return through the views
- **GIVEN** an item detail lists retained files
- **WHEN** the user selects a file and presses Enter, then presses d to toggle its content and Git comparison
- **THEN** the selected file's bounded content or available comparison is shown, any unavailable comparison is explained, and Esc returns one level at a time while preserving the selected item and list filter

### Requirement: Filter the read-only lists without losing context

The Changes and Archive lists SHALL support a visible name filter using /, incremental text entry, Enter to finish filtering, and Esc to cancel or clear it. The dashboard SHALL distinguish a list with no entries from a populated list with no filter matches.

#### Scenario: Filter and clear a list
- **GIVEN** a Changes or Archive list is visible
- **WHEN** the user enters a name fragment after / and finishes with Enter
- **THEN** only matching entries remain visible, the active filter is shown, and opening then returning from an entry preserves that filter

#### Scenario: No filter matches
- **GIVEN** the list contains entries
- **WHEN** the current filter matches none of them
- **THEN** the dashboard reports that no records match instead of reporting that the list itself is empty

### Requirement: Summarize specifications, active changes, and completed history in Overview
Overview SHALL have distinct Summary, Active Changes, and Completed Changes sections modeled on `openspec view` while retaining the four-tab dashboard. Summary SHALL show the canonical OpenSpec specification and requirement counts, active-change count, completed-change count, and aggregate checked-task progress when each source is available. It SHALL NOT count schemas or change-local delta specifications as canonical specifications. Active Changes SHALL show each change name and its checked-task fraction or an explicit Unknown value; Completed Changes SHALL list archived records as historical, not as active work. Overview SHALL obtain these facts through the shared read layer without eagerly reading archived details or off-screen panels. Each section SHALL distinguish pending, successfully empty, and failed reads rather than using guessed zeros.

#### Scenario: Scan an Overview with active and completed changes
- **GIVEN** OpenSpec reports canonical specifications and requirements, one active change with known task counts, and an archived record
- **WHEN** Overview finishes loading each section
- **THEN** Summary reports the authoritative counts, Active Changes shows the named change and its checked-task fraction, Completed Changes identifies the historical record, and planning readiness is not substituted for task progress

#### Scenario: A summary source is empty, pending, or failed
- **GIVEN** the canonical specification inventory is empty, pending, or fails to load while other project sections have their own results
- **WHEN** Overview renders
- **THEN** the specification/requirement totals are respectively 0/0, Loading, or Unknown with an error, other successful sections remain accurately labeled, and the complete Overview is not called ready while a required section is still pending

### Requirement: Report planning readiness and implementation task progress separately

The Overview and active-change details SHALL report planning-artifact readiness separately from checked implementation-task progress. Each value SHALL reflect its corresponding OpenSpec data, and SHALL NOT be inferred from the other value. Missing or invalid task progress and unavailable planning totals SHALL be labeled unknown rather than presented as a guessed percentage or completed state.

#### Scenario: Planning and task counts differ
- **GIVEN** an active change has known planning artifacts and known implementation-task counts
- **WHEN** its overview or detail is displayed
- **THEN** planning readiness is identified in artifact terms and implementation progress in checked-task terms, each using its own counts

#### Scenario: Progress data is unavailable or invalid
- **GIVEN** task counts are missing or invalid, or there are no planning artifacts from which to calculate readiness
- **WHEN** the dashboard renders progress
- **THEN** the unavailable value is identified as unknown and is not shown as zero progress, full completion, or a value borrowed from the other progress measure

### Requirement: Distinguish loading, empty, and read-error states

The dashboard SHALL show a loading state until the initial project read is available and SHALL distinguish a successful empty result from a failed read, an unmatched filter, and an empty retained-file list. A read failure SHALL be surfaced in the relevant view as an error rather than represented as an empty or successful result.

#### Scenario: Initial project read is pending
- **GIVEN** the dashboard has opened and the initial project read has not completed
- **WHEN** the first dashboard frame is rendered
- **THEN** the four-tab shell is visible with a loading indication and unavailable project data is not represented as zero or as a successful empty project

#### Scenario: Project, archive, or detail has no entries
- **GIVEN** a project read succeeds with no active changes, an Archive read succeeds with no records, or an item has no retained files
- **WHEN** the corresponding view is displayed
- **THEN** it shows an explicit empty-state message that identifies the empty collection

#### Scenario: A read fails
- **GIVEN** a project, item-detail, or file read fails
- **WHEN** the affected view is rendered
- **THEN** it displays a safe, contextual error and does not claim that the failed read found no entries

### Requirement: Preserve essential content at narrow terminal widths

The four tabs SHALL remain navigable at ordinary and narrow terminal sizes. At narrow widths, names, the active tab and selection, essential status or detail, and the current interaction's keyboard hints SHALL remain readable or reachable through wrapping or vertical scrolling rather than being silently clipped or made unavailable.

#### Scenario: Resize a read view to a narrow terminal
- **GIVEN** the user is browsing a list, item detail, file, or Settings list
- **WHEN** the terminal is resized to a narrow width
- **THEN** the current view remains usable, its selection and primary keyboard hints remain discoverable, and the user can continue the same read-only navigation or Settings preview flow

### Requirement: Keep meaning independent of color and respect reduced motion

Status, progress, errors, selection, and keyboard guidance SHALL remain understandable when color is disabled; color SHALL NOT be the sole indicator of meaning or focus. When reduced motion is enabled, progress SHALL be rendered without animated transitions. When motion is allowed, progress animation SHALL represent a real change in known data and SHALL NOT imply progress for unknown values.

#### Scenario: Render without color
- **GIVEN** color output is disabled
- **WHEN** any tab displays a selected row, status, progress, loading state, or error
- **THEN** text, labels, or non-color selection markers still convey the same meaning and selection

#### Scenario: Render with reduced motion or unchanged data
- **GIVEN** reduced motion is enabled, or a data refresh leaves a known progress value unchanged
- **WHEN** progress is rendered
- **THEN** progress is static and accurate, with no animation for reduced motion or unchanged data

### Requirement: Preserve Settings preview and provider-approval boundaries

Settings SHALL keep project-changing actions behind their existing explicit previews and confirmations. Staging a schema, profile, or migration selection SHALL NOT itself change the project; applying those selections SHALL require a preview and a separate confirmation that identifies the exact target and selected effects. MCP installation SHALL require a distinct interactive approval after preview, showing the provider and URL, host and target, authentication and permissions, and proposed diff. Denial, cancellation, or a changed preview target SHALL NOT install the provider. The dashboard SHALL NOT add lifecycle-writing controls to Overview, Changes, or Archive.

#### Scenario: Preview and confirm schema settings
- **GIVEN** the user has staged schema, profile, or migration selections in Settings
- **WHEN** the user requests a preview and then considers Apply
- **THEN** the preview is shown before any write, Apply presents the exact schema target and selected effects for separate confirmation, and canceling makes no change

#### Scenario: Approve or deny an MCP provider installation
- **GIVEN** Settings has produced a changed MCP installation preview
- **WHEN** the user requests installation
- **THEN** the dashboard presents the provider details and waits for a separate interactive approval; denying, canceling, or detecting that the preview target changed results in no installation

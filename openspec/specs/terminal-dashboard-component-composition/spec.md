# terminal-dashboard-component-composition Specification

## Purpose
Defines a component-based hierarchy for the four-tab dashboard so navigation, selected content, Settings stages, and read-only states remain distinguishable.

## Requirements

### Requirement: Component-composed shell and view hierarchy
The dashboard SHALL render global navigation, current view, grouped content, selected context, and contextual actions as distinct visual regions across Overview, Changes, Archive, and Settings. It SHALL preserve the existing tab navigation and one keyboard owner; the regions SHALL convey their roles through text and position without relying on color or animation.

#### Scenario: Move between four views
- **GIVEN** the interactive dashboard is open at 100x32
- **WHEN** the user switches among the four tabs with Tab, Shift+Tab, or keys 1-4
- **THEN** the active tab and current view remain identifiable, view-specific sections are visually grouped, and contextual actions correspond to the active view without a second navigation handler

#### Scenario: Narrow terminal and static display
- **GIVEN** the terminal is 60x18, NO_COLOR and reduced motion are enabled
- **WHEN** the user resizes and navigates from a list to detail or review
- **THEN** the interface stacks or scrolls its content while keeping the active view, selected context, state, and next/back action discoverable through labels and markers, without clipping text needed to choose an action

### Requirement: Visible selected row and bounded content
Selectable lists SHALL keep the actual selected row visible within the list viewport as keyboard selection moves, including after asynchronous rows arrive and terminal resize. A label outside the list SHALL NOT substitute for a visible selected row. Long detail, file, and review content SHALL scroll inside a bounded region without covering the shell or action cues.

#### Scenario: Navigate past the first viewport
- **GIVEN** Settings contains more selectable rows than the visible list height
- **WHEN** the user moves selection from the first row to an offscreen row and resizes the terminal
- **THEN** that row and its selected marker are visible inside the list viewport and its full identity can be inspected without guessing from a separate Focus label

#### Scenario: Read long exact-effects preview
- **GIVEN** a reviewed plan lists multiple hosts and destination paths longer than the terminal width
- **WHEN** the user pages through the read-only preview
- **THEN** each target, action, destination, and blocked/no-op reason can be read within the review region, and the current stage and back/next action remain visible

### Requirement: Truthful Settings state sequence
Settings SHALL visually and textually distinguish selection, staged choices, exact read-only preview, Apply confirmation, and observed result. A checked row or staged choice SHALL NOT be styled or described as an applied write. Each preview effect SHALL identify its target, action, resolved destination and reason when known; result labels SHALL reflect observed per-target evidence and SHALL NOT infer success from confirmation or an overall result alone. Provider approval SHALL remain a separate consent state.

#### Scenario: Stage, inspect, and cancel
- **GIVEN** the user selects a schema, an OMP or Atomic skill host, and another available target
- **WHEN** they stage the choices, inspect exact effects, and cancel at confirmation
- **THEN** the views label choices as selected/staged, the preview as read-only, the confirmation as pending consent, and no target is labeled applied or written

#### Scenario: No-op, blocked, partial, and historical result
- **GIVEN** the exact-effects preview contains install, no-op, and blocked target effects, or a prior Apply has incomplete evidence
- **WHEN** the user inspects the review or reopens Settings to see the result
- **THEN** no-op and blocked reasons remain distinct from would-install effects, each observed target is labeled only to the extent evidence supports, and historical or recovery-needed information is not presented as a new success

#### Scenario: Separate provider approval
- **GIVEN** a selected schema also declares an MCP provider
- **WHEN** the user previews schema effects and subsequently opens provider approval
- **THEN** the provider URL, host, permissions and config diff appear under a distinct provider-review heading and accepting schema Apply never implies provider authorization

### Requirement: Read-only overview and browser components
Overview SHALL group project summary, active planning readiness, known task completion, and completed history into distinct sections. Changes and Archive SHALL expose list, detail, and file levels with a visible current level and back path while remaining read-only. Known completion MAY use a proportional indicator, but missing or invalid totals SHALL be labeled Unknown without a fabricated ratio.

#### Scenario: Return from a retained file
- **GIVEN** a user filtered Changes or Archive, selected an item, and opened a file
- **WHEN** they return through detail to the list
- **THEN** each level identifies its role, the filter and selected item survive, and no write or lifecycle action is offered

#### Scenario: Independent reads and unknown progress
- **GIVEN** one overview section is pending or failed while another is ready, and a change has missing task totals
- **WHEN** Overview renders and the pending read settles
- **THEN** each section shows its own labeled pending, error, empty, or ready state; Unknown progress has no percentage or proportional bar; any pending motion stops on settlement or inactive view

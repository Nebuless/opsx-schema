# terminal-dashboard-visual-design Specification

## Purpose
Defines a consistent visual hierarchy and truthful state styling for the four-tab terminal dashboard with bounded motion.

## Requirements

### Requirement: Hierarchical four-tab composition
The dashboard SHALL distinguish its global navigation, current tab, content sections, selected item and available actions through consistent headings, spacing and bounded section framing, while preserving the existing tab and keyboard controls. Color SHALL reinforce, not replace, text or selection markers.

#### Scenario: Scan an ordinary terminal
- **GIVEN** the dashboard is displayed at 100x32 with a selected item
- **WHEN** the user switches among Overview, Changes, Archive and Settings
- **THEN** the active tab, current section and selected item remain visibly distinct and context-specific keys are shown without duplicating a global navigation handler

#### Scenario: Use a narrow terminal without color
- **GIVEN** a 60x18 terminal with NO_COLOR enabled
- **WHEN** the user enters a list, detail, file preview or Settings review and resizes the terminal
- **THEN** content groups stack or scroll without hiding the active tab, essential selected-item identity, state and current-mode actions; labels and markers carry meaning without color

### Requirement: Scannable overview and read-only browser hierarchy
Overview SHALL group summary, active-change progress and completed history distinctly; Changes and Archive SHALL visibly distinguish list, detail and file levels with contextual back paths. Historical records SHALL remain identified as historical. The visual treatment SHALL preserve the read-only boundary and separate planning readiness from checked-task progress.

#### Scenario: Inspect an active or archived item
- **GIVEN** the user has a selected active change or historical record
- **WHEN** the user opens its detail and a retained file then returns with Esc
- **THEN** each level has a visible label and back cue, the selected item/filter survive return, and no lifecycle write control appears

#### Scenario: Show known and unknown progress
- **GIVEN** one change has known checked and total tasks and another has invalid or missing totals
- **WHEN** Overview or a detail displays progress
- **THEN** the known change shows a fraction and proportional visual progress, the other says Unknown without a fabricated bar or percentage, and planning readiness is separately labeled

### Requirement: Honest state styling and bounded motion
Pending, empty, unmatched, failed, staged, applied, blocked, unchanged and recovery-needed states SHALL be distinguishable by words and markers as well as color. Animation SHALL occur only for genuine pending work or meaningful changes to known progress, SHALL NOT delay frequent keyboard navigation, and SHALL have a static reduced-motion equivalent.

#### Scenario: Pending read and result
- **GIVEN** a project section is loading while another has succeeded or failed
- **WHEN** the dashboard renders and the pending read settles
- **THEN** the pending section alone has a labeled loading indicator, success or failure replaces it accurately, and no loading animation continues after settlement

#### Scenario: Repeated navigation with reduced motion
- **GIVEN** reduced motion is enabled and color output is disabled
- **WHEN** the user repeatedly switches tabs or list rows and enters a Settings preview
- **THEN** navigation feedback is immediate and static, every state remains readable, and no continuous spinner, skeleton or progress animation is required to understand it

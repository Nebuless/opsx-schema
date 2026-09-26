## ADDED Requirements

### Requirement: Four-tab project dashboard
The React OpenTUI dashboard SHALL provide Overview, Changes, Archive, and Settings for one resolved project. Overview SHALL distinguish artifact-readiness progress from explicit checked implementation-task progress; missing or unparsable task state MUST appear as Unknown rather than as a guessed percentage. Animations SHALL reflect observed changes and respect reduced-motion and no-color environments.

#### Scenario: Partially completed work
- **GIVEN** a change with all planning artifacts present and three of seven tasks explicitly checked in OpenSpec's apply task state
- **WHEN** a person opens Overview
- **THEN** artifact readiness and task progress are shown separately as complete planning and three of seven implementation tasks.

#### Scenario: Unreadable tasks
- **GIVEN** an active change whose task artifact is absent or cannot be parsed
- **WHEN** Overview displays its implementation progress
- **THEN** the value is Unknown and no animation implies that work is progressing.

### Requirement: Navigable active files and history
Changes SHALL provide a selected-list/detail view with keyboard navigation, file selection, readable content and bounded per-file diffs. Archive SHALL list archived records independently of active-change status and allow safe inspection of their retained files and schema provenance. Missing, binary or oversized content MUST yield an informative bounded view rather than a crash or arbitrary file access.

#### Scenario: Browse a change and archive
- **GIVEN** one active change and one archived change with retained files
- **WHEN** a person selects each, opens a file, navigates its diff, and drills back
- **THEN** the correct active or historical file is shown without treating the archive as an active change.

#### Scenario: Unsafe file target
- **GIVEN** an archived entry with a path outside its resolved archive root
- **WHEN** a person attempts to view that entry
- **THEN** the dashboard refuses the read and does not expose the external file.

### Requirement: Read-only navigation outside Settings
Overview, Changes and Archive SHALL NOT write project, artifact, change or host configuration. Settings SHALL stage changes with named agent-profile checkboxes, an exact preview and an enabled Apply control only when a supported selection differs from current state. Display refresh SHALL invalidate an outdated preview before Apply.

#### Scenario: Inspection without mutation
- **GIVEN** a project with an active change
- **WHEN** a person navigates all read-only tabs, selects files and views validation findings
- **THEN** project files, task checkboxes and change metadata remain unchanged.

#### Scenario: External edit during preview
- **GIVEN** Settings displays a pending schema switch
- **WHEN** another process modifies a relevant schema or project file before Apply
- **THEN** the preview is invalidated and Apply requires a fresh review.

## Next Handoff

`openspec instructions design --change "build-opsx-schema-application" --json`

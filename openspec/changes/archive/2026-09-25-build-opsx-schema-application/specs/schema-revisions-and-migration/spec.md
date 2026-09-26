## ADDED Requirements

### Requirement: Resolved immutable schema revisions
Schema selection SHALL show the effective named revision, resolved source and content identity, including graph, templates, instructions and declared resource manifests. A referenced revision MUST remain inspectable for active and archived changes; a same-name shadow, edit or missing referenced content MUST be reported rather than silently changing a change's effective behavior.

#### Scenario: Template-only customization
- **GIVEN** an active change pinned to a named revision and a local override with the same name but altered template text
- **WHEN** the application resolves that change or previews a switch
- **THEN** it reports revision drift and refuses mutation until the override is resolved or a distinct revision is selected.

### Requirement: Per-change identity and history
The change name and OpenSpec schema pin SHALL remain authoritative for current identity and effective schema. Opsx SHALL show the known original revision, current revision and explicit migration receipts with source/content identity; unknown legacy origin MUST be labeled Unknown rather than inferred from today's project default. History SHALL remain with an archived change.

#### Scenario: Known migrated change
- **GIVEN** a change created under `design-v1` and explicitly migrated to `design-v2`
- **WHEN** the person views its active or archived details
- **THEN** the view distinguishes created-under and current schema and shows the migration without adding another change ID.

#### Scenario: Unknown legacy origin
- **GIVEN** an older change without a provenance record
- **WHEN** its history is viewed
- **THEN** the creation revision is Unknown, even if the current default is resolvable.

### Requirement: Selective, content-safe migration
Switching the project default SHALL preserve existing pinned and archived changes unless specific active changes are checked for migration. A checked change SHALL move only after its destination schema and existing artifact content are compatible and valid; a schema-pin handoff MUST NOT claim to convert artifact bodies. Incompatible selected changes SHALL block Apply without partially switching. Older unpinned active changes MUST retain their old effective revision or cause a safe refusal before default activation.

#### Scenario: Different artifact graphs
- **GIVEN** two active changes under an old schema, one checked for migration to a design-oriented schema with unmapped required artifacts
- **WHEN** Settings previews Apply
- **THEN** Apply identifies the missing mapping and refuses the selected migration until an external editor or agent reconciles the artifacts and validation succeeds; the unchecked change remains under its old schema.

#### Scenario: Legacy unpinned change
- **GIVEN** an unpinned active change that currently inherits the project default
- **WHEN** a new default is applied without selecting that change for migration
- **THEN** the change keeps its prior effective revision through a safe pin, or the entire switch stops before changing the default if preservation is impossible.

## Next Handoff

`openspec instructions design --change "build-opsx-schema-application" --json`

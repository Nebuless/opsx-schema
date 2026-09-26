# schema-revisions-and-migration Specification

## Purpose
Tracks resolved schema revisions and per-change provenance so selective migrations preserve content identity and history.

## Requirements

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

### Requirement: Distinct-identity bundled schema updates
When a newer bundled schema differs from an installed schema of the same name, Opsx SHALL offer an explicit installation under a distinct, valid schema name instead of overwriting the old named tree. The installed schema SHALL validate under its new identity and record its bundle source and content identity. The previous named schema and every active or archived change pinned to it MUST remain resolvable with their previous effective content; changing the project default or migrating pins MUST remain a separate reviewed operation.

#### Scenario: Install newer content beside an active pinned revision
- **GIVEN** an owned installed `intent-driven-design` revision with an active or archived change pinned to it, and a newer bundled revision with different content
- **WHEN** a person previews and authorizes installing the newer bundle under an unused valid name such as `intent-driven-design-next`
- **THEN** the new named schema resolves and validates, the original schema's bytes and pinned change behavior are unchanged, and the project default remains unchanged until a separate switch.

#### Scenario: Existing target is identical
- **GIVEN** an installed named schema whose declared bundle content is identical to the requested source
- **WHEN** the same installation is previewed again
- **THEN** the operation reports no change and does not rewrite the installed tree or revision provenance.

#### Scenario: Changed same-name or conflicting destination
- **GIVEN** an installed schema whose content differs from the requested bundle, or a proposed new name whose target already exists with different ownership or content
- **WHEN** installation is previewed without a distinct collision-free identity
- **THEN** it refuses the mutation with the conflicting path and reason; it does not alter either schema tree, project default, or existing pins.

#### Scenario: Host-independent revision with separately targeted resources
- **GIVEN** the updated bundled schema declares managed skills, schema workflow adapters, or MCP servers for first-class OpenCode, OMP, Pi, Atomic, and Senpi
- **WHEN** it is installed beside the old named revision and its host resources are inspected
- **THEN** the new OpenSpec schema has one independently validated name and content identity, the old schema and active or archived pins retain their previous effective content, and each host's adapter, skill and server target is previewed and approved through its own host contract rather than being implied by schema installation.

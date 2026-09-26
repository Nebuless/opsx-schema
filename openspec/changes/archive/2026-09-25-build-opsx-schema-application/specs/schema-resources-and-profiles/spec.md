## ADDED Requirements

### Requirement: Profile-aware schema Apply
Settings SHALL let a person select a destination revision, check named agent profiles, select optional active changes for migration, inspect exact schema/skill targets and collisions, and Apply only a valid changed selection. Applying SHALL install the destination schema and its declared skills for checked profiles before changing the project default. Host-shared installation MUST be identified as shared rather than claimed to be per-agent isolation.

#### Scenario: Successful switch
- **GIVEN** a destination schema with declared skills and two checked agent profiles sharing one host directory
- **WHEN** the person reviews and applies a compatible switch
- **THEN** the schema and required skills are installed without duplicate physical writes, the project default changes, and the UI shows accurate shared targets.

#### Scenario: Profile collision
- **GIVEN** a checked profile whose target contains a conflicting unmanaged resource
- **WHEN** the person previews Apply
- **THEN** the conflict and target are disclosed and the switch refuses unsafe replacement.

### Requirement: Retention and contextual active use
A schema switch MUST NOT remove previously installed skills. Installed state SHALL be distinguished from active use under the new project default and under an existing change's pinned schema. An explicit CLI skill-disable operation SHALL be separate from switching, preview its exact effect, and refuse deletion of shared or active-change-required resources.

#### Scenario: Old change after switch
- **GIVEN** an unchecked active change pinned to the old revision
- **WHEN** the project default switches to a new revision
- **THEN** old skills remain installed and are identified as active for the old change but not necessarily for new changes.

#### Scenario: Guarded explicit disable
- **GIVEN** a skill resource referenced by an active pinned change or shared profile
- **WHEN** a caller explicitly previews disabling it
- **THEN** removal is refused without disturbing the resource or active change.

### Requirement: Recoverable multi-file mutation
Apply SHALL detect stale or concurrent changes, keep the default from pointing to an incompletely installed schema, and either recover or report exact partial writes and safe next actions after interruption. An unchanged repeated Apply SHALL be a no-op.

#### Scenario: Mid-apply interruption
- **GIVEN** a schema switch interrupted after some profile skills were staged but before default activation
- **WHEN** Opsx resumes or a person inspects the project
- **THEN** the old default remains usable, partial owned writes are identified and recoverable, and no success is reported.

### Requirement: Separate approved MCP installation
An MCP server SHALL be selected only from a declared safe catalog with a supported host and a preview of URL, permissions/auth metadata, config path and diff. Installation MUST require immediate interactive human provider-safety approval, including from CLI; non-TTY callers MAY inspect/preview but MUST be refused for Apply. A schema switch SHALL NOT install MCP servers implicitly.

#### Scenario: Unattended install request
- **GIVEN** an agent or pipe without a usable TTY
- **WHEN** it attempts to apply MCP host installation using an approval flag
- **THEN** no host config changes and it receives instructions to use an interactive approval path.

#### Scenario: Human approval at risk
- **GIVEN** a supported catalog entry and an existing host config
- **WHEN** a person reviews the exact provider, target and diff and explicitly approves installation in Settings or an interactive CLI
- **THEN** only the approved entry is installed; unsafe or conflicting entries fail closed.

## Next Handoff

`openspec instructions design --change "build-opsx-schema-application" --json`

## ADDED Requirements

### Requirement: CLI compatibility across internal modularization
The application SHALL preserve the existing command grammar, flags, project-resolution rules, executable entrypoint, versioned response envelopes, exit behavior, and usable-TTY dashboard behavior when internal command and lifecycle code is reorganized. The reorganization MUST NOT remove or replace any schema, skill, MCP, adapter, read, diagnostic, or change-lifecycle operation.

#### Scenario: Existing command families remain available
- **GIVEN** a supported project and the same arguments and fixtures used before reorganization
- **WHEN** a caller runs project reads, schema inspection/install/validation/switch, change create/status/instructions/validate/archive/schema handoff, skill inspect/doctor/reconcile/install/disable, MCP list/inspect/install, adapter inspect/install, doctor, and verify
- **THEN** each operation retains its existing target selection, response facts, approval requirements, and success or error behavior; no replacement syntax or legacy alias is required.

#### Scenario: Startup and machine-readable output remain stable
- **GIVEN** the packaged executable and an initialized project
- **WHEN** a caller uses an explicit command with `--json`, bare invocation without a usable TTY, or bare invocation with a usable TTY
- **THEN** an explicit JSON command produces its single `schemaVersion: 1` response with the existing exit behavior, non-TTY bare invocation refuses without a renderer or hidden prompt, and usable-TTY bare invocation opens the same dashboard.

#### Scenario: Global flags and project-free routes retain meaning
- **GIVEN** a nested directory in a project or a directory without a project
- **WHEN** a caller uses accepted positions of `--project`, `--json`, or help flags, or requests a bundled catalog route outside a project
- **THEN** nearest-project and exact-project resolution, accepted flag positions, help behavior, and existing project-free catalog behavior remain unchanged.

### Requirement: Mutation safety and failure-state compatibility across internal modularization
The application SHALL preserve existing preview-token action and target binding, freshness checks, validation ordering, path and ownership guards, provenance truthfulness, and partial-state recovery behavior when lifecycle code is reorganized. MCP Apply MUST retain its separate immediate interactive human approval; schema switching MUST retain its own guarded transaction and MUST NOT install MCP or remove prior skills implicitly.

#### Scenario: Stale preview remains refused
- **GIVEN** a preview for an exact mutation target
- **WHEN** authoritative state changes before Apply or the token is used for another target
- **THEN** the existing stale or invalid-plan refusal occurs without an unsafe write or false success, and the CLI and lifecycle token formats remain distinct.

#### Scenario: Partial creation and failed handoff remain truthful
- **GIVEN** a creation finalization failure after native creation or a schema-handoff failure during guarded writes
- **WHEN** the caller inspects the result and filesystem
- **THEN** creation retains the native-created change and reports `CREATE_PARTIAL`, while handoff retains its existing rollback behavior and reports `HANDOFF_PARTIAL` when recovery is partial; artifact bodies are not rewritten and unknown historical origin remains unknown.

#### Scenario: Associated migration keeps its existing owner
- **GIVEN** a change with a verified skill-selection association
- **WHEN** a caller requests standalone change-schema handoff or an explicitly selected migration through schema switch
- **THEN** standalone handoff refuses with `PROVENANCE_ASSOCIATION_REVIEW_REQUIRED`, while schema switch retains its reviewed target-selection and recovery requirements.

#### Scenario: MCP approval cannot become unattended
- **GIVEN** an MCP installation preview and a matching token without a usable TTY and immediate typed human approval
- **WHEN** a caller requests Apply after module reorganization
- **THEN** Apply remains refused with no host configuration write; a schema-switch operation neither bypasses this gate nor installs the provider.

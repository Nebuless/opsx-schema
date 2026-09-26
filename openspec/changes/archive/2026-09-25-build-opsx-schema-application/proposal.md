# Intent

## Why

OpenSpec owns workflow state, but the schema package in `../openspec-schemas` exposes separate Node commands for installation, skills, diagnostics and handoff; its optional viewer is read-only and has no archive browser. People cannot inspect progress and files in one coherent application, while agents lack a small, stable interface for the same work. This repository has OpenSpec configuration and planning documents but no application package yet.

## Desired Outcome

A user launches `opsx-schema` into a single-project Bun/React OpenTUI dashboard, sees truthful artifact and task progress, browses active and archived change files, and can stage a schema switch with checked agent profiles and selected active-change migrations. The schema and required skills install before activation; old skills and unmigrated changes remain intact. A separate MCP install requires explicit human provider-safety approval. Agents use noninteractive CLI commands for project inspection and the full OpenSpec lifecycle, with useful defaults, structured output, guarded mutations and the same validation model.

## Scope Boundaries

**In scope:**
- Rebuild the `opsx-schema` CLI/application in this repository and port every capability of the sibling schema installer, diagnostics, skills, handoff, MCP catalogs and viewer by behavior, not its old flags.
- Delegate lifecycle status, artifact instructions/readiness, schema resolution, validation and archive actions to OpenSpec; show archived records through a distinct safe read-only index.
- Four TUI tabs: Overview, Changes, Archive and Settings. Only Settings writes: composite schema/skills switch with profile checkboxes and Apply, and separate approved MCP installation. The CLI owns other lifecycle mutations; an external editor/agent owns artifact text.
- Retain immutable named schema revisions, per-change current pins, creation/migration provenance, and referenced revision content. Preserve legacy unpinned changes on a default switch. Migrate only selected active changes after compatibility and artifact validation; never pretend a pin handoff converted their text.
- Validate artifact and workflow compliance for the change's effective schema and expose read-only detection to hooks/CI. Installed-but-inactive skills remain available; their highlighting is not an agent sandbox.

**Out of scope:**
- Backward-compatible old command syntax, modifications to the sibling package, automatic content conversion, automatic skill removal on schema switch, universal skill-use enforcement, multi-project TUI, and implicit MCP/provider installation. This proposal authorizes planning only, not application implementation.

## Approaches Considered

1. **Extend the sibling Node CLI and imperative viewer.** Reuses more code, but does not deliver the requested standalone Bun/React application or clean agent contract; its existing viewer excludes archive and its handoff only changes metadata.
2. **Build a standalone Opsx application that ports resource capabilities and delegates lifecycle semantics to OpenSpec (chosen).** Makes UI/CLI parity and explicit authority boundaries possible, at the cost of a tested CLI version matrix, resource parity inventory and recoverable cross-file switch transaction.
3. **Implement a complete parallel OpenSpec lifecycle engine inside Opsx.** Could eliminate subprocess integration, but duplicates change readiness, validation and archive semantics and risks diverging from custom schemas.

## Decision Record

The user selected `opsx-schema` as a new simple command contract; bare TTY launches the dashboard, while agents work through noninteractive CLI commands. The TUI browses artifacts rather than edits them. Schema selection is staged with agent-profile checkboxes and Apply; installing that schema and its declared skills is required, old skills are retained, and optional MCP installation is separate. Active changes are migrated only when checked. A change keeps its existing OpenSpec identity and current schema pin; distinct named revisions plus a per-change provenance record track original and migrated schema identity. The validation gate covers artifacts/workflow, not inactive-skill execution. `docs/plans/plan.md` and `adr/0001`–`0003` record implementation direction and trade-offs.

## Capabilities

### New Capabilities
- `project-and-agent-cli`: Human/agent entry, OpenSpec-backed lifecycle commands, defaults, diagnostics, archive reads, structured output and guarded mutation contract.
- `dashboard-and-archive`: React TUI Overview, Changes, Archive and Settings with truthful progress, navigable file/diff views and a distinct historical archive model.
- `schema-revisions-and-migration`: Immutable schema revision resolution/retention, per-change provenance, legacy pin preservation and selected-change handoff without artifact-body conversion.
- `schema-resources-and-profiles`: Profile-checkbox schema/skill installation with recoverable Apply, installed-versus-active visibility, and separately approved host-specific MCP installation.
- `workflow-validation`: Effective-schema artifact/workflow checks for CLI mutations and external-edit detection without claiming runtime skill enforcement.

### Modified Capabilities
- None; this repository has no main capability specs or existing application implementation to modify.

## Success Signals

- Every sibling CLI/resource capability has a documented new operation or OpenSpec delegation, without an unreviewed omission; live help and versioned JSON/compact output agree on observed state.
- Real TTY navigation shows separate artifact and task progress; unknown task state is shown as Unknown, never a guessed percentage. Active and archived files can be inspected, while non-Settings UI paths cannot write.
- Schema Apply installs the destination and required skills for checked profiles, preserves unchecked/archived work and old skills, refuses incompatible selected changes before mutation, and recovers or reports exact partial state after interruption/concurrency.
- A change retains its known or explicitly unknown creation provenance and migration receipts after archive; revision drift and legacy unpinned changes are detected rather than silently reinterpreted.
- Strict validation and real CLI/TUI smoke scenarios prove lifecycle behavior; non-TTY MCP Apply refuses without interactive human provider approval.

## Prior Learning

None found in a repository learning store for this new application. The sibling package's `AGENT_INSTALL.md` and current OpenSpec CLI help provide the relevant existing contracts; see `docs/plans/plan.md` for concrete sources.

## Impact

New Bun package, CLI/domain/resources and React TUI under this repository; new application tests and user/agent help. Reads OpenSpec project metadata, schema files and archives; guarded Settings/CLI operations may change project schema resources, skills, per-change pins/provenance, MCP host config and `openspec/config.yaml` at runtime. The plan at `docs/plans/plan.md` and three ADRs under `adr/` are the upstream decision record. Compatibility risk: installed OpenSpec 1.12.0 and the sibling package's declared `^1.13.0` differ; supported versions must be proven before shipping.

## Next Handoff

`openspec instructions specs --change "build-opsx-schema-application" --json`

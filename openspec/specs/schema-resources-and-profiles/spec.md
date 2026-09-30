# schema-resources-and-profiles Specification

## Purpose
Coordinates reviewed schema, agent-profile, skill, and MCP management while retaining installed resources and recovering from partial changes.

## Requirements

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

### Requirement: Reviewed single-target unmanaged skill replacement and restoration
The CLI SHALL provide a distinct operation to replace exactly one existing unmanaged skill directory from an unambiguous declaration of an explicitly selected installed schema and declared bundle. Ordinary skill installation and schema switching MUST continue to refuse unmanaged collisions. Replacement SHALL require the exact project-relative target, a unique caller-supplied backup identifier, an exact review preview, and a fresh token bound to target, source, backup, active-pin guard, and inventory. It MUST refuse active-required, managed, modified-managed, unsafe, symlinked, special, ambiguously mapped, missing, or changed targets and MUST NOT treat byte-identical unowned content as managed. Replacement SHALL preserve and verify the prior tree in a retained backup before swapping in verified declared content, record truthful recoverable receipt state, and claim completion only when target, ownership and receipt agree. Read-only receipt inspection and separate preview/token restoration SHALL retain backup/receipt evidence; restoration MUST refuse to overwrite external edits or remove a target currently required by an active change. Neither operation SHALL activate a schema or install other skills, adapters, or providers.

#### Scenario: Five OMP collisions are resolved one at a time
- **GIVEN** a selected OMP bundle has five unmanaged collisions and six missing skill directories
- **WHEN** a caller reviews and applies replacement for one exact collision
- **THEN** the selected tree is backed up and replaced, the remaining collisions remain unresolved, and ordinary full-set switch still requires a fresh preview after those collisions are individually resolved.

#### Scenario: Byte-identical unmanaged and modified managed trees
- **GIVEN** one unmanaged skill tree matches declared bytes and a different managed tree has local edits
- **WHEN** the caller previews replacement of either directory
- **THEN** the unowned tree still requires explicit reviewed replacement and the edited managed tree is refused without changing either tree.

#### Scenario: Stale replacement or occupied backup identifier
- **GIVEN** a preview and token bound to one exact target, source, backup identifier, and active-pin inventory
- **WHEN** source, target, ownership, active-pin guard, or backup occupancy changes before Apply
- **THEN** Apply refuses without replacing the target or overwriting the backup.

#### Scenario: Restore after external edit or new active pin
- **GIVEN** a completed replacement whose target was externally edited or became required by a newly created active change
- **WHEN** a caller previews restoring its retained backup
- **THEN** restoration refuses, preserves user and managed data plus receipt evidence, and reports the observed blocker.

#### Scenario: Interrupted replacement
- **GIVEN** replacement stops after backup, staging, target swap, ownership write, or receipt write
- **WHEN** a caller inspects the exact backup receipt
- **THEN** inspection reports the durable observed phase and safe recovery evidence without claiming success or overwriting changed data.

### Requirement: Coordinated active-pin and resource writes
Any Opsx-controlled operation that creates, hands off, archives, reconciles, or migrates an active change's schema/skill association SHALL coordinate with schema switching, skill replacement, and restoration through a common project mutation lock protocol, using a compatible project-first order and acquiring the resource lock after the project lock when both are required. Replacement and restoration SHALL re-evaluate exact active-pin requirements under the held lock before touching the target, re-derive complete verified active-pin targets, and recheck authoritative pin/selection and target/ownership state at write boundaries. Incomplete pin knowledge MUST refuse destructive actions. Non-cooperating OpenSpec commands and external editors do not take this lock; observed changes SHALL cause stale or partial-state refusal at write boundaries, and the CLI SHALL report detected external drift rather than overwrite it or claim atomic exclusion. Ordinary schema switching and skill installation MUST retain their current ownership refusal and recoverable-write behavior, and a collision replacement receipt SHALL remain distinct from a schema-switch journal.

#### Scenario: Concurrent pin writer during replacement
- **GIVEN** an Opsx-controlled operation attempts to add an active skill requirement while replacement is in progress
- **WHEN** both operations contend for the coordinated locks
- **THEN** they serialize without deadlock and replacement cannot overwrite a skill that became required by the active pin.

#### Scenario: Active pin races replacement Apply
- **GIVEN** a replacement preview finds an unmanaged skill target not required by an active pin
- **WHEN** a concurrent change creation or reconciliation tries to make the same target required during replacement Apply
- **THEN** the operations serialize, the pin requirement is rechecked under the common lock, and either replacement refuses or the pin writer observes completed replacement before proceeding; no intermediate unbacked-up tree becomes an approved pin target.

#### Scenario: Existing switch journal requires recovery
- **GIVEN** schema switching has an unresolved partial-state journal
- **WHEN** a caller requests replacement of a target affected by that transaction
- **THEN** replacement refuses until recovery is inspected; it does not interpret the switch journal as proof of ownership or replace the target beneath incomplete recovery.

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

### Requirement: Durable active-pin profile and skill associations
For a change pinned to a schema that declares managed skills, Opsx SHALL record the exact verified named-agent profile IDs, native skill-host IDs, and skill bundle for that change when the change is created or explicitly reconciled. A project switch's selected profiles and hosts MAY supply a new change only when that selection was explicitly persisted for the effective schema revision and verified at creation; current installed skills or an unrecorded historical default MUST NOT be treated as a selection. Doctor and explicit skill-disable checks SHALL resolve the associated targets from that per-change record, distinguish installed state from pinned active use, and refuse unsafe deletion while any required association is unknown.

#### Scenario: New change after an explicitly recorded profile switch
- **GIVEN** a project default revision whose guarded switch recorded OpenCode, OMP, Pi, Atomic, and Senpi native skill hosts, an optional Gemini named profile, and a verified bundle
- **WHEN** a CLI caller creates a change pinned to that revision without overriding the profile selection
- **THEN** the new change records those exact profile and five native host IDs plus bundle, doctor can prove its required skill targets, and disable refuses removal of a target required by the active change.

#### Scenario: Explicit creation selection without recorded project profiles
- **GIVEN** a pinned schema declaring managed skills but no verified project profile selection
- **WHEN** a caller creates a change and explicitly selects an installed, valid profile or native skill host and bundle
- **THEN** the selected association is persisted for that pin and doctor checks only its actual required targets, without assigning other installed profiles or hosts to the change.

#### Scenario: Unknown legacy association remains guarded
- **GIVEN** an active pinned change without a provable per-change profile association
- **WHEN** doctor runs or a caller previews disabling an installed skill
- **THEN** doctor reports the unknown association with an actionable reconciliation path and skill removal is refused; a reviewed reconciliation clears this diagnostic only after validating exact revision, profile/host, bundle, and target evidence.

#### Scenario: Schema without declared managed skills
- **GIVEN** an active pinned schema revision with no declared managed skill bundle
- **WHEN** doctor evaluates skill retention
- **THEN** it does not report an unknown profile association solely because the change has a schema pin, while unrelated readiness failures remain visible.

### Requirement: Five-host schema-declared resource compatibility
For a schema with managed skills or declared MCP servers, Opsx SHALL expose OpenCode, OMP, Pi, Atomic, and Senpi as distinct first-class host targets. It SHALL resolve each host's skill destination and server integration independently and show verified, unavailable, conflicting, or prerequisite-needed states without treating a named agent profile as a substitute. Skill installation SHALL preserve ownership, shared physical target deduplication, active-pin retention, exact preview and recovery behavior. Schema switching MUST NOT approve or install MCP implicitly; each declared server/host installation MUST separately show the exact URL, read-only/auth metadata, host transport and config/diff, demand immediate interactive human provider-safety approval, and fa…

#### Scenario: Five native hosts retain schema skills
- **GIVEN** a schema declaring a managed skill and a project with verified native destinations for OpenCode, OMP, Pi, Atomic, and Senpi
- **WHEN** a person selects all five, reviews their effects and applies a guarded switch
- **THEN** each host can discover the schema skill in its own verified target, physical shared targets are written only once, and a newly pinned change can retain those exact host/skill associations independently of optional named profiles.

#### Scenario: Declared MCP servers across five hosts
- **GIVEN** a schema declaring two safe HTTP MCP servers and installed host-specific MCP support for OpenCode, OMP, Pi, Atomic, and Senpi
- **WHEN** a person inspects each host and separately reviews and approves each server installation
- **THEN** all ten server/host entries are installed only in their respective verified project configuration or supported integration, without duplicate entries, and per-host reads show configured state without claiming network connectivity.

#### Scenario: Pi adapter or another host prerequisite missing
- **GIVEN** a selected host lacks the verified transport, config scope, or required adapter for a declared MCP server
- **WHEN** a caller previews or attempts provider installation
- **THEN** the exact host and missing prerequisite are reported, the provider is not marked installed, no unrelated host config changes, and interactive approval is not inferred from an earlier schema or skill confirmation.

[Some lines truncated to 768 chars]

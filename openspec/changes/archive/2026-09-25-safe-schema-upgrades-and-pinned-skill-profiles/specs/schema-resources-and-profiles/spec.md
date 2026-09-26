## ADDED Requirements

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
For a schema with managed skills or declared MCP servers, Opsx SHALL expose OpenCode, OMP, Pi, Atomic, and Senpi as distinct first-class host targets. It SHALL resolve each host's skill destination and server integration independently and show verified, unavailable, conflicting, or prerequisite-needed states without treating a named agent profile as a substitute. Skill installation SHALL preserve ownership, shared physical target deduplication, active-pin retention, exact preview and recovery behavior. Schema switching MUST NOT approve or install MCP implicitly; each declared server/host installation MUST separately show the exact URL, read-only/auth metadata, host transport and config/diff, demand immediate interactive human provider-safety approval, and fail closed on unsupported or missing host prerequisites. A guided-only instruction is not an installed MCP server.

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

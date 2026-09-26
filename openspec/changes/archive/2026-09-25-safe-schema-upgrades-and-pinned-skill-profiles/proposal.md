## Why

The isolated CLI smoke exposed two related failures in the schema/resource lifecycle. Reinstalling a newer bundled schema at an already installed destination is treated as a collision, so there is no guarded upgrade path. A newly CLI-created, schema-pinned change can have managed skills installed for selected hosts yet still fail doctor with `RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN`; unsafe skill disable is correctly blocked, but the selected association was not made provable. The user also requires OpenCode, OMP, Pi, Atomic, and Senpi to be first-class across schema compatibility, skills, and MCP. Today those are three different, incomplete host matrices. A successful schema install cannot imply that all five hosts can discover its workflows, skills, or declared servers.

## Scope

- Provide an explicit, previewable path to install a newer bundled schema revision under a distinct schema identity when its original name is already installed: identical content remains a no-op; a changed same-name bundle never replaces old pinned behavior. Refuse target collisions, invalid revision identities, or stale previews without mutation. A separate guarded switch can select the new installation as the project default.
- Ensure new pinned changes retain a verifiable association to explicitly selected named agent profiles, native skill hosts, and skill bundles. Provide a guarded reconciliation path for an existing pin with unknown association, rather than guessing from current project defaults or on-disk skills.
- Support OpenCode, OMP, Pi, Atomic, and Senpi as first-class host targets for compatible schema workflow adapters, native managed-skill installation/discovery, and schema-declared MCP servers. Surface host-specific readiness, actual destination/config and ownership, and the capability gap whenever a supported installation cannot be completed; do not treat a named profile or a different host as proof of support.
- Preserve immediate interactive human provider-safety approval and exact per-host MCP config previews when installing schema-declared servers. Host-specific transports must be verified before enabling them; a guided-only message cannot count as installed.
- Make CLI read/preview/doctor results distinguish approved upgrades, unexpected drift, missing association, and a genuinely incomplete change.

## Exclusions

- No automatic migration of existing change artifact bodies or silent reassignment of historical pins to new content.
- No automatic skill deletion, relaxation of active/shared resource retention, or bypass of validation for intentionally incomplete changes.
- No MCP installation in this planning pass, no connectivity claim from configuration alone, no provider safety policy change, and no dashboard or terminal-harness redesign.
- No promotion of Gemini, Codex, or Claude to first-class hosts; their existing optional named-profile entries remain separate.

## What Changes

A person can inspect a bundled schema update, install its revised content as a new named revision, then explicitly choose whether to switch the project default. A same-name collision is never an implicit overwrite. Existing pinned and archived changes keep their effective old schema. For each of the five hosts, an inspected schema reports workflow-adapter compatibility, declared skill targets, and declared MCP server capability independently; an install/preview names actual project-scoped paths and refuses unverified support. A change created through the CLI records the selected profile/skill association needed for later doctor and disable checks; if an older association is unknown, a reviewed repair records evidence before the blocker clears. Human-approved MCP installation is a separate operation; doctor continues to report unrelated planning-artifact failures.

## Capabilities

### New Capabilities

- None; the change extends existing revision, resource, and CLI contracts.

### Modified Capabilities

- `schema-revisions-and-migration`: Expose a safe distinct-revision install path while keeping old schema identities and pinned effective revisions intact.
- `schema-resources-and-profiles`: Track verified per-pin named-profile/native-host skill associations, add native skill destinations for all five hosts, and retain active or shared resources during upgrades and explicit disable.
- `skill-host-installation-visibility`: Show exact first-class host skill destinations, readiness and shared physical targets rather than treating profile selections as native host installs.
- `project-and-agent-cli`: Offer guarded upgrade and pin-association creation/reconciliation; expose five-host workflow-adapter and schema-declared MCP capability/install previews with exact paths, freshness checks, and actionable diagnostics.

## Selected Direction

Proposed for review in `journey.md`: a changed bundle gets a distinct validated schema identity; the old named schema remains installed for existing pins, and changing the default remains a separate explicit action. Five first-class host adapters share one host-agnostic schema authority, but each skill, workflow, and MCP surface proves its own native destination. Persist an exact host/profile selection with each new pin and require reviewed evidence to reconcile unknown legacy associations. Preserve interactive provider approval and fail closed for unverified host transports. This direction is not approval to implement.

## Impact

Affected surfaces include bundled schema installation and revision provenance, CLI change creation and schema/resource/adapter commands, per-host skill targets and visibility, schema-declared MCP config previews and human-approved installs, diagnostic and skill-disable decisions, plus stored receipts for upgraded schemas and associated pins. Existing unmodified installs and pins remain valid. The separate completed `opentui-agent-skills` change is not a dependency; this planning pass does not mutate MCP provider configuration.

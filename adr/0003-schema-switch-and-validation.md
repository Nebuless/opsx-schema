# ADR 0003: Recoverable schema Apply and artifact/workflow validation

Status: Proposed  
Date: 2026-09-23

## Context

Selecting a schema is not a single YAML edit: the destination revision, its skills, checked agent-profile targets, legacy changes and selected change migrations must be consistent before the project default moves. Installed skills can be shared by host and must not be removed on later switches. MCP catalogs add separate host configuration and provider-safety risk. A highlighted skill is not a mechanism that prevents an external agent from editing arbitrary files.

## Decision

Settings stages a destination revision, named agent-profile checkboxes, and optional selected active changes to migrate; **Apply** appears only for a pending change. The preview names schema files, skill manifests, real host paths/shared targets, config/pin/provenance changes, compatibility findings and collisions. Agent-profile checkboxes are not the schema's default/recommended/all skill-bundle selector. Detect physical host sharing and never promise per-agent isolation where files are shared.

On Apply, acquire a project-scoped Opsx lock, recheck freshness and preflight all selected migrations; refuse an incompatible selected change before mutation. Use an idempotent, recoverable prepare/apply protocol across schema files, skills, legacy pins, selected pins, provenance and `openspec/config.yaml`. Compare expected file bytes/identities before each guarded replacement and recheck authoritative state immediately before activating the default, since external editors do not honor the lock. Install schema and required profile skills before activating the default. Journal owned writes and recover or report exact partial state after conflicts/errors/interruption; never report success if the default points to an unprepared revision. A rollback may remove only files created and still owned by this operation. A normal switch **never removes previously installed skills**; an explicit CLI disable is a separate guarded action limited to unshared, owned resources not needed by active pinned changes. Active badges derive from the project default for new changes or the selected change pin for existing work.

MCP installation is a separate Settings operation against a declared catalog and supported host. Show URL, permissions/read-only/auth metadata, selected config file and diff. The CLI may inspect/preview in non-TTY mode, but host installation requires a usable TTY and immediate interactive human provider-safety confirmation; an unattended CLI flag cannot bypass it and instead directs the caller to Settings. Refuse unknown providers, conflicts and unsupported hosts without changing config.

The validation gate checks the resolved revision's structure, relevant artifacts, workflow readiness and strict OpenSpec validity for the selected change. Run it before Opsx lifecycle mutations and make the same read-only check available to hooks/CI for external edits. The gate does **not** claim to prevent an arbitrary editor or agent from using an installed but inactive skill. A missing, shadowed or modified pinned revision is a finding, not a silent reinterpretation.

## Consequences

- The composite switch needs staged writes, a recoverable journal, ownership tracking and tests for interruption at every write boundary. Checkboxes are persisted as target choices only with an explicit and inspectable mapping to host paths.
- Existing work can legitimately need skills from an old pinned schema after the project default switches. Installed and active sets must be displayed separately by context.
- CLI callers can preview and request a mutation, but MCP provider approval remains a human checkpoint. No modal, URL, or catalog text constitutes that approval by itself.
- Validation detects noncompliant artifacts/workflows; host-level skill-use sandboxing is deliberately outside this contract.

## Alternatives considered

- Change `openspec/config.yaml` first and install later: risks a default that cannot be used by the selected profiles.
- Remove old skills automatically: can break ongoing changes and delete shared resources.
- Migrate all active changes implicitly: conflicts with per-change pins and can force incompatible artifact rewrites.
- Treat active-skill highlighting as an enforcement gate: confuses presentation with a host-specific security mechanism.

## Related plan

[Opsx Schema application plan](../plans/plan.md), especially U3, U4 and U5.

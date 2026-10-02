# ADR Review Manifest

- Status: completed
- Review date: 2026-09-30

## Review Summary

Reviewed every repository-level ADR against this change's design and the current root contracts. This refinement keeps OpenSpec as lifecycle authority, uses existing domain reads and installed OpenTUI renderers, and preserves the four-tab dashboard with Settings as its only write surface. Document rendering remains a passive presentation of the existing sanitized, bounded preview. No persistence, dependency, provider, release or schema-lifecycle contract changes are proposed.

The selected native-reader route and its safety, keyboard and progress constraints are already recorded in design.md and journey.md. Renderer coverage and offline behavior require implementation proof before integration. A failed trial that requires a new dependency or changes the approved document contract must return to the user rather than silently changing this decision.

## In-Force ADRs Reviewed

None. Every repository-level ADR currently has Status: Proposed. This review does not promote or edit those records. The root instructions, durable specifications and implemented contracts remain authoritative.

### Proposed ADRs Reviewed for Compatibility

- adr/0001-cli-runtime-and-authority.md: preserve shared reads, OpenSpec authority, four tabs, passive task counts and the read-only Changes/Archive boundary.
- adr/0002-schema-revisions-and-provenance.md: display existing identity and provenance without new pins, receipts or inferred historical origins.
- adr/0003-schema-switch-and-validation.md: no change to Settings previews, recovery, validation or separate human MCP approval.
- adr/0004-portable-opentui-skills.md: reuse installed native rendering; third-party catalogs are references, not dependency or skill installation authorization.
- adr/0006-guarded-manual-npm-release.md: no release behavior changes or publication authority.
- adr/0007-reviewed-unmanaged-skill-replacement.md: no skill replacement, ownership or project-lock changes.

## New Durable ADRs Created

None. No major durable architectural decisions were introduced. This change refines presentation inside existing boundaries and needs no superseding ADR. No repository-level ADR was modified.

# ADR Review Manifest

- Status: completed
- Review date: 2026-09-25

## Review Summary

Reviewed all four repository-level ADRs against the five-host revision. The schema remains one OpenSpec-authoritative, host-independent revision (ADR 0001); named pins and their effective content remain immutable and inspectable (ADR 0002); per-target exact previews, recoverable skill installation, and a separate immediate human provider-safety approval remain mandatory (ADR 0003); portable OpenTUI skills remain outside this change (ADR 0004). The five-host adapter/skill/MCP target matrix and the Pi adapter prerequisite are change-local implementation contracts in `design.md`, not new architecture authority. No accepted ADR is modified or superseded.

## In-Force ADRs Reviewed

- `adr/0001-cli-runtime-and-authority.md` — OpenSpec lifecycle authority and independent provider approval.
- `adr/0002-schema-revisions-and-provenance.md` — distinct immutable schema identities and per-change provenance.
- `adr/0003-schema-switch-and-validation.md` — guarded schema/skill switch, active-resource retention, recoverability and interactive MCP approval.
- `adr/0004-portable-opentui-skills.md` — separate portable UI skill collection; no dependency or change here.

## New Durable ADRs Created

- None — the revision specializes existing schema authority, provenance, resource safety, and host targeting decisions without replacing their architectural boundaries.

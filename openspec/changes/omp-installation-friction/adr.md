# ADR Review Manifest

- Status: completed
- Review date: 2026-09-29

## Review Summary

Reviewed in-force repository decisions. ADR 0001 keeps OpenSpec lifecycle authority and separate provider approval; ADR 0002 keeps immutable schema history and unknown legacy creation history truthful; ADR 0003 already requires project-locked, recoverable schema/skill mutation but does not define preserving unowned collision data or serializing every pin writer with an explicit replacement. ADR 0004 concerns portable UI skills, not this installer. ADR 0006 concerns npm release, which remains out of scope. New ADR 0007 adds the durable single-target recovery and shared-lock boundary without changing those decisions.

## In-Force ADRs Reviewed

- `adr/0001-cli-runtime-and-authority.md` — OpenSpec authority, CLI/TUI separation, no hidden mutations.
- `adr/0002-schema-revisions-and-provenance.md` — immutable pins and honest historical unknowns.
- `adr/0003-schema-switch-and-validation.md` — project lock, recoverability, ownership and active resource retention.
- `adr/0004-portable-opentui-skills.md` — portable UI skill content unchanged.
- `adr/0006-guarded-manual-npm-release.md` — publishing outside this change.

## New Durable ADRs Created

- `adr/0007-reviewed-unmanaged-skill-replacement.md` — one reviewed unmanaged target with verified retained backup, durable receipt, guarded restoration, and shared project-first locking for pin writers.

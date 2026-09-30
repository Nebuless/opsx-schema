# ADR Review Manifest

- Status: completed
- Review date: 2026-09-29

## Review Summary

Reviewed every repository-level ADR currently present. All five records remain `Proposed`; this manifest records compatibility review, not acceptance or a change to their status.

Internal module extraction preserves Bun/ESM runtime, OpenSpec lifecycle authority, executable path, CLI/TUI contracts, immutable revisions and truthful provenance, guarded schema switching, separate interactive MCP approval, resource ownership, and release authorization. No accepted architecture decision is replaced.

## In-Force ADRs Reviewed

- `adr/0001-cli-runtime-and-authority.md` — preserve standalone CLI, shared domain operations, OpenSpec authority, dashboard write boundary, and real CLI/TTY proof.
- `adr/0002-schema-revisions-and-provenance.md` — preserve change identity/pins, retained immutable revision content, unknown historical origin, and migration without artifact-body rewrites.
- `adr/0003-schema-switch-and-validation.md` — preserve switch locking, freshness/CAS, owned-write recovery, prior skills, validation order, and separate immediate human MCP approval.
- `adr/0004-portable-opentui-skills.md` — skill content, portable collection, and evaluation policy remain outside this extraction.
- `adr/0006-guarded-manual-npm-release.md` — release workflow remains unchanged; planning does not authorize commit, push, publication, or tag.

## New Durable ADRs Created

- None — extraction changes internal responsibility boundaries, not runtime, lifecycle authority, persistence, trust, or release architecture. Module decisions and dependency direction are recorded in `design.md`.

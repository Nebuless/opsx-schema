# ADR Review Manifest

- Status: completed
- Review date: 2026-09-28

## Review Summary

The manual release gate and post-publication failure behavior establish a durable operations and credential boundary. They are recorded in a proposed repository ADR; no accepted repository ADR was edited.

## In-Force ADRs Reviewed

- `adr/0001-cli-runtime-and-authority.md`: preserve the standalone package and OpenSpec lifecycle boundary.
- `adr/0002-schema-revisions-and-provenance.md`: no schema provenance changes.
- `adr/0003-schema-switch-and-validation.md`: no MCP or switch authorization changes.
- `adr/0004-portable-opentui-skills.md`: no portable skill changes.

## New Durable ADRs Created

- `adr/0006-guarded-manual-npm-release.md`: proposed dry-run-first release, trusted publication, and fail-closed provenance gate.

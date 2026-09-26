# ADR 0001: Standalone Bun CLI with OpenSpec lifecycle authority

Status: Proposed  
Date: 2026-09-23

## Context

`../openspec-schemas` ships a Node/CommonJS schema package, installer, resource commands, and an optional imperative read-only viewer. This project starts without an application. The requested product is a new `opsx-schema` CLI and React OpenTUI application, not an extension of the sibling's binary or a second implementation of OpenSpec's lifecycle rules. Humans need a compact dashboard; agents need noninteractive commands with useful defaults.

## Decision

Build a standalone Bun ESM TypeScript/TSX application in this repository. Bare `opsx-schema` on a usable TTY opens a single-project React OpenTUI dashboard. CLI commands provide the full agent-facing read and lifecycle-management surface; non-TTY use does not start a renderer or request hidden input. Port all sibling capabilities by behavior and resource content, not old command names or flags.

OpenSpec CLI remains authority for schema resolution, artifact graph/instructions, change state, validation, and archive. Opsx owns catalog packaging, its snapshot/projections, resource targeting, provenance, guarded orchestration and UI. An Opsx preview is not a substitute for OpenSpec validation. Versioned JSON and compact text project the same state; errors use nonzero exits and actionable diagnostics. Exact command names and supported OpenSpec/Bun/OpenTUI versions are frozen by the OpenSpec specs and compatibility evidence, not assumed from this ADR.

The TUI has Overview, Changes, Archive and Settings. Changes and Archive are browsers, not editors or lifecycle mutation surfaces. Settings is the only TUI write surface: composite schema switch and separate human-approved MCP installation. The CLI exposes MCP inspection and preview noninteractively, but host installation requires a usable TTY and immediate interactive human provider-safety confirmation; unattended agent flags cannot approve it. Artifact bodies belong to an external editor or agent. Task progress comes from explicit OpenSpec apply-task checkbox status; missing or malformed status is Unknown.

## Consequences

- One domain model serves CLI and TUI, preventing two answers to 'which schema governs this change?'. Archive records need their own read-only discovery path; active-change status does not apply to an archive path.
- OpenSpec CLI compatibility and output/error handling are an explicit release gate. The installed OpenSpec version and sibling dependency range differ today, so the supported range must be tested before implementation.
- No compatibility aliases for the old `opsx-schema` syntax. Publish a behavioral migration map instead.
- Schema switching never removes previously installed skills. An explicit CLI disable operation has its own guarded preview and may remove only unshared, owned resources that no active pinned change needs.
- A real TTY renderer, keyboard/focus behavior, JSON/non-TTY output, and source-capability parity require independent proof.

## Alternatives considered

- Extend the sibling Node package and imperative viewer: reuses more code but contradicts the requested new Bun/React product and its different write boundary.
- Reimplement OpenSpec lifecycle in Opsx: avoids subprocess dependence but creates competing readiness, archive and validation semantics.
- Preserve every old command alias: eases scripts but makes the new simple agent contract carry legacy constraints; the user selected a new command contract.

## Related plan

[Opsx Schema application plan](../plans/plan.md), especially U1, U3, U5 and U6.

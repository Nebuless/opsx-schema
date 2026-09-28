## Context

The OpenSpec client `src/openspec/client.ts` currently compares `--version` to exactly `1.12.0`. The installed CLI reports 1.13.2. `src/switch/index.ts` and `src/validation/index.ts` launch `ensureSupported()` without awaiting it. The schema installation command can reach its write path without an explicit version preflight.

## Goals / Non-Goals

**Goals:** Accept stable compatible 1.x versions at or above 1.12.0; reject old or unknown contract versions before schema mutation; return actionable CLI errors; verify in tests and against the installed CLI.

**Non-Goals:** Install OpenSpec or schemas in the user's project; promise future 2.x support; change OpenSpec's JSON contract.

## Selected Direction

Parse the CLI version strictly as stable `major.minor.patch`. Accept major 1 and minor 12+ (with patch >= 0), reject prerelease and other majors. Recommend OpenSpec upgrade for older releases with official repository URL; recommend updating opsx-schema for unsupported newer major versions. Await the existing preflights and put a version check before schema installation writes, not in the standalone bundled catalog.

## Implementation Guardrails

Keep the `OPENSPEC_UNSUPPORTED` error code and structured envelope. No schema writes before a successful preflight. Do not update OpenSpec or install a schema as part of this repair. Tests cover lower bound, newer minor, unsupported major, malformed version, and reject-before-write behavior.

## Alternatives Considered

Pinning 1.13.2 repeats the exact-version break on the next release. Accepting arbitrary major versions risks unsafe mutations across changed contracts.

## Risks / Trade-offs

A later 1.x might change CLI JSON unexpectedly. Existing command-level response validation and switch diagnostics remain in effect; future major changes are blocked until reviewed.

## Migration Plan

No data migration. Update documentation's previously exact-version requirement. Run read-only CLI and switch preview on installed 1.13.2, plus targeted fake-version regression tests.

## Open Questions

None.

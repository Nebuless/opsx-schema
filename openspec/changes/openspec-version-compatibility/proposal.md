## Why

`opsx-schema` rejects OpenSpec 1.13.2 even though 1.12.0-compatible command paths are available, and some preflights launch unawaited version checks. Users cannot preview schema switches, and older versions do not receive actionable upgrade guidance.

## Scope

Make the client work with supported later OpenSpec 1.x releases without pinning every minor version. Reject older versions with a link to official OpenSpec installation instructions before schema installation or switch writes. Keep errors structured and free of unhandled rejection stacks.

## Exclusions

No automatic CLI update, no schema installation in the user's project, no assertion of OpenSpec 2.x or prerelease support.

## What Changes

- A current 1.x CLI can preview a schema switch.
- An older CLI gets an upgrade recommendation and official OpenSpec URL before schema writes.
- Unsupported or malformed versions fail closed.

## Capabilities

### New Capabilities

- `openspec-version-compatibility`: version policy and safe preflight for project schema operations.

## Selected Direction

Keep the existing 1.12.0 minimum and support stable 1.x updates; fail closed for unknown major-version contracts.

## Impact

`src/openspec/client.ts`, schema switch and installation entry points, validation preflight, CLI compatibility tests, README and command guide. No project data migration.

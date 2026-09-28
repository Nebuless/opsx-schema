# Design Journey

## Scope and Exclusions

- Scope: Permit OpenSpec CLI 1.x from 1.12.0 onward; reject older and unsupported major/prerelease versions before schema mutations, with actionable upstream install guidance. Ensure async preflight failures are awaited and delivered through CLI errors.
- Exclusions: Do not auto-upgrade OpenSpec, install a schema in the user's project, or assume support for a future breaking major release.

## Material Decisions

- Keep the supported major bounded to 1.x. Patch/minor releases must not require an exact-version code change; an unrecognized major or prerelease fails closed. This preserves the existing minimum JSON contract rather than claiming an unknown major is compatible.
- Preserve the existing JSON response-shape checks; verify actual OpenSpec 1.13.2 read-only and switch-preview paths before shipping.

## Grilling Receipt

- Status: not_applicable
- Method: unavailable fallback
- Result: User supplied a concrete failure (`OpenSpec 1.13.2 is not verified`) and a required outcome; no competing product design is needed.

## Route Selection

- Branch ID: openspec-version-compatibility
- Selected route: Relax exact patch/minor pin within supported major, await preflight, and guard schema installation before writes.
- Alternatives: Exact-version allowlist requires releases for each compatible CLI update; accepting all future majors risks breaking JSON or write contracts.

## Approval and Handoff

- User instruction: make compatibility durable for newer OpenSpec and guide older users to upgrade; do not install a schema until this is fixed.
- Scope stays within that instruction; no repository schema installation will be performed.

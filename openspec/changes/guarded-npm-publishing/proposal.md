## Why

The package now has protected CI, Conventional Commit checks, and a root changelog, but it has no merged npm release path. The release workflow on the old branch would reject valid CI reruns and accept a changelog heading with no notes.

## Scope

Add a manually dispatched, dry-run-first npm publishing path for `opsx-schema` that checks the protected source commit, required checks, package metadata, substantive release notes, packed files, version/tag uniqueness, and trusted publishing before publication. Verify the published package and provenance before tagging.

## Exclusions

- Publishing a package or creating a tag during this planning change.
- Automatically releasing from commits, changing the five existing CI checks or branch-protection policy, and editing the legacy schema collection changelog.
- Creating a GitHub Release or changing the package's runtime behavior.

## What Changes

- Operators can run a non-publishing release preflight with an exact version and tag; a real publication requires explicit opt-in and configured GitHub/npm release permissions.
- CI reruns do not create false release failures, but a failed or incomplete authoritative required check blocks release.
- A version heading without actual notes cannot pass preflight.
- A successful publication creates a tag only after provenance verification; a failure after publication stops for investigation without retry or tag.

## Capabilities

### New Capabilities

- `npm-release`: Defines manual preflight, publish, verify, and tag behavior for this package.

### Modified Capabilities

- None. The CI check names and protected `main` contract are inputs, not modified behavior.

## Selected Direction

Adapt the reviewed manual trusted-publisher workflow from the unmerged branch, correcting both preflight defects and retaining fail-closed post-publication handling. Roll it out in dry-run mode and require administrator configuration before a first real publish.

## Impact

Adds a GitHub Actions release workflow, focused release guard and tests, and operating documentation. A protected GitHub release environment and npm trusted-publisher configuration are external setup prerequisites; the change does not grant ordinary CI release credentials.

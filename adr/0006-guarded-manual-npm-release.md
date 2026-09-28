# ADR 0006: Guarded manual npm release

Status: Proposed
Date: 2026-09-28

## Context

The repository has a public `opsx-schema` package, Conventional Commit validation, a package changelog, five protected CI checks, and no deployed release workflow. The previously drafted manual workflow has two known preflight defects: duplicate CI attempts cause false failures, and an empty changelog entry passes. Publication on npm is not safely reversible.

## Decision

Release only on manual request against the current protected `main` commit. Default to a read-only dry run. Before an explicitly authorized publication, require the latest authoritative successful attempt for each existing required CI check, matching package version and unused tag, substantive dated root release notes, verified packed files and distribution smoke, and trusted publisher readiness. Confine npm provenance and tag permissions to a protected GitHub release environment. Publish once, verify the registered package and generated provenance, then tag the exact commit. If post-publication verification fails, stop without automatic retry or tag and report the published version for investigation.

## Consequences

- Operators must review version and notes in a normal PR before release and configure GitHub and npm trust outside this repository.
- The preflight guard needs focused check-run ordering and changelog-content tests, plus a real dry-run exercise before publication is enabled.
- A successful npm publish can remain untagged if provenance verification fails. An operator must investigate that state rather than treating a rerun as safe.

## Alternatives considered

- Merge the prior workflow without changes: rejected because of its duplicate-run and heading-only defects.
- Auto-publish based on Conventional Commits: rejected because commit history alone does not authorize a release or prove release-note completeness.
- Create a tag before publication: rejected because a tag would claim a verified version before registry provenance exists.

## Revisit when

Reopen if the release authorization model changes or verified npm registry tooling can safely make publication and provenance verification an atomic step. Do not weaken the manual gate based on a dry run alone.

## Related change

[Guarded npm publishing](../openspec/changes/guarded-npm-publishing/).

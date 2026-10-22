## Context

Local verified commits use an older repository layout. Remote main has a modular
CLI plus newer provenance, replacement, and recovery contracts. The publication
branch must port behavior rather than transplant whole source files.

## Goals / Non-Goals

Install required Impeccable reproducibly, expose distinct OmO targets, and route
Pi from inspected mode. No automatic hooks, new dependency, live MCP setup,
adapter migration, provenance rewrite, or remote merge.

## Selected Direction

Extend existing resource manifests with an optional immutable revision field and
a required-skill declaration. Merge required entries into existing bundle
resolution. Reuse guarded resource previews for schema installation and install
required targets before switching the default. Keep CLI changes in the existing
focused command handlers. Separate native OmO and Senpi host contracts.

## Implementation Guardrails

Preserve exact preview freshness, canonical path checks, ownership/collision
refusal, project/resource lock order, portable origin witnesses, and recovery
evidence. Pi inspection combines enabled project/global package registrations
rather than treating an empty or disabled project package list as a global
override. Untrusted project inputs do not affect a verified global adapter.
Native evidence requires an effective explicit `builtin:mcp` selector, not
persisted changelog state. Selector exclusions follow Pi's resolver precedence.
Unknown native mode, active custom-extension ambiguity, and changed host evidence fail closed. MCP Apply
retains immediate human approval of provider, host, target, and diff.

## Alternatives Considered

Optional Impeccable contradicts the user's decision. Replacing remote modules
with local files would lose newer behavior. Automatically installing a legacy Pi
adapter would change host mode without authorization. All are rejected.

## Risks / Trade-offs

Required skills introduce source acquisition into default schema installation.
Immutable commits make acquisition reproducible, not offline. Conflicts remain
explicit failures rather than adoption of unmanaged files. Local mode evidence
does not prove a live MCP connection.

## Migration Plan

No implicit migration. Existing referenced schema revisions remain protected.
Users install a distinct named revision when replacement would collide with a
pin. Revert the publication commit for code reversal, without deleting users'
subsequently installed resources.

## Open Questions

None. Current user instructions authorize publication and review, not merging.

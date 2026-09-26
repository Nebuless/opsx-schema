# ADR 0002: Named immutable schema revisions and per-change provenance

Status: Proposed  
Date: 2026-09-23

## Context

OpenSpec records a change's current schema name in `.openspec.yaml`, while the project default in `openspec/config.yaml` applies to new changes and may be inherited by older unpinned work. Schema resolution can prefer a project-local definition over a user/package definition of the same name. A name alone therefore neither identifies immutable behavior nor explains how a migrated change was originally implemented. The user wants different schemas for different changes, deliberate selected-change migration, and historical visibility without inventing a new change ID.

## Decision

Graph-, instruction-, template-, or companion-resource-changing customizations get a **new named schema revision**. Treat a revision's resolved source and digest of behavior-bearing files as provenance and drift evidence; retain resolvable revisions while active or archived changes reference them. Do not silently overwrite a referenced revision under the same name. A same-name shadow or edit that changes the digest blocks mutation until the collision is resolved or a new revision is named.

OpenSpec's change name remains the change identity, and its `.openspec.yaml` remains the current pin. Store an Opsx-owned, versioned provenance record inside each change directory, so archiving carries it: known original revision/source/digest (or `unknown` for older changes) and append-only receipts for explicitly selected migrations. Do not duplicate current schema state as a second authority; compare the receipt trail with the live OpenSpec pin and report divergence. Never infer an old creation schema from today's default.

On switching the project default, enumerate unpinned active changes before mutation and preserve their old effective revision explicitly, or refuse if that is not safely resolvable. Checked active changes may move their pin only after destination compatibility and actual artifacts pass the chosen workflow gate. The handoff itself does not rewrite artifact bodies; an external editor or agent must reconcile incompatible content. Unchecked changes and archived changes remain under their prior revision.

## Consequences

- Change details can display Created under, Current schema and migration history without a separate UUID. A change with unknown legacy origin says so.
- Revision files and provenance must survive archive and deletion/collision attempts. A digest without retained content is insufficient for historical validation.
- A template-only revision can be significant even when two artifact graphs are identical; graph equality is not migration proof.
- Legacy unpinned changes require a preservation step in the same recoverable switch operation. Detect out-of-band edits to OpenSpec metadata instead of repairing history silently.

## Alternatives considered

- Live in-place override under one schema name: fewer catalog entries but silently changes old work and defeats selective migration.
- A new UUID for every change: duplicates the existing change identity while failing to pin schema content.
- Store provenance only in a central project ledger: archive/move operations could detach the record from its change.
- Automatically convert artifacts during handoff: conflicts with the read-only file viewer and cannot safely infer transformations between arbitrary custom schemas.

## Related plan

[Opsx Schema application plan](../plans/plan.md), especially U2 and U4.

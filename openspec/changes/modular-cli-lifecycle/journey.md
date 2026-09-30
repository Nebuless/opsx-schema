# Design Journey

## Scope and Exclusions

- Scope: behavior-preserving modularization of CLI command handling and change creation, archive, and schema-handoff orchestration. Preserve every command, schema, skill, MCP provider, adapter, dashboard flow, output contract, and existing mutation guard.
- Exclusions: new features, command renames, parser redesign, command frameworks, new dependencies, new retry or locking semantics, changes to bundled resources, release work, and implementation before approval.

## Material Decisions

- Discovery found `src/domain/cli.ts` combines parsing, routing, rendering, and seven command families. Keep its existing executable path because package metadata, command tests, and release packaging depend on it.
- Discovery found `src/cli/index.ts` combines creation, reads, archive, and schema handoff. `src/switch/index.ts` imports handoff preview while creation imports switch selection reads; extraction must remove this circular dependency without changing behavior.
- Approved direction: keep the executable at `src/domain/cli.ts`; extract command-family handlers and shared transport helpers. Separate lifecycle creation, reads, archive, handoff, and shared guards under `src/cli/`. Replace the old lifecycle barrel at cutover and migrate every caller. Migration sequence remains part of the detailed plan. No production edits or execution-time verification have occurred in this planning change.

## Grilling Receipt

- Status: skill_invocation_unavailable
- Method: evidence-based fallback discussion; no `grill-me` or `grill-with-docs` skill is available in the current skill list.
- Result: user requested simpler explanation before approving scope. Discussion separated maintainability issues from demonstrated bugs; scope approval permits planning only, preserves all existing features, and does not authorize implementation.

## Route Selection

- Branch ID: modular-cli-lifecycle-direct-extraction
- Selected route: direct extraction into ordinary TypeScript modules, preserving existing algorithms and public CLI behavior.
- Alternatives: leave existing structure unchanged; redesigning command parsing or introducing a framework is outside approved scope.

## Approval Receipts

- Discovery: 2026-09-29, user selected `Yes, continue planning` in response to `Should the plan cover reorganizing code while keeping every existing feature and command unchanged?`. This follows the earlier `Revise scope first` selection and requested explanation. Approval covers the clarified scope, not implementation.
- Route selection: 2026-09-29, user selected `Use direct extraction` in response to `Use direct extraction—move existing code into smaller files without redesigning it?`. Keep current parser, commands, and safety logic; plan smaller files with clear responsibilities.
- Direction selection: 2026-09-29, user selected `Approve boundaries` in response to `Approve these two groups of module boundaries for the detailed plan?`. Approved command-family modules and separate lifecycle workflows, with unchanged executable path and direct schema-switch handoff dependency.
- Accepted loopback: none.
- Pre-task handoff: 2026-09-29, user selected `Approve checklist` in response to `Plan ready at /home/eag1/repo/opsx-schema-public/openspec/changes/modular-cli-lifecycle/design.md. Approve this plan before creating its implementation checklist?`. Approval permits recording this receipt and creating `tasks.md` from the reviewed plan; production implementation remains unauthorized.
- Implementation: 2026-09-29, user invoked OpenSpec apply after checklist delivery. Authorization covers all 16 implementation tasks and their disposable-project verification; it does not authorize commit, push, release, archive, or live MCP installation.
- Delivery: 2026-09-30, user authorized all commits and pushing the PR for issue #5 after the combined worktree was reviewed. The behavior-preserving extraction is included as a prerequisite to the issue fix, separately tracked and verified in `tasks.md`. This approval does not authorize npm release, merge, archive, or live MCP installation. Earlier entries record their point-in-time limits.

## MCP Receipt

- Approval: not applicable; planning does not configure MCP.
- Host and evidence: existing MCP behavior remains in scope for compatibility verification only.
- Config target: none.
- Catalog and result: no provider installation or catalog modification proposed.
- Validation and fallback: no MCP setup invoked.

## Loopback History

None. User clarification happened before any accepted route or downstream planning artifact.

## Sibling Changes

None. `guarded-npm-publishing`, `openspec-version-compatibility`, and `readme-positioning` are unrelated existing changes; this plan does not alter them.

## Reconciliation Receipts

- `openspec list --json` confirmed the existing project root and absence of a matching modularization change.
- `openspec new change modular-cli-lifecycle` created this change using `intent-driven-design` as confirmed by status, despite the command's initial `spec-driven` progress text.
- `openspec status --change modular-cli-lifecycle --json` and `openspec instructions journey --change modular-cli-lifecycle --json` resolved this journey path and its approval gates. No downstream artifacts existed at discovery.
- 2026-09-29 independent read-only review completed for coherence, feasibility, dashboard parity, security, and adversarial assumptions. All five returned no findings, residual risks, or deferred questions; no review corrections were needed. Cross-model review did not run because the serving family could not be attested under that workflow's supported identities.
- `openspec validate modular-cli-lifecycle --type change --strict` passed before pre-task approval. Refreshed status and instructions resolve `tasks.md` as ready at the change-local path; the recorded approval satisfies its authoring gate. No loopback or sibling reconciliation is pending. No production edits, runtime tests, or implementation outcomes are claimed.
- After checklist creation, strict change validation passed and `openspec status --change modular-cli-lifecycle --json` reported all six planning artifacts complete. `openspec instructions apply --change modular-cli-lifecycle --json` recognized 16 unchecked tasks across the seven reviewed units and reported implementation state `ready`; this engine state does not replace explicit implementation authorization.

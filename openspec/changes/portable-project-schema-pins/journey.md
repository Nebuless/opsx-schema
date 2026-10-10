# Design Journey

## Scope and Exclusions

- Scope: Deliver the approved issue #10 fix on public `origin/main` baseline `0bb39fd185625545e097088f37955b26272e0ad4`, in branch `issue-10-portable-pins`. Git-tracked project-local schema pins may remain healthy after relocation only among linked worktrees with a verifiable, still-resolvable shared Git common directory. Provide explicit guarded same-name re-pin when historical origin cannot be proved.
- This record ports the reviewed original change at `e82d2d0` from `/home/eag1/repo/opsx-schema__worktrees/addy-issue-10` (original baseline `c13aab0`, current coordinator records `c17a3f7`). The histories are unrelated. Original implementation results and its 8/10 checklist are prior evidence, not completion of this public delivery.
- Exclusions: No project-default/config, schema-default, managed-resource digest, host configuration, dependency, version, tag, publication or release change. No product code, source worktree write, commit, staging, push, merge or PR is part of this artifact preparation.

## Material Decisions

- The original user-approved D4 direction scopes portable origin to verified linked Git worktrees. Equal bytes, path suffix, remote URL, commit ID or copied marker cannot replace shared common-directory proof. Independent clones and moved or unverifiable common directories require explicit re-pin.
- Legacy absolute receipts may cross worktree paths only while both original and current worktrees remain reachable and independently prove the same live common directory. Ambiguous receipts fail closed; reads do not backfill history.
- The original user-approved ADR 0005 at pre-receipt SHA-256 `110a3da218eaa32abb2741543f52938ead220dc9c4a94415fa947088a604eaaa` selects a versioned Git origin witness, independent integrity checks and guarded explicit re-pin. The later approved C2 amendment adds position-indexed association establishment and read-only legacy compatibility. These are prior decisions; this port introduces no new product direction.
- Public `openspec/config.yaml` selects `intent-driven-design`. Keep its six artifact gates and public modular CLI ownership. The original `intent-driven-design-addy` schema and `plan.md` gate do not transfer.

## Grilling Receipt

- Status: completed in the original discovery, as recorded by its journey. No new interview or approval is claimed for the public artifact adaptation.
- Result: original review narrowed portability to linked worktrees and settled fail-closed legacy handling. The current request authorizes adapting those approved records into the public worktree.

## Route Selection

- Branch ID: `issue-10-portable-pins`.
- Selected route: surgical backend/CLI port into existing public revision, provenance, shared project-lock, lifecycle and switch modules, with focused tests and independent review owned by the coordinator.
- Alternatives: no second design route. The original private schema, monolithic `src/cli/index.ts`, Backlog records and unrelated changes are not imported.

## Approval Receipts

- Discovery and direction: original D4-D6 approval on 2026-10-06; linked-worktree scope correction, revised proposal/specs/design, ADR 0005 and C2 association amendment approved on 2026-10-07 as recorded in the original journey, ADR and design. These dates refer to original decisions, not public-port approval.
- Route and pre-task handoff: the current user instruction explicitly approves an origin/main delivery worktree and surgical issue-only port with independent review. It specifically authorizes these OpenSpec delivery artifacts and the already completed destination `bun install --frozen-lockfile` and isolated Qlty 0.651.0 setup. Coordinator retains commit, integration and Backlog authority.
- Delivery: later PR, exact-head CI and independent Macroscope review are within the approved delivery route but remain unperformed. Release/version/tag/publication are not authorized.
- Accepted loopback: none in this public adaptation. A material departure from approved issue #10 behavior requires a new user decision.

## MCP Receipt

- Not applicable. This backend/CLI change needs no MCP setup or host configuration.

## Loopback History

- None for the public change.

## Sibling Changes

- Public active changes `modular-cli-lifecycle`, `openspec-version-compatibility`, `omp-installation-friction`, `guarded-npm-publishing`, `readme-positioning` and `tui-refinement` were present when this change was created. This port must preserve their public contracts and must not edit their artifacts.

## Reconciliation Receipts

- Before drafting, read public `openspec/specs/schema-revisions-and-migration/spec.md`, `openspec/specs/project-and-agent-cli/spec.md`, `docs/commands.md`, `docs/workflows.md`, the selected schema and its CLI-resolved artifact instructions. Public `src/cli/{shared,create,read,archive,handoff}.ts`, `src/domain/cli/commands/lifecycle.ts` and `src/project-lock.ts` supersede the original monolithic CLI ownership assumptions.
- The public change was created by `openspec new change portable-project-schema-pins --schema intent-driven-design --json`. CLI status resolved `journey.md`, `proposal.md`, two concrete `specs/<capability>/spec.md` files, `design.md`, `adr.md` and `tasks.md`; no `plan.md` output exists. After drafting, `openspec validate portable-project-schema-pins --type change --strict --json --no-interactive` passed 1/1 with no issues. `openspec instructions apply --change portable-project-schema-pins --json` reports ready with 0/9 complete; this is planning readiness, not product proof. Artifact links and references to existing public modules resolved. All-severity LSP was attempted on every authored Markdown path and retried on `tasks.md`, but the OMO LSP daemon remained unreachable; diagnostic cleanliness is unverified.
- DOX pass: the root, `openspec/AGENTS.md` and `openspec/changes/AGENTS.md` still accurately own dynamic change-local artifacts and their selected-schema gates. Their purpose, rules and child index did not change, so no parent DOX file was edited. Public canonical specs and sibling change artifacts remain unchanged.

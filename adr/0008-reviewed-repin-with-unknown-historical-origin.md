# ADR 0008: Reviewed re-pin with unknown historical origin

Status: Accepted
Date: 2026-10-11

## Context

ADR 0005 requires both old and current worktrees to remain reachable to prove that an absolute-only legacy source moved within one Git common directory. If the old checkout has been deleted, its older record contains only an absolute folder path. Neither the old worktree nor its former ownership can then be verified. This leaves an otherwise intact same-name change unable to repair its schema location.

## Decision

For an explicit, reviewed same-name re-pin only, permit manual repair when the missing legacy source is a normalized exact `openspec/schemas/<name>` path with safe existing components. This path shape establishes eligibility for review, not historical project ownership. A completely vanished external path with the same shape cannot be distinguished from a removed checkout; disclose that uncertainty rather than authenticating its old origin. Do not invent an old witness or source kind.

The current location must independently pass the witnessed, tracked project-local origin check. Verify the **new** location, not the deleted one. Require the same schema name, matching saved content digest and bundle, intact retention, strict completed workflow validation, no genuine shadow, and exact compatible association and resource ownership. Reject changed content, unsafe paths, existing dangling, redirected or non-directory components, known reachable non-project sources, and any other unresolved validation finding. The missing-source exception does not extend to automatic revision health or ordinary validation.

Show this warning before confirmation: “The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.” Bind the operator's explicit confirmation to the exact reviewed preview and fresh Apply token. Recovery requires its own fresh confirmation bound to the same uncertainty and exact journal intent. Confirmation accepts the uncertainty of the vanished source only; it does not certify its former ownership.

After guarded Apply, append one new re-pin event with the verified current reference and reviewed association disposition. Keep the old absolute-only record and all prior creation, migration, retention and association history unchanged. Do not change schema content, change artifacts, the OpenSpec pin or default, installed skills or their ownership. All other ADR 0005 linked-relocation, integrity, history, locking and recovery rules remain in force.

## Scope of supersession

This ADR supersedes only [ADR 0005](0005-linked-worktree-schema-origin-and-repin.md)'s requirement that the old absolute-only source and worktree remain reachable before a **manual** cross-path re-pin can proceed. Its proof requirement still governs automatic equivalence and reachable legacy sources. No other ADR 0005 rule is replaced.

## Approval provenance

The user approved this missing-source manual-repair policy on 2026-10-11 with “Approved.” ADR 0005's original decision date is 2026-10-07. This decision authorizes artifact reconciliation and future implementation within the selected change; it is not proof that preview, Apply or recovery already implements the policy.

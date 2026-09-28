# Design Journey

## Scope and Exclusions

- Scope: Put a concise what/who/why introduction at the top of the repository `README.md`, explaining the OpenSpec adaptation and its CLI and terminal dashboard.
- Exclusions: Product behavior changes, new CLI commands, guarantees that prose or schemas force agent behavior, rewriting the legacy resource collection, and making npm publication claims before release.

## Material Decisions

- The user described the origin as liking OpenSpec while using other skills and wanting easy setup of repeatable workflows plus one CLI overview; on 2026-09-27 they selected the phrase “durable change records.”
- `README.md` currently opens with Bun/OpenTUI and immediately moves to packaging. Its installation and safety details are useful and should remain, but should follow the audience and purpose.
- This introduction explains intent and available surfaces, not an enforceable claim about what external agents will do.

## Grilling Receipt

- Status: completed
- Method: grill-with-docs
- Result: Product positioning was explored against the actual README; the user refined “durable objects” to “durable change records” and chose separate planning changes.

## Route Selection

- Branch ID: readme-positioning/v1
- Selected route: Lead the README with a short, plain-language what/who/why story and a small first-use path, then retain the detailed package and resource sections.
- Alternatives: Reject a technology-stack-first opening and a claim that this tool replaces OpenSpec. Release details belong to `guarded-npm-publishing`.

## Approval Receipts

- Discovery: User explicitly asked to explore the README story alongside CI/CD and npm publishing on 2026-09-27.
- Route selection: User asked to decompose the work into multiple changes on 2026-09-27.
- Direction selection: User selected “durable change records” on 2026-09-27.
- Accepted loopback: None within this change.
- Pre-task handoff: User asked for OpenSpec proposals and continuation after syncing `main`; implementation waits for a later apply request.

## MCP Receipt

- Approval: Not applicable; documentation only.
- Host and evidence: No MCP setup requested; README describes existing CLI-supported MCP actions accurately.
- Config target: None.
- Catalog and result: None.
- Validation and fallback: Read current README and package commands directly.

## Loopback History

- None; the user wording change preceded artifact creation.

## Sibling Changes

- `pi-first-agent-delivery` defines internal agent dispatch; the README need not document it in its introduction.
- `guarded-npm-publishing` defines release automation; the README must not imply the package is already published.
- Canonical scope is the new `project-positioning` capability; no shared implementation files with siblings.

## Reconciliation Receipts

- Initial discovery: read `README.md`, `package.json`, and repository ADRs 0001 through 0004. No canonical positioning spec exists on `main`. Refresh status and validate after the remaining artifacts are written.
- Sibling reconciliation on 2026-09-28: reread this change's `journey.md`, `proposal.md`, `specs/project-positioning/spec.md`, `design.md`, `adr.md`, and `tasks.md` with sibling paths and repository ADRs 0001-0006. `openspec/specs/project-positioning/spec.md` is absent, as expected for a new capability. Refreshed status reports 6/6 artifacts and `openspec validate readme-positioning --type change --strict` passed. The other changes own delivery and release, so no downstream repair was needed.

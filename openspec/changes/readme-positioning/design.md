## Context

The current README begins with a Bun/OpenTUI technical description, followed by package history, setup commands, safety boundaries, bundled resources, and verification. The user wants the opening to explain why this adaptation exists for OpenSpec users who also use other skills, with repeatable workflows and durable change records. ADR 0001 establishes the OpenSpec lifecycle boundary; no repository ADR governs introductory copy.

## Goals / Non-Goals

**Goals:**

- Lead with a short what/who/why story using the user's phrase “durable change records.”
- Describe the CLI and terminal dashboard accurately, then point to a working first-use path.
- Keep existing prerequisite, safety, and resource guidance intact.

**Non-Goals:**

- Change code, publishing state, or agent behavior; rewrite the full README.

## Selected Direction

Replace the two opening sentences with a compact origin statement in the creator's voice, then explain the product and audience in plain words. Say this builds on OpenSpec's durable change records and helps people intentionally select workflows, bring in companion skills, and see work in one CLI and terminal dashboard. Place the existing checkout commands and links after this orientation rather than claiming the product is already published.

## Implementation Guardrails

- Verify every described surface against `README.md`, `package.json`, and `docs/commands.md`; do not imply external agents must obey a schema or that this tool replaces OpenSpec.
- Preserve conditional npm-install language until a real npm release exists, and retain Bun/OpenSpec version requirements and preview/approval guidance.
- Keep the new opening short enough to be read before the package installation heading. Avoid new feature or release claims.

## Alternatives Considered

- Lead with Bun/OpenTUI and migration history: already in place and fails the requested audience/why test.
- Replace all technical documentation with a story: rejected because readers still need working commands, supported versions, and safety boundaries.

## Risks / Trade-offs

- A personal motivation can read as an unsupported product guarantee. Keep the story concise and distinguish intentional design from enforceable agent behavior.
- Existing npm setup text might imply immediate availability if taken out of context. Keep the checkout first-use path and the conditional published-version wording.

## Migration Plan

1. Edit the opening and immediate path into setup, keeping downstream sections and links.
2. Manually check what/who/why, exact phrase, verified commands/links, and no unsupported claims. Run `git diff --check` and appropriate documentation checks.
3. Revert the introduction without changing product or installation behavior if review finds inaccurate claims.

## Open Questions

- None for the scoped introduction; editorial wording can be refined during review without widening the change.

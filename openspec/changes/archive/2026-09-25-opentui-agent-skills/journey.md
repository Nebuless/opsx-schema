# Design Journey

## Scope and Exclusions
- Scope: portable OpenTUI skill collection, design workflow, optional termcn/tuiparts integrations, and a versioned coverage/validation foundation.
- Exclusions: republishing third-party component source, installing libraries in consumer projects, and claiming every upstream API is already independently verified.

## Material Decisions
- User-approved proposal selects a compact router plus focused framework, design, ecosystem, and verification skills; progressive disclosure avoids a monolithic prompt.
- Official OpenTUI and third-party catalogs remain separate authorities. Candidate library APIs require source and example verification.

## Grilling Receipt
- Status: skill_invocation_unavailable
- Method: unavailable fallback
- Result: Prior research contrasted official docs, msmps skill, termcn, tuiparts and Agent Skills spec; no dedicated grilling skill was invoked.

## Route Selection
- Branch ID: portable-skills-v1
- Selected route: develop skills in this project, keep relative links, then extract to a dedicated repository.
- Alternatives: replacing the existing skill wholesale or embedding all docs in one SKILL.md rejected for duplication/context cost.

## Approval Receipts
- Discovery: user requested thorough research and official/third-party coverage in this conversation.
- Route selection: user requested proposal, then explicitly said "implement" on 2026-09-25.
- Direction selection: user accepted implementation of the proposed multi-skill structure on 2026-09-25.
- Accepted loopback: none.
- Pre-task handoff: user said "implement" after reviewing the proposal on 2026-09-25.

## MCP Receipt
- Approval: no MCP configuration requested or approved.
- Host and evidence: Pi coding environment; no compatible MCP host selected.
- Config target: guided-only.
- Catalog and result: none.
- Validation and fallback: source documentation and local test scripts instead of MCP setup.

## Loopback History
- None.

## Sibling Changes
- None found by `openspec list`.

## Reconciliation Receipts
- Initial change; no existing downstream artifacts or canonical specs modified.

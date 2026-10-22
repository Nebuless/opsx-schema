# Design Journey

## Scope and Exclusions

Port the approved mandatory Impeccable dependency, immutable skill sources, and
native OmO/Pi routing onto GitHub main without importing unrelated local history.
No automatic design hooks, adapter migration, live MCP configuration, or remote
merge is authorized. The PR remains open for the user to merge.

## Material Decisions

- D1: Impeccable is required and installed by default for intent-driven-design.
- D2: Only Inspo and UI Skills MCP additions are optional installation choices.
- D3: OmO uses `.omo`, separate from standalone Senpi `.senpi`.
- D4: Native Pi and verified existing legacy adapter sessions retain distinct
  targets, trust checks, and stale-preview guards.

## Grilling Receipt

Status: not_applicable. Investigation and explicit user corrections settled this
bounded installer change. No new product or visual direction is being chosen.

## Route Selection

Branch ID: required-impeccable-native-hosts. Extend existing guarded transactions
and the current modular CLI. Preserve portable pins, recovery, and provenance.

## Approval Receipts

Discovery, route selection, direction selection, and pre-task handoff were
authorized by the user's 2026-10-22 instruction to implement the recommended
scope with required Impeccable and corrected OmO naming. Local integration was
subsequently authorized and completed in commits `737f2e4` and `ec023d5`.
On 2026-10-22 the user approved porting only these changes onto GitHub main,
publishing a PR, Codex review rounds, subagent fixes for every finding, and
Macroscope cleanup until merge-ready. This is accepted publication loopback,
not authorization to merge the remote PR.

## MCP Receipt

No live provider setup was requested. Tests use isolated configurations.
Interactive human approval remains required for every actual MCP Apply.

## Sibling Changes and Reconciliation

The local and remote main histories are unrelated. This publication branch starts
at remote `8d30948`; it ports behavior, not the local repository snapshot.
The remote modular CLI and accepted ADR contracts remain authoritative.
This change's `tasks.md` is the publication completion checklist. No parallel
Backlog record is introduced into the remote codebase.

## Verification and Reversal

Run targeted behavioral tests, real CLI installation, strict change/schema
validation, package-consumer proof, and the complete remote `bun run check`.
Record exact results before completing tasks. Revert the publication commit to
reverse code and bundled declarations. Reverting code does not uninstall skills
or erase MCP files users independently installed after publication.

### Publication verification evidence

- Focused resource tests: 57 passed. CLI command tests: 15 passed. MCP safety
  tests: 14 passed with 196 assertions. Packed-consumer proof: 2 passed.
- The combined resource/switch run exposed a new test expecting the wrong
  stale-preview error name. The expectation now uses the existing
  `SWITCH_STALE` contract, and both new switch regressions passed afterward.
- Bundled snapshot tests: 9 passed with 270 assertions. Resource scripts and
  all nine native schema validations passed with OpenSpec 1.12.0.
- TypeScript, scoped Biome checks, and diff whitespace checks passed.
- Real CLI proof used initialized disposable project
  `/tmp/opsx25-cli-proof.UQquNe`. An exact preview token installed the schema
  and five default skills, including reviewed Impeccable 4.7.0. The optional
  provider preview selected `.omo/mcp.json`; `.omo/mcp.json`, `.pi/mcp.json`,
  and root `.mcp.json` remained absent. No provider Apply was performed.
- Full `bun run check` passed with exit 0 using Qlty 0.651.0 and OpenSpec
  1.12.0: Biome format/lint, Qlty, TypeScript, 510 application tests with
  9,635 assertions, two packed-distribution tests, and all resource checks.
  Application tests ran in 1,649.48 seconds. Qlty complexity and duplication
  reports are advisory under repository policy. Current-head CI is pending
  publication.
- DOX pass updated root and schema ownership guidance. Other owning documents
  retain their existing scopes and contracts and require no changes.

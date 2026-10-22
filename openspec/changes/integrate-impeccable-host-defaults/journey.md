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
  reports are advisory under repository policy. These results cover the initial
  publication commit; review-fix verification is recorded below.
- DOX pass updated root and schema ownership guidance. Other owning documents
  retain their existing scopes and contracts and require no changes.

### PR review loop

Publication commit `bed8bebc14b40eb3bbd90ba04515a5678aa2a584` is the scoped
remote-main port. PR [#16](https://github.com/Nebuless/opsx-schema/pull/16)
targets GitHub `main` and is linked to the owning T3 thread. Local integration
commits remain separate. No remote merge was performed.

Initial GitHub Codex and Macroscope review raised seven actionable findings:
disabled Pi adapter registration, untrusted project inputs affecting global Pi
mode, stale changelog version as runtime evidence, inaccurate skill destination
reporting, default association mislabeled as switch provenance, stale built-in
installation help, and required skills left behind after schema activation
failure. Independent Codex review added an eighth distinct finding: Pi built-in
exclusion precedence differed from the actual resolver. All eight were
dispatched to three disjoint fixing subagents. Parent
integration, regression evidence, current-head reruns, and fresh independent
Codex review remain required before completion.

The parent inspected all three fixes and committed verified units separately:
`cb1ffb5` corrects effective Pi capability, trust, disabled registrations, and
selector precedence; `737072e` corrects destination reporting, default selection
provenance, and built-in help; `6f6756a` keeps schema activation inside the
resource transaction and rolls back exact still-owned new writes on failure.
Unsafe rollback preserves changed resources and reports `RESOURCE_PARTIAL`
with installed targets, retained paths, ownership evidence, and the cause.
The original review findings map to these three commits. Revert each commit to
reverse its unit; reverting code does not undo previously installed resources.

Focused verification passed: 17 MCP tests with 228 assertions, 25 CLI tests with
291 assertions, and 48 transaction/resource/bundled tests with 502 assertions.
Each unit passed standalone TypeScript, scoped Biome, and diff whitespace
checks. The parent verified actual CLI help and strict change validation.
LSP diagnostics could not run because the local mise shim has no configured
`typescript-language-server`; standalone TypeScript passed instead.
Normal Worktrunk pre-commit hooks were invoked and reported no configured hooks.
The combined gate was superseded by the round 2 findings below.

Round 2 rejected two reproduced cases on `6f6756a`: filtering a disabled trusted
project registration before package identity precedence incorrectly revived the
global adapter; the all-noop resource path ran dependent activation without the
resource lock. Both findings were sent to the original disjoint fixing
subagents. The superseded aggregate gate was intentionally stopped with SIGTERM
before further edits; it is not a completed verification result. Seven other
prior findings were confirmed addressed, including clean rollback and preserving
external bytes, modes, ownership, replacements, and symlink routes. Round 2
passed 56 focused tests with 460 assertions while reproducing both defects.

Round 2 repairs are committed as `4b359db` (trusted disabled project package
precedence) and `73b99cf` (resource lock and locked state validation for no-op
activation). Parent inspection confirmed the corrected rejection-before-approval
regression and callback lifetime checks. Focused verification passed 17 MCP
tests with 237 assertions and 41 resource/schema-install tests with 239
assertions. TypeScript, scoped Biome, and whitespace checks passed. The full
integrated gate and fresh independent Codex round 3 now inspect `73b99cf`.

T3 reported all five required GitHub checks passed on original publication head
`bed8beb`: Commit history, Quality, Application tests, Resource checks, and
Package distribution smoke. This does not cover the not-yet-pushed review fixes;
the final published head must receive its own required checks.

Independent Codex round 3 approved the full diff at
`73b99cfc7a82caa9853ce024ce07f154c6e991ab` with no actionable findings.
It confirmed both round 2 repairs and independently passed 58 focused tests
with 476 assertions, whitespace checks, schema-copy parity, and real CLI help.
Live MCP connectivity remains untested. The final aggregate gate, push,
Macroscope thread reconciliation, and new-head required CI remain pending.

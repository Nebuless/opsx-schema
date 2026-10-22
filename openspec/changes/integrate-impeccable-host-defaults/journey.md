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

Pushed the reviewed fix series through `11b91c7` to the existing PR branch only.
All seven original GitHub review threads received substantive replies mapping
their fixes to commits and regressions, then were resolved. An authoritative
follow-up read returned no pending review and an empty unresolved-thread list.
Macroscope's existing approvability comment still refers to the original three
blocking findings; current-head review and required CI must be checked separately.

Macroscope follow-up `4352789351` found one remaining trust-boundary case:
malformed or non-object untrusted project settings were still parsed before
trust and could hide a valid global adapter. Parent inspection confirmed it and
dispatched the bounded parsing-order repair and deterministic regressions to the
Pi fixer. This reopens that original finding; the earlier empty unresolved-thread
read did not prove current-head correctness. The running aggregate gate covers
the preceding code, so the new repair requires its own checks and fresh review.

The preceding full `bun run check` completed with exit 0: 526 application tests
with zero failures, two packed-distribution tests, Biome, pinned Qlty 0.651.0,
TypeScript, resource checks, and all nine OpenSpec schema validations. It covers
the round 2 implementation, not subsequent repairs. GitHub Codex on `11b91c7`
then identified caller Git configuration leaking into pinned shell checkout and
missing ownership aliases when a default codex target is reused by opencode.
Both were independently inspected and dispatched to disjoint fixing subagents.
Macroscope's new approvability summary requests human review for the change's
scope, rather than citing the original three blocking correctness findings.

The trust-parsing repair is committed as `f6f12db`. Parent inspection confirmed
project settings remain safely snapshotted but are semantically parsed only
after trust. Six malformed-input regressions failed before repair. The focused
MCP run passed 23 tests with 297 assertions, including trusted refusal and stale
settings/trust changes; TypeScript, scoped Biome, and whitespace checks passed.
Strict change validation also passed after adding the new trust, shared-alias,
and pinned-checkout scenarios. The latter two implementation repairs remain
with their assigned subagents.

Committed shell checkout isolation as `d06522f` after parent diff inspection.
Checkout and revision inspection now use the clone/fetch isolated Git environment.
Local source fixtures reproduced smudge execution before the fix and passed
afterward for hostile HOME, global, inherited filter, and autocrlf settings,
asserting exact pinned bytes and no filter execution. The installer tests, all
resource checks and nine schema validations, ShellCheck 0.11.0, shell syntax,
and whitespace checks passed. Aggregate formatting saw a concurrent unfinished
shared-alias test edit; the owning fixer retains that file and will verify it.

Committed the neutral default ownership repair as `7e08039` after parent diff
inspection. Default installation records every declared profile at the shared
`.agents/skills` destination while writing each physical skill once. Both new
regressions failed before repair, including `RESOURCE_OWNERSHIP_INVALID` during
re-pin. Resource/schema tests passed 42 tests and 253 assertions; focused re-pin
passed two tests and 42 assertions. TypeScript, scoped Biome, and whitespace
checks passed. Subsequent explicit alias noops preserve skill and ownership
bytes, inodes, and modification times. Independent Codex round 4 and a fresh
complete `bun run check` now cover all three new repairs. Earlier checklist
approval and aggregate verification were reopened until these results return.

The first final aggregate passed quality and types, then exposed a stale CLI
expectation that defaults reported only codex. The new contract correctly
reports codex and opencode. Parent inspected the failure and updated that
machine-consumed expected profile list without weakening behavior assertions.
The aggregate was stopped on that known failure and is not a passing result.
The real CLI regression is rerun before a replacement aggregate.

Independent Codex round 4 approved the full diff through `7e08039` plus pending
OpenSpec artifacts and the corrected CLI expectation, with no actionable
findings. It independently passed 48 focused tests and 522 assertions, hostile
Git shell regressions, strict change validation, schema parity, and whitespace
checks. Live MCP connectivity remains untested. The actual CLI expectation
regression passed with 48 assertions and was committed as `3b59db2`; repository
format/lint and TypeScript passed. Combined `biome check` additionally reported
an existing import-order assist outside the repository's separate format/lint
gate; no imports were changed. LSP diagnostics timed out, with TypeScript used
as executable type evidence. A replacement aggregate now covers this final
runtime state; it is pending and is not implied by the independent approval.

Pushed through `ae1b5c7` and replied to all three repaired follow-ups; both new
Codex threads were resolved after confirmed publication. Macroscope correctness
passed, but its approvability summary still requests human review and cites an
ownership concern without an unresolved thread or new inline finding. GitHub
Codex subsequently raised P1 findings `4352985269` and `4352985280`: project
`.omo/skills` and `.omo/mcp.json` may not be consumed by OmO Native. These
challenge D3's original path assumption, not the user's requested OmO support.
Both are dispatched to separate fixing subagents with explicit upstream and
installed-runtime verification, distinguishing Native/Senpi from OpenCode OmO.
Review approval is reopened. The replacement aggregate was intentionally stopped
before completion because a host-contract repair would invalidate it; it is not
a passing aggregate. No remote merge or main push occurred.

The skill-path P1 `4352985269` is disproved without a code change. OmO Native
`omo-ai` 5.1.41 supplies `SENPI_BRAND.configDir = ".omo"`; the pinned Senpi
2026.10.21-1 engine uses that `CONFIG_DIR_NAME` for project package-manager
discovery. Independent parent inspection verified the installed launcher and
immutable upstream sources: `oh-my-openagent@331435952a2a3920cb56b3b160e83df7ddc7af12`
`packages/omo-native/bin/lib/engine-environment.js:23-35`, and
`senpi@c35cf40aeecbbb797e698e8c435cd72c54483b37`
`packages/coding-agent/src/core/package-manager.ts:830-831,2353-2403`.
The fixer exercised the actual branded package manager and skill loader in an
isolated project: trusted `.omo/skills` loaded with zero diagnostics; untrusted
discovery excluded it. Reply `4353040710` provides this evidence to Codex.
Global `~/.omo/agent` does not exclude branded project resources. MCP loader
verification remains independent and pending.

MCP P1 `4352985280` is also disproved without edits. The actual installed
5.1.41 branded engine config reader consumed exact Opsx preview bytes from
`.omo/mcp.json` as an enabled HTTP project server with `auth: false`. Untrusted
project configuration was excluded from spawnable servers; decoy root `.mcp.json`
and `.senpi/mcp.json` were ignored. Parent inspected immutable native loader
`senpi@dde7879b90b95e5da37326fc8fc178242b6c535b`
`packages/coding-agent/src/core/extensions/builtin/mcp/config.ts:36-66`:
it reads `join(cwd, CONFIG_DIR_NAME, "mcp.json")`; Claude root configuration
requires explicit `settings.importConfigs` opt-in. The installed wrapper source
matches upstream SHA-256. Reply `4353056962` supplies evidence and explains the
OpenCode versus Native distinction. The existing 23 MCP tests, TypeScript,
format/lint passed. No live server connection, provider Apply, or global writes.
Independent Codex round 5 now reassesses both P1s against this evidence. The
complete aggregate has restarted on unchanged runtime code and remains pending.

Independent Codex round 5 approved `8d30948b..ae1b5c7` with no actionable
findings and explicitly accepted both OmO P1s as resolved by branded-loader
evidence. It reviewed dependency enforcement, immutable acquisition, ownership,
rollback, locking, Pi trust/freshness, and CLI integration. Focused verification
passed 15 tests and 125 assertions plus whitespace checks. It made no edits and
did not rerun the parent's complete aggregate or actual runtime probes. Strict
OpenSpec validation passed. Current-head GitHub checks passed Commit history,
Quality, Resource checks, Package distribution smoke, and Macroscope correctness;
Application tests and the local complete aggregate remain pending. Macroscope
approvability is neutral and still requires human review, not an automated approval.

After the evidence replies and independent Codex approval, both P1 review threads
were resolved and GitHub returned an empty unresolved-thread list. Macroscope
approvability comment `6348838630`, updated `2026-10-22T20:28:32Z`, now states
only that the external skill acquisition and interconnected host/trust changes
exceed its low-risk eligibility threshold. It names no remaining code defect or
ownership concern. This is a human merge-approval requirement, not a failing
correctness check; no automatic approval is claimed or bypassed. Final local
aggregate and current-head Application tests remain pending.

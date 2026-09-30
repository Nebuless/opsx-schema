# Design Journey

## Scope and Exclusions

- Scope: investigate [GitHub issue #5](https://github.com/Nebuless/opsx-schema/issues/5), isolate each reported failure, and remedy OMP installation friction. After discovery, user selected **Design guarded collision replacement** on 2026-09-29: expand planning to an explicit reviewed backup-and-replace transaction. Implementation evidence is recorded in `tasks.md`; delivery approval is recorded below.
- Exclusions: unconditional overwrite/adoption, automatic bundle substitution, invented historical provenance, new MCP setup, bundled skill changes, runtime-version enforcement changes, OpenSpec lifecycle reimplementation, package publication, unrelated GitHub writes, and unrelated Backlog/probe/backup errors.
- Keep project default, active change pins, native skills, and command adapters distinct. Do not migrate the reporter's existing change merely to make installation verification green.

## Material Decisions

User selected expanded guarded-replacement route after reviewing discovery, then explicitly approved single-target, receipt-backed technical direction for planning on 2026-09-29. Preserve ownership, freshness, locking, recovery, and nonzero verification outcomes. That planning approval did not authorize implementation or a warning/exit-policy change; later delivery approval is recorded below.

### Evidence baseline

- Issue open; full upstream body fetched; no comments. Upstream all-state issue inventory contained only #5; no open PRs.
- Report: `opsx-schema@0.1.1`, Bun 1.3.14, OpenSpec 1.13.2, OMP 18.4.0, compound bundle 1.8.1 at revision `2c1740206a4d1729b0285b07a5e79c181b12bf89`. Installation ultimately succeeded; report does not establish a download/runtime defect.
- Investigation environment: Bun 1.4.2 and OpenSpec 1.13.2. Published source baseline: `7f3daf21c6e083080864af17fae5f06c1f9984bd`. Upstream main `0dc28b5eebc09e8273e8fe72580a09409c0039aa` changes release verification, not these runtime paths.
- Initially, checkout runtime/resources/package/command guides matched the published source baseline. Concurrent modular CLI extraction later changed source files; remaining investigation ran against a disposable immutable `git archive` of the published baseline, with checkout dependencies. This is source-runtime evidence, not a packed npm-consumer or Bun 1.3.14 compatibility claim.
- Source references below refer to published baseline. Implementation must rediscover current module locations after concurrent extraction; never restore the old modules to apply this plan.

### Confirmed isolation

| Reported friction | Cause and evidence | Classification |
| --- | --- | --- |
| `--bundle all` refused | `skills.txt` has 11 declarations. Without optional tier manifest, `loadSkillBundles` declares only `default` (`src/resources/index.ts:662-670`). Missing bundle is labeled `PROFILE_UNDECLARED` (`:803-816`), also used for unknown named profiles (`:1945-1951`). | Diagnostic taxonomy/actionability defect; selection refusal is correct. |
| `skills inspect --bundle all` succeeds | `skillDetails` returns every tier's availability/declarations plus `requestedBundle`; it does not validate a mutation selection (`src/domain/cli.ts:1038-1059,1220-1232`). | Read-only catalog success is not proof that requested tier is installable. Preserve inspection semantics. |
| Project skill inspection fails before installation | `skillDetails` calls project resources, resolved by OpenSpec `schema which` (`src/catalog/schemas.ts:53-58`). Bundled discovery uses a separate packaged catalog (`src/domain/cli.ts:778-785`; `src/bundled/index.ts:391-417`). | Resolution boundary correct; missing actionable install/catalog guidance. No silent bundled fallback. |
| Install source argument misread | Help says `<source>` but handler expects bundled catalog name (`src/domain/cli.ts:128-129,792-803`; `src/bundled/index.ts:213-236`). | Help ambiguity; not filesystem-source support. |
| Duplicate `--project` refused | Global scanner rejects duplicates (`src/domain/cli.ts:170-188`). | Invocation error. Keep single-use semantics and existing accepted flag placement. |
| Unowned skills block mixed switch | Missing ownership makes selected target `unmanaged/refuse`, even when bytes match (`src/resources/index.ts:2000-2110,2174-2255`). Any collision makes whole plan non-applicable; switch adds host obstruction (`src/switch/index.ts:1340-1385,1590-1637`). | Required ownership safeguard; recovery documentation gap. No implicit adoption. |
| Warning-level provenance fails verify | `add` defaults to blocking independently of severity (`src/validation/index.ts:103-110`); `PROVENANCE_UNKNOWN` does not opt out (`:428-433`); result is `ok: !context.blocked` (`:704-709`). Aggregate preserves result and maps it to `VERIFY_FAILED` (`src/domain/cli.ts:326-333,683-763`). | Ambiguous presentation/policy, not aggregate-only defect. Preserve fail-closed exit pending explicit policy decision. |
| Adapters need separate install | Adapter operations are separate from schema assets/default/skills. Aggregate verify covers doctor, schema, active changes, skills and MCP, not adapters (`src/domain/cli.ts:683-748,1601-1660`). | Documentation gap; do not claim aggregate verifies commands. |

Companion inventory: six Compound Engineering skills and five OpenSpec skills, all in declared `default`; `recommended` and `all` are unavailable. Do not add duplicate tier declarations merely to make `all` work.

### Observed scenario evidence

No application test suite, build, lint, or formatter was run for this investigation. Disposable CLI/domain probes, not source changes, established boundaries:

- Installed compound schema: inspection with requested `all` exited 0 and showed `default` available with 11 declarations and `recommended/all` unavailable. Unsupported mutation tier refused; supported `default` produced a ready 11-target switch preview. No automatic substitution occurred.
- Unowned byte-identical skill: `unmanaged/refuse`, `canApply=false`; Apply rejected `RESOURCE_BLOCKED`. Managed edited skill: `RESOURCE_OWNED_DRIFT`, edit preserved. Mixed missing/unowned set: fresh skill not installed, collision untouched. Target introduced after preview: `RESOURCE_STALE`, no adoption.
- Warning-only legacy minimalist change: schema, doctor, skills and MCP checks passed; only `change:legacy-change` failed with `PROVENANCE_UNKNOWN`. Both change validation and aggregate verify exited 1.
- Missing/drifted recorded digest: error-level revision findings and nonzero exit; distinct from unknown legacy history.
- Exact reviewed reconciliation of a no-skills legacy change: preview/token Apply succeeded; validation and verify exited 0; stored `created: null`, retained exact current revision, and reviewed association. Change read still reported creation history `Unknown`. Managed-skill reconciliation without required host/profile selection refused. This does not prove arbitrary legacy changes can be reconciled without inspecting their actual pin and required skills.
- Actual schema/adapters CLI preview and token Apply installed all nine OMP command files. `adapters inspect` returned `intact`, `missingFiles: []`; default remained `spec-driven`; no `.omp/skills` existed. Adapter installation does not install skills or activate a schema.
- Temporary project fixtures were removed; shared immutable investigation fixture is removed after all inquiry results are collected.

### Proposed remediation plan

1. **Bundle diagnostics and inspection guidance.** Replace bundle-specific uses of `PROFILE_UNDECLARED` with a dedicated skill-bundle diagnostic; retain genuine named-profile errors. Include supported declared tiers and exact inspection guidance across install, switch, reconcile, and pin diagnostics. Suggest `default` only when catalog evidence supports it; say it includes all 11 declared compound skills. Keep read-only inspection able to show unavailable tiers and keep mutation refusals/nonzero envelopes. Targets: resource bundle selection, CLI inspection/reconciliation, switch diagnostic consumers, owning tests and command guide.
2. **Pre-install discovery and grammar.** For a known packaged schema that project OpenSpec cannot resolve, retain authoritative project resolution and provide a bundled-inspection/install hint. Only handle established schema-not-found cases; do not mask malformed schema, subprocess, compatibility, shadow or permission failures. Keep `OPENSPEC_FAILED` cause where applicable. Rename help/documented positional placeholder to `<bundled-schema-name>`, state `--project` once, and preserve parser acceptance of its existing positions. No filesystem-source installation or implicit bundled fallback.
3. **Guarded collision replacement, expanded by user choice.** Retain ordinary install/switch collision refusal. Add explicit exact-target reviewed backup-and-replace planning, with durable recovery evidence, active-pin safety, freshness, path and ownership checks. No unconditional force, implicit adoption, or whole-root replacement. Detailed transaction and CLI direction follow below for separate approval. Document recovery and restoration without clobbering newly managed state; preserve unrelated skills.
4. **Legacy verification explanation.** Make failed component and unknown historical identity clear in existing text/JSON result presentation without turning warning into success. Document that current-schema validity and new-installation integrity do not prove historical origin. Explain reviewed exact-revision `skills reconcile`, selection prerequisites, and remaining `Unknown` creation history; do not offer it as blind install repair. Keep missing/drifted revision, divergence, unresolved active skill association and invalid artifacts blocking. Adapters remain separately inspected.
5. **OMP end-to-end guide and proof.** Use one `--project` per command: bundled inspection, schema install preview/apply, project skill inspection, collision review/recovery where needed, `schema switch ... --skill-host omp --bundle default` preview/apply, separate adapter install preview/apply, then schema validation, `skills doctor`, `adapters inspect`, status and component-aware verify. Each mutation uses its own freshly returned token. No `get_commands` probe, MCP setup, or hidden input. Native OMP skill/command discovery proof remains separate from filesystem integrity.

### Approved guarded replacement direction for planning

- Add separate `skills replace <project-relative-target> --schema <installed-name> --bundle <declared-tier> --backup-id <unique-id> [--apply-token <token>]`. Replace **one** explicitly named existing unmanaged skill directory per reviewed transaction; ordinary install and switch continue refusing other collisions until each is handled. A deterministic caller-selected safe backup ID binds the identical preview and Apply across CLI processes. Restrict source to one unambiguous declared skill at that exact known host/profile target; show shared consumer aliases. A same-name or byte-identical unowned tree is not implicitly adopted. Never replace modified/owned targets.
- Preview old/source tree hashes, inventory and mode changes, source/host identities, all impacted aliases, active-pin guard result, exact contained backup path and changed-file diff. Non-text/binary files get digest/mode evidence. Refuse symlinks, special files, unsafe parents, target roots, ambiguous aliases, incomplete pin knowledge, a target required by any active pin, stale source, and existing backup IDs. Token binds entire reviewed state; no option bypasses an incomplete preview.
- Apply must serialize with project schema switching and resource writes. Recheck target identity/content, ownership, source/manifests, pin guard and backup absence before any destructive step and after acquiring locks in a common order. Persist versioned intent/phase receipt and unique backup directory, copy+verify old tree, stage+verify source, then use same-parent renames for target swap; record normal ownership only after verified new tree. Mark success only when target, ownership and receipt agree. Never delete verified backup automatically. Faults must restore only unchanged transaction-owned state or leave explicit partial receipt and both candidate trees intact for reviewed recovery.
- Existing `resources.lock` alone is insufficient: switch uses a separate project lock and writes pins outside resource-lock scope; Opsx creation, handoff, archive and `skills reconcile` also write active pin/association state without the same lock. Before exposing replacement, establish a common project lock protocol for all Opsx-controlled active-pin writers and replacement/restoration (project lock then resources lock), plus active-pin revalidation under lock. Standalone OpenSpec and external filesystem writers do not honor this protocol; recheck authoritative state at write boundaries and report observed drift, without claiming atomic protection against non-cooperating writers. Avoid a second OpenSpec lifecycle engine; reuse narrow lock/write primitives and preserve each operation's current semantics.
- Add read-only exact-receipt inspection and separately preview/token-guarded `skills restore <backup-id>` only for a complete or partial receipt whose backed-up bytes, current target and ownership still match the recorded transaction and whose current verified active pin set does not require the target. On external edits, new pin requirements or ambiguous state, refuse restoration and preserve backup for manual recovery; never overwrite user changes or rewrite historical provenance. A replacement can succeed without changing schema default; all other missing/colliding skills remain a separate install/switch preview responsibility.
- New API is riskier than documentation-only recovery and adds project-wide lock coordination. User approved the single-target direction for drafting behavioral specs/design/ADR/tasks, not implementation. During implementation use current extracted CLI owners, not published baseline paths. Owned test homes: `test/resources/resources.test.ts`, `test/switch/transactions.test.ts`, `test/cli/commands.test.ts`; cover cross-device backup copy, copy/stage/swap/metadata failures, interruption/recovery, active-pin write concurrency, stale preview, text/binary diff, shared aliases and restoration refusal after external edits.

### Acceptance and verification contract for implementation

- Unavailable bundle request reports bundle-specific identity and actual supported tiers; compound default selects every declared skill without silent substitution. Unknown profile remains separately classified.
- Project inspection does not silently read a same-name packaged schema; missing installed packaged schema receives actionable bundled/install guidance. Other OpenSpec failures remain truthful.
- Catalog-name install, path rejection, duplicate project rejection, unavailable read-only tier inspection, JSON envelope/nonzero rules, and no unintended writes remain covered by existing CLI/resource behavioral test homes.
- Collision safety remains complete-set refusal, including byte-identical unowned and edited-managed resources. Stale token, containment, symlink and unrelated-target protections remain. Exercise documented reviewed backup/recovery in a disposable OMP project, including controlled copy-based backup and restoring custom content safely.
- Legacy warning-only component remains nonzero and identifiable; integrity errors remain nonzero. Exact reviewed reconciliation preserves `created: null`/creation `Unknown` and clears only uncertainty it actually resolves; wrong revision/missing selection refuse.
- Start-to-finish disposable OMP scenario proves 11 skills and nine commands, selected default, unchanged unmigrated legacy pin and separate component checks. Where native OMP discovery is exercised, record actual supported host command/UI evidence, not unsupported RPC or filesystem inference.
- Existing test homes: `test/cli/commands.test.ts`, `test/resources/resources.test.ts`, `test/switch/transactions.test.ts`, `test/validation/validation.test.ts`, `test/adapters/adapters.test.ts`. Reuse consumer-visible contracts; do not add prose/source-copy tests.
- Before implementation, re-read affected files and use language-server references for any exported symbol changes. After implementation, targeted existing suites plus actual text/JSON CLI scenarios; packed-consumer `bun run test:distribution`; `openspec validate omp-installation-friction --type change --strict`. Run `bun run check` before PR. Resource content is intentionally unchanged; if scope later changes packaged assets, also require contribution rules, integrity metadata and `bun run test:schemas` with OpenSpec available.
- Update affected durable specs, `docs/commands.md`, `docs/workflows.md`, and root `CHANGELOG.md` after behavior approval. Keep README short, linking detailed OMP instructions rather than embedding technical recovery detail. Preserve unrelated changelog edits.

## Grilling Receipt

- Status: not_applicable.
- Method: evidence-grounded independent subsystem inquiries and disposable boundary probes.
- Result: challenged universal `all`, automatic adoption from equal bytes, warning-means-success, reconcile-means-known-creation, and verify-includes-adapters assumptions. All were rejected by observed/source evidence. No separate product-grilling skill invoked for this incident investigation.

## Route Selection

- Branch ID: OMP5-GUARDED-REPLACEMENT.
- Selected route: user selected guarded collision replacement, expanding diagnostic/documentation plan with explicit reviewed backup-and-replace transaction design. Single-target API/transaction direction was approved for planning; completed behavior and verification are recorded in `tasks.md`.
- Alternatives: documentation-only recovery considered but not selected. Silent bundled fallback, nonblocking-all-warnings policy, unconditional force, automatic adoption and duplicate `all` declaration remain excluded.

## Approval Receipts

- Discovery: findings presented, followed by explicit question whether to approve findings and remediation direction. User responded **Design guarded collision replacement** on 2026-09-29; discovery pause satisfied with expanded route choice.
- Route selection: OMP5-GUARDED-REPLACEMENT selected on 2026-09-29. Planning only; not implementation approval.
- Direction selection: user explicitly selected **Approve single-target design** on 2026-09-29. Authorizes remaining OpenSpec plan artifacts only; no production edits, commit, push, or release.
- Accepted loopback: none.
- Pre-task handoff: pending review of the complete specs/design/ADR/task plan; no implementation authority. Task checkboxes are unstarted and no production code changed under this approval.
- Delivery: on 2026-09-30, after reviewing completed implementation and verification summary, user explicitly approved all commits and pushing the issue #5 PR. This does not authorize npm publication, merging, or archiving the OpenSpec change. Earlier receipts above describe their respective point-in-time approval scopes, not current delivery state.

## MCP Receipt

- Approval: not requested; outside scope.
- Host and evidence: issue names OMP; local OMP reports 18.4.2, but no native host discovery was exercised during this investigation.
- Config target: none.
- Catalog and result: no providers selected or installed.
- Validation and fallback: local source/CLI inquiry only.

## Loopback History

None. Concurrent source relocation handled by immutable published-source fixture; no production edits reverted or overwritten.

## Sibling Changes

- `modular-cli-lifecycle`: independent behavior-preserving extraction, overlapping CLI/lifecycle source ownership. Integrate sequentially at shared file boundaries, remap symbols after extraction, keep this issue's behavior changes separately reviewed. Do not weaken refactor's preservation requirements or treat its approval as issue-fix approval.
- `guarded-npm-publishing`, `openspec-version-compatibility`, `readme-positioning`: unrelated scope; no edits.

## Reconciliation Receipts

- Read canonical `openspec/specs/project-and-agent-cli/spec.md`, `schema-resources-and-profiles/spec.md`, `workflow-validation/spec.md`, command/workflow guides, and adjacent modular CLI proposal/design. Source inquiries also read revision/migration and installation visibility contracts.
- `openspec status --change omp-installation-friction --json` selected `intent-driven-design`, returned exact `journey.md` output path and required discovery/route/direction pauses. This record is discovery plus proposed plan, not proof that downstream artifacts or implementation are complete.
- Refreshed status after writing: journey done, proposal ready, downstream artifacts blocked. `openspec validate omp-installation-friction --type change --strict` exited 1: no specification deltas yet. This is a discovery-stage planning record, not a strictly validated implementation-ready change; required discovery approval precedes downstream artifacts. Do not use `skip_specs` to conceal missing behavior specifications.
- After user selected guarded replacement route, read `openspec instructions proposal --change omp-installation-friction --json`, reread journey dependency, wrote proposal at CLI-returned path, refreshed status: proposal done; specs and design ready. At that stage detailed direction remained pending, so downstream artifacts were not authored. Independent resource/switch inquiry found project/resource lock separation and unsynchronized pin writers; the subsequently approved single-target direction includes their coordination gate.
- After detailed direction approval, wrote four capability delta specs, design, ADR review manifest, durable ADR 0007 and unstarted tasks at CLI-returned paths. Independent read-only plan review found a missing active-pin restore guard and an overbroad lock guarantee; both were corrected in specs/design/ADR/tasks. After correction, `openspec validate omp-installation-friction --type change --strict` exited 0 and status reports all six artifact types done with `isPlanningComplete: true`. No production edits, runtime tests, commit or publication were authorized by the planning approval.

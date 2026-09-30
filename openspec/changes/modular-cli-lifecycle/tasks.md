# Implementation Tasks

Pre-task approval, subsequent OpenSpec apply authorization, and later PR delivery approval are recorded in `journey.md`. Release, merge, archive, and live provider installation remain unauthorized. Tasks are checked only after their outcomes are verified.

Follow `design.md` guardrails, capability preservation matrix, and each cited unit's verification scenarios. Preserve KTD1–KTD5 and the change-local compatibility requirements. Refresh language-server references before moving exported symbols; migrate value and type consumers together. Use existing behavioral suites; add permanent coverage only for an uncovered consumer-visible boundary. Record command exits and observed filesystem/CLI/TTY results here when implementation is authorized.

## 1. Cycle-free lifecycle workflows — U1

Dependencies: none.

- [x] 1.1 Extract lifecycle shared support, creation, reads, archive, and handoff into `src/cli/{shared,create,read,archive,handoff}.ts`; migrate every consumer and remove `src/cli/index.ts` without a shim. Keep switch importing handoff directly, with no handoff/shared dependency back to switch or creation. Verify existing lifecycle, switch, validation, revision, and archive suites preserve action/result contracts, provenance, guarded writes, and partial recovery.
- [x] 1.2 Exercise actual CLI creation, status/instructions/validation, archive, handoff, and reviewed schema migration in disposable OpenSpec projects. Verify U1's selection-source, stale/incompatible/no-op, `CREATE_PARTIAL`, `HANDOFF_PARTIAL`, and associated-handoff refusal scenarios through applicable suites and filesystem evidence; successful mutations retain revision/provenance content and do not rewrite artifact bodies.

## 2. Stable CLI transport, reads, schemas, and diagnostics — U2

Dependencies: group 1.

- [x] 2.1 Extract `src/domain/cli/{shared,checks,skill-pins}.ts` and `commands/{reads,schemas,diagnostics}.ts`, leaving startup, ordinary routing, response rendering, help, exit mapping, and dashboard launch in `src/domain/cli.ts`. Verify existing command/read/bundle suites preserve all read/schema routes, project-optional resolution, distinct doctor/verify orchestration, and side-effect-free support imports.
- [x] 2.2 Exercise actual text/JSON CLI reads and diagnostics from nested, exact-root, and project-free fixtures. Verify accepted global-flag positions, invalid/duplicate/unknown arguments, command labels, envelopes/exits, help, and non-TTY bare refusal. Preview/apply a distinct-name schema install without activating it; verify collision/source drift refusal and all nine bundled schemas. Compare stable token/serialization inputs with temporary characterization only where needed.

## 3. Unchanged lifecycle command handling — U3

Dependencies: groups 1 and 2.

- [x] 3.1 Extract `commandChange` and `commandSchema` into `src/domain/cli/commands/lifecycle.ts` with direct workflow imports and shared bundle validation. Verify existing command/lifecycle/switch suites preserve every lifecycle route, repeated profile/host/migration flags, invalid selections, and distinct CLI versus lifecycle token binding.
- [x] 3.2 Exercise actual lifecycle and schema-switch preview/apply subprocesses in disposable projects. Verify exact targets, stale/changed-target refusal, migration receipts, old effective pins, retained skills, and unchanged artifact bodies; schema switching neither installs MCP nor bypasses its approval boundary.

## 4. Unchanged skill management — U4

Dependencies: group 2.

- [x] 4.1 Extract skill handlers into `src/domain/cli/commands/skills.ts`, consuming verified pin support without changing resource operations. Verify existing resource/command/switch suites preserve inspect/doctor/reconcile/install/disable, profile/native-host/bundle distinctions, shared-target deduplication, truthful associations, and guarded removal refusals.
- [x] 4.2 Exercise actual skill inspection, diagnosis, reconciliation, installation, and permitted disable in disposable projects using controlled local fixtures. Verify stale/conflicting selections refuse, reconciliation does not invent creation history or install resources, and shared/modified/unsafe/required/unverified-pin resources remain protected.

## 5. Separate human-approved MCP handling — U5

Dependencies: group 2.

- [x] 5.1 Extract MCP handling and its prompt lifecycle into `src/domain/cli/commands/mcp.ts`, preserving installed/bundled resolution, host/target requirements, Pi prerequisite, stderr prompts, and usable-TTY checks. Verify existing MCP/command suites cover unsafe/unknown inputs, approved simulated writes, cancellation, freshness, and clean JSON stdout.
- [x] 5.2 Exercise actual MCP preview and matching-token non-TTY Apply refusal, then an actual TTY cancellation path. Observe unchanged host configuration, no preview network/provider activity, and unpolluted JSON stdout. Do not automate affirmative approval or perform a live provider installation under this plan.

## 6. Unchanged adapter installation — U6

Dependencies: group 2.

- [x] 6.1 Extract adapter handling into `src/domain/cli/commands/adapters.ts`, preserving installed aliases, project scope, verified compound provenance, and exact token binding. Verify existing adapter/command suites retain all five host destinations and refusal of arbitrary same-name sources, unsupported targets, drift, stale tokens, and unowned collisions.
- [x] 6.2 Exercise actual adapter inspect/preview/apply in a disposable project against a verified installed compound schema. Verify installed nine-command content and unchanged unrelated files; use existing suite coverage for remaining host destinations and refusal paths.

## 7. Complete cutover proof and ownership guidance — U7

Dependencies: groups 3–6.

- [x] 7.1 Launch the actual TTY dashboard and exercise Overview, Changes, Archive, Settings, keyboard/focus navigation, file viewing, and Settings staging/cancellation. Observe no unintended writes and unchanged read-only versus write boundaries; run existing TUI suites as supplementary proof.
- [x] 7.2 Exercise a packed consumer without a sibling checkout. Verify the unchanged executable resolves every extracted module, documented commands still work, and the bundled catalog contains all nine schemas; complete `bun run test:distribution` and `bun run test:schemas` with OpenSpec available.
- [x] 7.3 After smoke proof, remove obsolete imports/comments and temporary characterization scripts; update `AGENTS.md` ownership paths, affected internal guidance in `docs/commands.md` if needed, and `CHANGELOG.md`. Keep package bin, release guard, bundled resources, UI, and versions unchanged unless an in-scope extraction requirement is demonstrated.
- [x] 7.4 Verify every capability-matrix row and run final `bun run check` plus `openspec validate modular-cli-lifecycle --type change --strict`. Record exact aggregate exits and scenario evidence before checking completion; passing component output, mock forwarding, or planning readiness is not implementation proof.

## Verification Evidence

- 2026-09-29: Integrated direct lifecycle and seven-family command extraction. Initial TypeScript/runtime gate found `revisionRef` incorrectly imported from revisions in handoff; corrected to its unchanged provenance export. `bun run typecheck` then exited 0.
- Targeted 14-file CLI/lifecycle/switch/resources/MCP/adapters/read/archive/revision/validation/bundle/TUI run: 115 passed; one live-repository status serialization test failed because project artifacts changed between JSON and TOON reads. Replaced its mutable repository input with an isolated OpenSpec fixture, preserving exact serialization comparison and adding expected change/archive assertions. `bun test test/cli/commands.test.ts --test-name-pattern 'status JSON and default TOON' --timeout 30000` exited 0: 1 passed, 11 assertions. Lifecycle/switch/validation/revision/archive suites passed; partial-failure smoke completed below.
- `bun run test:distribution` exited 0: packed consumer passed 77 assertions without sibling checkout. `bun run test:schemas` exited 0 with OpenSpec 1.13.2 available: all nine schemas, resource layouts, and adapter projections checked.
- Explicit disposable-project partial-state smoke exited 0: native creation retained metadata on real revision-finalization failure (`CREATE_PARTIAL`); same-schema handoff changed no bytes; successful unassociated handoff wrote the destination pin and migration receipt without inventing origin; narrowly injected provenance-commit and pin-restoration failures produced `HANDOFF_PARTIAL` with destination pin, source-only retained provenance, truthful divergence, and unchanged artifact bodies.
- Actual TTY dashboard observed Overview, Changes, Archive, and Settings; active and historical file viewers; Tab focus; staged destination review; exact-effects preview; separate Apply confirmation; and cancellation. SHA-256 maps for every disposable-project file matched before/after. Existing three TUI suites passed in the targeted run.
- Actual MCP CLI preview disclosed `inspo`, OMP host, disposable target, and exact config diff. Matching-token non-TTY Apply exited 1 with `MCP_TTY_REQUIRED`. Actual TTY prompt was answered `no`: one JSON stdout envelope reported `denied`/`OPERATION_NOT_APPLIED`, exit 1; provider policy and prompt stayed on stderr; no config was created and all fixture hashes remained unchanged. No affirmative approval, live installation, or provider connection was performed. First TTY attempt selected the fixture's nearest project and refused its absent schema; the corrected explicit project selected the same preview source.
- Independent read-only extraction review returned PASS with no introduced correctness findings, covering KTD1–KTD5, direct dependencies, startup, route/output/token contracts, and safety ordering. Reviewer executed no gates; runtime evidence above remains parent-owned.
- Static-import subprocess loaded all three CLI support modules and all seven command-family modules with `--help --json` in argv: exit 0, empty stdout/stderr, no executable processing or dashboard launch. Disposable-project file hashes still matched after the import and MCP cancellation checks.
- First `bun run check` showed Biome, Qlty, TypeScript, 161 application tests (1,577 assertions), packed consumer (77 assertions), and resource/schema checks passing, but the wrapper reported a timeout; no aggregate success exit is claimed for that invocation. A second `bun run check && printf '\nOPSX_AGGREGATE_EXIT_0\n'` printed the success marker after all components, including all nine OpenSpec schema validations, completed. The tool wrapper again mislabeled the process timed out despite the shell success marker; the marker is evidence of the aggregate command's zero exit, not a claim that the wrapper returned a clean status.
- Semgrep 1.178.0 scanned 17 extracted/switch TypeScript files with 74 rules: exit 0, zero findings, approximately 99.9% parsed. PartialParsing warnings at unchanged switch NUL separator expressions limit automated coverage. Fresh scanner-first independent audit returned PASS/no introduced security findings; it explicitly retained that scanner limitation. No claim of fully parsed security coverage.
- `openspec validate modular-cli-lifecycle --type change --strict` exited 0 after integrated extraction and recorded smoke evidence.
- Actual CLI disposable-project smoke: create preview/Apply retained exact `spec-driven` revision and empty skill selection; status and proposal instructions read succeeded; archive validation, preview/Apply moved a completed change into the native archive, preserved spec bytes, and removed the active view. A second archive attempt with an externally changed README after preview failed `STALE_PREVIEW` and retained the active change. Standalone associated handoff refused `PROVENANCE_ASSOCIATION_REVIEW_REQUIRED`; unassociated legacy handoff preview/Apply retained Unknown origin and source/destination migration receipt with unchanged spec bytes. Same-schema handoff changed neither metadata nor provenance; invalid artifact refused ready/token. Existing suites and independent partial-state smoke cover selection-source and `CREATE_PARTIAL`/`HANDOFF_PARTIAL` filesystem outcomes.
- Actual CLI read/schema smoke: nested nearest-project and explicit `--project` after command yielded identical `schemaVersion: 1` JSON facts; active/archived file reads, resolved schema/resources reads, TOON status, JSON help, and project-free nine-schema validation/verify worked. Bare non-TTY returned `TTY_REQUIRED`; extra, unknown, missing-value and duplicate flags returned `USAGE`; exact non-project root returned `PROJECT_NOT_FOUND`; missing active record and unsafe path returned `CHANGE_NOT_FOUND` and `UNSAFE_PATH`. Project doctor succeeded while project verify correctly failed an invalid legacy change; project-free verify succeeded. Distinct-name bundled schema install preview/Apply left config unchanged; modified destination caused `APPLY_TOKEN_STALE` for an earlier token and collision preview exited 1 without changing the file. Bundled integrity/resource suite covers source drift independently.
- Actual CLI reviewed switch with `--migrate migrate-proof`: preview reported a ready source-to-destination migration; changed selection using its token failed `APPLY_TOKEN_STALE` without writes; matching Apply updated default and change pin, wrote one migration receipt, retained original created revision, and preserved spec bytes. A subsequent switch retained an unrelated skill file byte-for-byte and preserved the migrated artifact body. MCP config remained untouched in the earlier actual negative-approval smoke; switch code/suites preserve its separate installation boundary.
- Independent disposable skill CLI smoke used a local git fixture with no network: 14 JSON subprocesses covered inspect, doctor, Unknown-origin legacy reconcile preview/Apply, exact installed `SKILL.md`/reference bytes, owned-target diagnosis, disable preview/Apply, and unchanged unrelated file. Reconcile recorded selection but did not invent creation or install resources. Existing resource/switch/CLI suites cover stale/conflicting selections and protected shared, modified, unsafe, required, and unverified-pin resources.
- Independent disposable adapter CLI smoke: aliased compound schema installed by exact token without activating it; Pi adapter inspect changed from missing to intact after preview/Apply, all nine installed `.pi/prompts` files were byte-equal to bundled host content, and unrelated sentinel/config bytes stayed unchanged. Existing adapter suites cover remaining hosts and refusal paths.
- Capability-matrix closure: reads/schema catalogs and installs, lifecycle operations, skill resources, MCP, adapters, doctor/verify, actual dashboard, and packed consumer each have the corresponding actual CLI/TTY/filesystem observation above plus their existing behavioral suites. Final `openspec validate modular-cli-lifecycle --type change --strict` exited 0 after those outcomes were recorded. No live MCP install, npm release, commit, push, or archive was attempted.

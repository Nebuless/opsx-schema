# Design Journey

## Scope and Exclusions

- Scope: Plan a safe path to install a newer bundled schema revision when one is already installed, make a newly CLI-created pinned change's selected hosts/skills provable to resource diagnostics, and make OpenCode, OMP, Pi, Atomic, and Senpi first-class compatibility targets for schema adapters, schema-declared skills, and schema-declared MCP servers. The first two limits were observed in the isolated CLI smoke on 2026-09-25; the five-host parity requirement was explicitly added during planning.
- Exclusions: Gemini, Codex, and Claude remain optional profile targets, not first-class compatibility hosts. Do not weaken validation of an intentionally incomplete change, claim MCP connectivity from configuration, silently configure an unsupported MCP transport, change the dashboard or desktop/PTY harness, or bypass provider safety approval. This change is planning only until a separate apply request.

## Material Decisions

- Existing `schema-revisions-and-migration` requires referenced revisions to remain inspectable, with same-name shadows and unexpected edits reported. OpenSpec pins only a schema name, and retained snapshots do not make old pins resolve to old bytes after a same-name overwrite. Proposed route: install newer bundled content under a distinct, validated schema identity and switch the project default explicitly; preserve the old named installation and pinned/archived changes. Identical reinstall is a no-op; changed same-name targets remain a safe refusal.
- Existing `schema-resources-and-profiles` requires active and shared skill retention. A pinned change's named-profile, native-host, and skill-bundle association must be recorded from an explicit, verified selection rather than guessed from the current default or disk presence; legacy unknown associations remain labeled unknown and block unsafe skill removal until reconciled. `schema switch` currently separates named profiles from only native OMP/Atomic hosts; the other three must be added as native hosts rather than treating optional Gemini/Codex/Claude profiles as substitutes.
- The host matrix is three independent capabilities: OpenSpec schema installation and change pins remain host-agnostic; schema workflow adapters need valid project paths per host; managed skills need native discoverable host targets and shared-directory ownership accounting; MCP requires host-specific config/transport integration plus the existing immediate human provider-safety approval. A host cannot be reported ready on the strength of another host's config or a generic profile checkbox. Where a host cannot install a declared HTTP MCP server natively, the plan must expose a verified host-specific integration or report the limitation and refuse a false success.
- The observed doctor error for the intentionally incomplete smoke change remains valid for planning-artifact readiness. Only the independent `RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN` blocker is in scope.

## Grilling Receipt

- Status: not_applicable
- Method: unavailable fallback
- Result: This proposal responds to two reproduced, narrowly identified limits; no user-requested grilling session or competing product directions preceded artifact creation. The main assumptions were checked against the existing immutable-revision and retained-skill contracts.

## Route Selection

- Branch ID: safe-schema-upgrades-and-pinned-skill-profiles/five-host-distinct-revision-and-explicit-association
- Selected route: Install a changed bundle under a distinct revision name with an exact preview and validation, then switch only new project defaults through the existing guarded flow. Model OpenCode, OMP, Pi, Atomic, and Senpi as distinct host capabilities across adapters, skills, and schema-declared MCP, with native target verification and honest unsupported diagnostics. Snapshot explicit verified named-profile/native-host and bundle selections with each new change pin, with reviewed reconciliation for unknown legacy associations. The old schema name and active/archived pins remain operational and unchanged.
- Alternatives: Overwrite a colliding schema directory, even after retaining a snapshot (OpenSpec name-only pins would resolve new bytes); infer pin profiles from currently installed skills or suppress the doctor finding (unsafe deletion); refuse all newer bundle revisions (does not address the install limitation). No sibling change ID selected for this scope.

## Approval Receipts

- Discovery: 2026-09-25 user requested a new change with all planning artifacts, following the prior isolated CLI smoke findings.
- Route selection: Proposed by this planning pass for user review; no separate user route approval claimed.
- Scope revision: On 2026-09-25 the user clarified that OpenCode, OMP, Pi, Atomic, and Senpi are first-class across schema compatibility, skills, and MCP; Gemini, Codex, and Claude are not promoted. After the proposed artifact paths and scope were named, the user explicitly agreed to revising this journey, proposal, existing delta specs and design, adding the relevant host-visibility delta, and completing the change-local ADR manifest and tasks. No application code or MCP configuration was authorized.
- Direction selection: The user requested a complete proposal in one step and subsequently approved its five-host planning revision; implementation direction remains reviewable, not approved for apply.
- Accepted loopback: The user approved the five-host planning-artifact revision on 2026-09-25; all downstream specs, design and handoff artifacts are reconciled against that change of scope.
- Pre-task handoff: The 2026-09-25 approval explicitly included creating the implementation-task planning artifact after the five-host revision; this is approval to document a handoff, not to implement the tasks.

## MCP Receipt

- Approval: No project MCP setup requested or authorized for this change; earlier approval was confined to isolated smoke targets, not this repo.
- Host and evidence: Prior smoke inspected project-local OMP provider config but did not establish connectivity. Host config paths in source are capability evidence, not evidence of installed or reachable servers in this project.
- Config target: none; no provider mutation.
- Catalog and result: none selected, none installed.
- Validation and fallback: No MCP setup or connectivity claims; investigate local schema, resource, and CLI contracts without a provider.

## Loopback History

- Initial planning had no loopback. The 2026-09-25 accepted five-host revision changed scope without authorizing product implementation; the existing proposal, delta specs and design were reopened, a host-visibility delta was added, and the task handoff now follows that revised dependency chain.

## Sibling Changes

- `opentui-agent-skills` is listed complete at initial discovery; it is not a dependency and its UI/skill-authoring scope is excluded. The relevant canonical capabilities are `schema-revisions-and-migration`, `schema-resources-and-profiles`, `project-and-agent-cli`, and `skill-host-installation-visibility`.

## Reconciliation Receipts

- Initial `openspec status --change safe-schema-upgrades-and-pinned-skill-profiles --json` reported the intent-driven-design schema, all six output paths absent, and the dependency chain journey → proposal → specs/design → adr → tasks. Canonical specs for the three affected capabilities were read before drafting. During initial planning, source inspection of `src/revisions/index.ts` established that retained snapshots are not the effective name resolver; the unapproved proposed same-name route was corrected to a distinct-identity route in this journey and proposal before drafting downstream specs. No accepted loopback or sibling synchronization occurred. Refresh status and run validation after all outputs exist.
- Approved loopback: Reopened planning after the user's five-host clarification and explicit revision consent. Source review found only OMP/Atomic native skill targets, four adapter hosts without OMP, and MCP config support for OMP/Atomic/OpenCode but guided-only Pi and no Senpi. Reconcile proposal, four affected capability deltas, design, ADR manifest, and tasks against the approved host scope before validation; no sibling change or product code is being modified.

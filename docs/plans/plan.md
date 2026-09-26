# Opsx Schema Application Plan

Status: Proposed for refinement  
Date: 2026-09-23  
Planning only; this document does not authorize implementation.

## Goal and authority

Build a standalone `opsx-schema` application in this repository. A person can inspect a project's OpenSpec work in a Bun/React OpenTUI dashboard, switch its default schema with the right agent skills installed, and explicitly install catalog MCP servers. An agent can inspect and manage the full OpenSpec lifecycle through a concise, noninteractive CLI. Port the capabilities of `../openspec-schemas`; do not preserve its command syntax or rewrite that sibling package as part of this project.

OpenSpec remains authoritative for schema resolution, artifact instructions and readiness, change identity/pins, validation, and archive operations. Opsx owns the catalog of distributable schemas and resources, a project snapshot for its two interfaces, schema-revision provenance, guarded installation/migration orchestration, and presentation. Do not infer task completion from artifact existence or an animated progress bar.

Decisions: [ADR 0001](../../adr/0001-cli-runtime-and-authority.md), [ADR 0002](../../adr/0002-schema-revisions-and-provenance.md), [ADR 0003](../../adr/0003-schema-switch-and-validation.md).

## Product contract

### Interfaces

- Bare `opsx-schema` on a usable TTY opens one project-root dashboard. Project discovery defaults to the nearest OpenSpec root; an explicit project argument overrides discovery. Non-TTY invocation never attempts a renderer and provides concise command help or an actionable invocation rather than hanging on input. Live help describes commands, arguments, defaults, errors, and examples; agent-facing descriptions defer to the live CLI contract.
- Dashboard tabs: **Overview** shows health, current default schema, planning-artifact readiness and implementation-task completion separately; **Changes** lists active changes and shows the selected change's files, content and per-file diffs; **Archive** indexes archived changes and shows their historical files without treating them as active; **Settings** is the only TUI write surface. Use GHUI's compact list/detail navigation, keyboard selection, filtering, command discovery, and Esc drill-back as interaction inspiration, not as a dependency or pixel-level clone. Animate only observed progress changes; honor reduced motion and no-color terminals.
- Settings has a staged selection, named agent-profile checkboxes, a change preview, and **Apply** enabled only for a pending change. One Apply can install a named schema revision and its declared skills for the checked profiles, select active changes for migration, and then update the project default. A separate Settings action installs a selected schema-catalog MCP server for a chosen supported host after an explicit human provider-safety approval. No other TUI action edits artifacts, creates changes, applies tasks, validates by writing, archives, removes skills, or invokes a provider implicitly.
- The CLI exposes project/change/schema/resource inspection, diagnostics, archive browsing, and OpenSpec-backed create/status/instructions/validate/archive and explicit change-schema handoff. It ports the sibling package's list/validate/verify/install/enable, skills inspect/doctor/install/enable/disable, handoff, and MCP catalog/host-install behavior by capability, not syntax. No legacy alias contract. CLI mutations use exact targets, preview, freshness recheck, and explicit authorization; errors have nonzero exit codes and structured next actions. An explicit CLI skill disable is separate from switching and may remove only unshared, owned files after its own preview and confirmation; it refuses resources still needed by a pinned change. A CLI MCP install requires a usable TTY and interactive human provider-safety confirmation immediately before writing. Non-TTY/agent calls can inspect and preview but must refuse Apply and direct the user to Settings; no unattended flag supplies approval.
- Default read output is compact agent-oriented text; `--json` yields one versioned, deterministic envelope from the same snapshot. A command never prompts in noninteractive mode, silently selects one of several projects/changes/hosts, prints dashboard escape sequences into a pipe, or sends JSON diagnostics into stdout separately from its envelope. Mutations require an explicit target even when a sole change could be inferred for a read. Prefer few top-level commands and useful no-argument reads; freeze exact command grammar during OpenSpec specifications, not by preserving the old CLI. Implementation progress comes from explicit task checkbox status reported by OpenSpec apply instructions, never artifact existence; absent or unparsable task state displays Unknown, not a fabricated percentage.
- Artifact bodies are authored by an external editor/agent. The UI can browse, compare and reveal them, but cannot convert their text. The CLI can provide schema-specific instructions and a migration report, not claim to have rewritten artifacts it did not touch.

### Schema identity and visibility

- A schema's effective identity is its **named immutable revision** plus resolved source and a digest of every behavior-bearing file, including schema graph, instructions, templates and declared companion-resource manifests. A graph-changing or instruction/template-changing customization creates a new named revision, rather than silently overwriting a revision referenced by work. Show project/local/user/package resolution and shadowing before selection; drift of a referenced revision blocks mutation until resolved. Retain referenced revisions for active and archived changes.
- An OpenSpec change name remains its identity. Its `.openspec.yaml` is the authority for its current schema pin; do not add a second change UUID. Keep a versioned Opsx provenance sidecar beside the change so OpenSpec archiving carries it: original resolved revision/source/digest when known, append-only migration receipts with old/new references and validation outcome, and explicit `unknown` legacy origin. Never fabricate a creation revision from today's default. The UI shows `Created under`, `Current schema`, and a migration timeline. If OpenSpec metadata is changed externally, report divergence instead of silently rewriting the history.
- Installed skills and active skills are different sets. Switching schema never deletes installed skills. For each agent profile, show what is physically installed and what is active for new changes under the project default, or for a selected change under its pinned schema. An unmigrated change can still actively use its old schema's skills. Agent-profile targets (named agent/host bindings with real writable paths) are distinct from a schema manifest's default/recommended/all skill bundles; shared host resources cannot promise per-agent isolation.

### Switch, migration, and gate

- Preview resolves the destination revision, checks its full manifest and validation, detects profile/host targets, collisions and existing ownership, enumerates active changes, and computes a plan for checked migrations. Before updating the project default, preserve the effective old revision of any legacy unpinned active change; if it cannot be pinned without ambiguity, stop. Completed and archived changes stay historical. An unchecked pinned change remains under its old revision.
- Migration of a checked active change means a guarded schema-pin handoff and a provenance receipt, **not automatic artifact-body conversion**. Compare target artifacts, dependency graph, templates/instructions, and existing files; incompatible or unmapped content requires an external editor/agent to reconcile the artifacts and validate before the pin can move. An unsatisfied selected migration blocks the whole Apply preview; the user can uncheck it or resolve it. No `allow-incompatible` shortcut or partial success claim.
- Apply acquires a project-scoped Opsx mutation lock and rechecks a freshness token over the resolved schema content, config, pins, profiles, resources and relevant files. Stage writes, record a recovery journal, install schema and required profile skills, pin checked changes and legacy unpinned changes safely, then activate `openspec/config.yaml`. Compare expected bytes/identities before every guarded replacement and recheck authoritative state just before activation; external editors do not honor the Opsx lock. On conflict, error or interruption, do not leave a changed default with incomplete requirements; recover or report exact partial writes and resume/rollback actions. Postflight validates the effective schemas and selected changes. Reapplying an unchanged plan is a no-op. Do not remove old skills as rollback unless this operation created those exact resources and ownership is proven.
- Validation checks resolved schema structure, permitted artifact/workflow shape, readiness and strict change/spec validity for the selected change. CLI lifecycle mutations run the relevant gate; hooks/CI can run the same read-only check to detect direct external edits. This is **not** a universal sandbox for arbitrary editors or a runtime allowlist on retained skills. A change uses its pin, not merely the current project default. Drift, missing revision, unknown legacy provenance, and path/host collisions produce explicit findings rather than an invented pass.
- MCP install is a separate preview/apply path, not a side effect of switching. Only declared catalog entries and supported host targets are eligible; show server URL, permission/auth/read-only metadata, config path and replacement diff. Require explicit interactive human provider-safety approval at the point of installation; unsupported host, unsafe catalog, unknown approval, or conflicting unmanaged entry fails closed. Never infer consent from UI/catalog text.

## Architecture sketch

```text
Bun CLI command parser ----------+----> project snapshot / plans ----> JSON or compact output
                                 |
React OpenTUI (one renderer) -----+----> same domain operations
                                            |          |
                                      OpenSpec CLI   schema/resource catalog
                                      lifecycle     from ported package assets
                                            |
                               project files + per-change provenance
```

The snapshot separates live active changes, archived records, schema catalog/resolution and resource installation. Archive uses a bounded, read-only archive index instead of running active-change status on an archived path. File viewers handle large/binary/missing files safely, bound diff output, and keep navigation responsive. File changes invalidate pending previews; debounced filesystem events plus periodic reconciliation keep display fresh, while an Apply always rereads authoritative state.

## Delivery units

Each unit is a later implementation slice, not work performed by this planning document. Preserve unit IDs if the plan is reordered.

### U1. Source parity and authority contracts

Inventory each source command/resource and map it to a new Opsx operation or OpenSpec delegation without dropping behavior; fix the supported OpenSpec CLI range and Bun/OpenTUI runtime/platform contract from real package APIs. Define project-root resolution, active/archive discovery, command help, read/mutation ownership, versioned JSON and compact output, and exit statuses. **Proof:** a capability matrix covers the source installer, diagnostics, skills, MCP, handoff and view with no unaccounted capability, and sample commands distinguish missing root, sole read target, multiple targets and invalid flags.

### U2. Schema revisions, provenance and archive

Resolve source precedence, digest behavior-bearing schema assets, retain immutable named revisions, detect same-name drift/shadowing, record known/unknown creation provenance and migration receipts alongside the change, and index archive records safely. **Proof:** a template-only edit changes identity; an old pin survives a default switch; an archived record retains its provenance and viewable revision; an unpinned legacy change cannot be silently reinterpreted.

### U3. Agent CLI and validation

Build a Bun ESM command interface over one domain snapshot and OpenSpec-backed lifecycle adapter. Explicit read defaults, preview/freshness/confirmation, structured errors and the artifact/workflow validation gate cover both direct CLI writes and external edits later checked by CI. **Proof:** TTY/non-TTY output and JSON agree; absent/malformed task status reads Unknown; stale preview, unsupported OpenSpec version, invalid artifact and ambiguous mutation refuse with actionable errors; real OpenSpec create/instructions/validate/archive exercise their supported contracts without claiming a second lifecycle engine.

### U4. Resource installation and schema migration

Implement named profile target resolution, schema/skill install and ownership checks, selected-change handoff, legacy pin preservation, recoverable multi-file Apply, and separately approved MCP host installation. **Proof:** schema and skills are ready before default activation; unchecked changes stay pinned; incompatible selected migration blocks before mutation; a concurrent write after preview is detected; injected interruption at each write boundary recovers or reports exact partial state; old skills remain installed after a switch; explicit disable protects shared/pinned resources; non-TTY MCP Apply refuses and interactive provider approval cannot be bypassed.

### U5. React OpenTUI dashboard

Build the four tabs and file viewer as a client of U1-U4, with GHUI-inspired focus and keyboard behavior. Only Settings exposes schema Apply and MCP installation; reads render active and archive models distinctly. **Proof:** launch actual Bun/React TUI, navigate and inspect files, see accurate planning/task progress, stage and apply a schema/profile selection, and verify no other tab writes. Check reduced motion, no-color, missing files and terminal resize.

### U6. Port parity and release documentation

Compare every inventoried source capability against the new CLI, verify live help and agent-readable command reference from the same contract, document old-to-new commands without installing legacy aliases, and test the supported runtime/platform matrix. **Proof:** parity matrix has no unaccounted capability, real CLI and TUI smoke scenarios pass, and the new package can run independently of the sibling checkout.

## Risks and scope boundaries

- OpenSpec 1.12.0 is installed here while the sibling package declares `^1.13.0`; determine a tested supported range before promising command flags or JSON shape. Archive CLI may have interactive behavior requiring an Opsx-owned preview/confirmation layer.
- Schema resolution is name-based and project-local schemas can shadow user/package schemas. A content digest is evidence of drift, not a replacement for retaining immutable revision files.
- The old package's skills `default/recommended/all` are resource bundles, not agent-profile identities. Host-shared installs cannot be represented as isolated per-agent state.
- No automatic artifact text conversion, no runtime skill-use prohibition, no multi-project dashboard, no silent host/runtime installation, no copying source Node/CommonJS UI code as the new runtime, and no automatic MCP install on schema selection. Explicit CLI skill disable may exist for parity but schema switching never invokes it.
- No application code or runtime configuration is changed by this plan. The forthcoming OpenSpec change will refine exact interfaces and acceptance scenarios before implementation.

## Sources for the next planner

- `../openspec-schemas/README.md`, `AGENT_INSTALL.md`, `bin/opsx-schema.js`, `bin/change-schema.js`, `bin/opsx-skills.js`, `openspec/schemas/*/{schema.yaml,skills.txt,mcp.yaml}`: existing capabilities and limits.
- `openspec/config.yaml`, `openspec/schemas/compound-intent-driven/schema.yaml`: current project's workflow.
- OpenSpec CLI `list`, `status`, `instructions`, `validate`, `archive`, `schema which` and `--help`: lifecycle and resolution contracts; test the chosen supported version rather than assuming all flags are stable.
- [GHUI](https://github.com/kitlangton/ghui) for navigation inspiration; [gh-axi](https://github.com/kunchenguid/gh-axi) for agent-oriented command/help conventions; OpenTUI React documentation for actual renderer and widget capabilities.

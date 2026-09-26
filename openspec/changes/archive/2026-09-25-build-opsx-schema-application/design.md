# Context

This repository has OpenSpec schema/configuration and reviewed planning records (`docs/plans/plan.md`, `adr/0001`–`0003`) but no application package. The sibling `../openspec-schemas` supplies Node/CommonJS schema catalogs and installation, guarded skills, MCP catalog/host writes, diagnostics, metadata-only handoff and an optional imperative read-only viewer; it is the capability source, not the new runtime. OpenSpec CLI resolves schemas and owns changes, artifact instructions, validation and archive. Installed OpenSpec is 1.12.0 while the sibling declares `^1.13.0`; a compatibility matrix must precede implementation assumptions.

The proposal and five capability specs define the observable contract. The schema here is `compound-intent-driven`. Project default, effective change pin, schema source/digest and Opsx provenance are distinct facts; never conflate a `planningHome.defaultSchema` fallback with the configured project default.

# Goals / Non-Goals

**Goals:** One Bun ESM TypeScript/TSX application with a simple noninteractive CLI and a React OpenTUI dashboard; complete behavioral parity with sibling resources; OpenSpec-backed lifecycle; immutable schema revision/history; recoverable profile-aware switch; distinct human-approved MCP install; effective-schema artifact/workflow validation.

**Non-Goals:** Replacing the sibling package, retaining legacy flags, a second lifecycle engine, TUI artifact editing or lifecycle mutations outside Settings, automatic artifact-body conversion, skill-use sandboxing, automatic old-skill removal during a switch, implicit MCP/provider install, or a multi-project dashboard.

# Decisions and Guardrails

1. **Authority and presentation:** Implement a domain snapshot that records raw OpenSpec results separately from presentation projections. The CLI and TUI consume the same read operations. Use OpenSpec commands for active lifecycle semantics and a bounded read-only archive index for archived directories. A missing/invalid task artifact yields Unknown, never task progress inferred from an artifact's existence. Prefer a minimal command tree with useful no-argument reads; example families are `status`, `changes [name]`, `archive [name]`, `schemas [name]`, `doctor`, `change <new|instructions|validate|archive|schema>`, `skills <inspect|install|disable>`, and `mcp <list|inspect|install>`. Freeze exact help and flags in one command-contract source, not two duplicated docs. This follows ADR 0001; a parallel OpenSpec engine was rejected.
2. **Noninteractive mutation protocol:** Preview returns exact targets, resulting state, diagnostics and a freshness identifier; Apply requires an explicit target and confirmation tied to that preview, reacquires authoritative state, and rejects stale or ambiguous requests. CLI output has one versioned JSON envelope or compact text, never a partial JSON stream or TTY prompt in non-TTY mode. Lifecycle archive needs an Opsx-owned preview before invoking OpenSpec archive; do not mistake `--json` for authorization. MCP is exceptional: CLI read/preview works noninteractively, but installation needs a usable TTY and immediate human provider-safety approval; otherwise fail closed with a Settings route.
3. **Schema revision identity:** Catalog entries bind immutable named revisions to resolved source/content digest over graph, templates, instructions and resource manifests. Project-local shadows and same-name drift are surfaced; a referenced revision is retained and OpenSpec-resolvable. An out-of-band edit cannot be prevented universally, so it is detected and mutation is blocked rather than silently changing a pinned change. No extra per-change UUID (ADR 0002).
4. **Provenance and handoff:** Store versioned Opsx provenance inside each change directory so archive carries it. Current schema comes from OpenSpec metadata; known creation revision and append-only migration receipts come from Opsx. Record Unknown for legacy creation when no trustworthy evidence exists. At a default switch, preserve the old effective revision of unpinned active changes before config activation, or refuse. A checked active change migrates only if target graph, instructions/templates and existing content are reconciled and validation succeeds. The handoff changes its pin and records a receipt; external editor/agent owns content changes. Completed/archive records never migrate.
5. **Profile/resource boundary:** Named agent profiles resolve to concrete host paths; source schema skill bundles `default/recommended/all` are a separate dimension, not checkbox identities. Deduplicate shared host writes and disclose sharing. Install destination schema and skills before activating config. The project-scoped Opsx lock coordinates Opsx processes; compare file identities immediately before guarded writes because external editors do not use the lock. Stage/journal operations, recover or report exact partial state, and recheck before activation. A switch never invokes skill disable. Explicit CLI disable has its own guarded preview and protects shared/pinned resources; it may remove only safe, owned, unneeded files. MCP installation is a separate approved host write (ADR 0003).
6. **Validation boundary:** Validate the selected change against its effective pinned revision with OpenSpec schema and strict change validation plus Opsx revision/resource integrity checks. Expose the same read-only gate to hooks/CI. Validation does not claim to restrict arbitrary editor writes or invocation of retained skills. A finding is not suppressed by choosing a different project default.

```text
             CLI read / explicit preview+Apply       React OpenTUI
                       |                                |
                       +---------- domain API ---------+
                                    |        |        |
                               OpenSpec  catalog   provenance/archive
                               lifecycle resources index
                                    |        |        |
                                  project files and guarded host targets
```

# Implementation Units

Stable IDs match `docs/plans/plan.md`. A unit's path claim identifies future code ownership; it does not assert those paths already exist. Batches are dependency-ordered. Tests named below are future verification, not artifacts created in this planning pass.

### U1. Capability parity, project resolution and domain snapshot
- **Delivers:** Complete sibling capability map; OpenSpec compatibility checks; one read contract for active/archive/schema/resources/diagnostics and command help.
- **Batch:** A.
- **Layer:** Runtime boundary and domain reads.
- **Depends on:** None.
- **Path claim:** `package.json`, `bun.lock`, `src/domain/`, `src/openspec/`, `src/catalog/`, `test/domain/`.
- **Proof:** Run actual Bun CLI reads against initialized, missing and ambiguous project roots; verify source parity matrix and OpenSpec version rejection; archive is not queried through active status.
- **Continuation:** Publish tested CLI/version contract and snapshot fixture before mutation units depend on it.

### U2. Revision, provenance and archive retention
- **Delivers:** Immutable source/content identity, drift/shadow detection, creation/migration sidecar, safe archive index and legacy provenance model.
- **Batch:** B.
- **Layer:** Schema/change domain.
- **Depends on:** U1.
- **Path claim:** `src/revisions/`, `src/provenance/`, `src/archive/`, `test/revisions/`, `test/archive/`.
- **Proof:** Template-only edit changes identity; same-name shadow fails closed; archived change retains provenance and referenced revision; legacy origin remains Unknown; unpinned change old effective revision is captured before a default switch.
- **Continuation:** Return the revision identity and provenance format plus unresolved legacy cases before any switch implementation.

### U3. Agent CLI lifecycle and validation
- **Delivers:** Compact/JSON projections, contextual help, OpenSpec lifecycle commands, preview/freshness protocol and effective-schema validation.
- **Batch:** B (after U1; consumes U2 identity for pin-aware gate).
- **Layer:** CLI and validation.
- **Depends on:** U1, U2 for mutation gate.
- **Path claim:** `src/cli/`, `src/validation/`, `test/cli/`, `test/validation/`.
- **Proof:** Exercise real create/instructions/strict validate/archive paths, non-TTY help/JSON, missing/ambiguous target, stale preview, missing revision, invalid artifact and hook-style read-only check; do not infer task progress from file existence.
- **Continuation:** Freeze command contract and versioned response schema before TUI integration.

### U4. Profile-aware switch and MCP resources
- **Delivers:** Concrete profile mapping, schema/skills install, checked migration and legacy pin preservation, coordinated recoverable Apply, separately approved MCP host install and guarded explicit disable.
- **Batch:** C.
- **Layer:** Mutations/resource adapters.
- **Depends on:** U2 and U3.
- **Path claim:** `src/resources/`, `src/switch/`, `src/mcp/`, `test/resources/`, `test/switch/`.
- **Proof:** Execute successful and collision switches; selected incompatible migration refuses before write; unselected/archived work and installed skills persist; a concurrent external edit after preview is detected; interruption at each guarded write boundary recovers or precisely reports partial state; non-TTY MCP Apply refuses while interactive provider approval targets exactly one entry.
- **Continuation:** Record recovery semantics and host/profile matrix before enabling Settings Apply.

### U5. Four-tab React OpenTUI dashboard
- **Delivers:** Bare-TTY entry, GHUI-inspired list/detail/keyboard navigation, separate artifact/task progress, active/archived file viewer, staged Settings and approved Apply backed by U1-U4.
- **Batch:** D.
- **Layer:** Terminal UI.
- **Depends on:** U1-U4.
- **Path claim:** `src/tui/`, `test/tui/`.
- **Proof:** Launch actual Bun/React renderer; navigate four tabs, inspect files/diffs, test absent/binary/oversized content, reduced motion, no-color/resize, valid Apply and stale-preview refusal; read-only tabs leave files untouched.
- **Continuation:** Provide terminal interaction evidence and any unsupported platform finding before release.

### U6. Release parity, help and user-facing migration map
- **Delivers:** Every source capability accounted for, old-to-new command guidance, one live help/agent reference contract and supported runtime matrix.
- **Batch:** E.
- **Layer:** Integration/documentation.
- **Depends on:** U1-U5.
- **Path claim:** `docs/`, `test/integration/`, package release metadata.
- **Proof:** New package runs without sibling checkout; every capability in the source inventory is exercised or delegated; real CLI/TUI smoke paths and supported runtime/platform checks pass; no old syntax shim is required.
- **Continuation:** If a capability cannot be ported safely, return the exact conflict for user decision rather than silently excluding it.

# Verification Strategy

Run scenario proofs for each capability spec, with temporary initialized projects and explicit host-config fixtures. Compare real OpenSpec command output with snapshot projections; include both installed 1.12.0 and any higher declared supported version before claiming a range. Exercise CLI help/JSON/TTY, archiving, schema resolution, manifest-derived skills and provider refusal. Fault-inject crash/conflict at each composite write boundary; inspect actual files and recovery report. Exercise the actual Bun/React terminal UI, not only models. Validate this change with `openspec validate build-opsx-schema-application --type change --strict` after planning artifacts; implementation later uses the same strict gate plus relevant Bun checks. No executable-spec harness is added solely for planning.

# Risks / Trade-offs

- OpenSpec commands and JSON contracts vary by version; compatibility evidence is a prerequisite for the implementation adapter.
- Schema source precedence, name-only pins and legacy unpinned changes can reinterpret work. Retention, drift checks and a safe refusal are necessary even when a graph looks compatible.
- Host-shared skills and MCP config cannot provide per-agent isolation. Real host/path detection, provider approval and managed/unmanaged collision policy are required.
- Multi-file installation cannot be promised atomic across uncooperative external editors or power loss; a journal, guarded writes and honest recovery state are required. Never label partial work as switched.
- A validation gate reports schema/workflow violations but cannot police an arbitrary agent's tool or skill use.

# Open Questions

No user decision currently blocks the proposed product scope. Exact CLI syntax, supported OpenSpec/Bun/OpenTUI version range, named-profile manifest shape and per-host adapters are engineering decisions to settle with U1 evidence and record before implementation. Do not quietly drop a sibling capability when selecting those details.

# Next Handoff

`openspec instructions adr --change "build-opsx-schema-application" --json`

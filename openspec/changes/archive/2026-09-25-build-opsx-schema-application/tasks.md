## 1. Project and agent read contract

- [x] 1.1 [U1] Deliver a standalone Bun CLI that resolves a project and exposes truthful project, change, schema, resource, diagnostic and archive reads with compact and versioned JSON output.
  - Batch: A; first slice.
  - Layer: Runtime adapter and domain read API.
  - Path claim: `package.json`, `bun.lock`, `src/domain/`, `src/openspec/`, `src/catalog/`, `test/domain/`.
  - Proof: Run the actual Bun CLI from initialized, missing and ambiguous project roots; compare compact/JSON facts, prove incompatible OpenSpec rejection and inventory every sibling capability against a new operation or delegation.
  - Continuation: Return supported OpenSpec CLI versions, source parity inventory and domain snapshot shape before mutation work.

## 2. Revision-safe historical inspection

- [x] 2.1 [U2] Deliver schema source and content identity, detectable drift, per-change creation and migration history, safe archive browsing and legacy Unknown provenance.
  - Batch: B; after 1.1.
  - Layer: Schema/change domain and archive read model.
  - Path claim: `src/revisions/`, `src/provenance/`, `src/archive/`, `test/revisions/`, `test/archive/`.
  - Proof: Inspect a known migrated change and an archived record, a legacy change of unknown origin, same-name shadow and template-only drift; refuse escaped archive paths and preserve an unpinned change's old effective revision.
  - Continuation: Return provenance format, retained revision identity and any legacy-pinning blockers before 3.1 and 4.1.

## 3. Delegated lifecycle and external-edit gate

- [x] 3.1 [U3] Deliver noninteractive OpenSpec-backed create, status, instructions, strict validate, archive and schema-handoff commands with preview/freshness checks and effective-schema hook validation.
  - Batch: B; after 2.1.
  - Layer: CLI and validation integration.
  - Path claim: `src/cli/`, `src/validation/`, `test/cli/`, `test/validation/`.
  - Proof: Run real lifecycle commands on fixture projects; reject stale archive preview, missing pinned revision, invalid external artifact and ambiguous/non-TTY mutation; verify read-only hook output and `openspec validate build-opsx-schema-application --type change --strict` after any behavior-spec edit.
  - Continuation: Return exact CLI command contract and versioned output envelope before Settings integration.

## 4. Safe schema and provider changes

- [x] 4.1 [U4] Deliver a profile-checkbox schema switch that installs declared skills, preserves unchecked changes and old skills, migrates only validated selected active changes and recovers interrupted Apply.
  - Batch: C; after 3.1.
  - Layer: Guarded resources and project mutation transaction.
  - Path claim: `src/resources/`, `src/switch/`, `test/resources/`, `test/switch/`.
  - Proof: Apply a compatible switch through the real CLI; demonstrate a profile collision, incompatible selected migration, unpinned legacy preservation, stale/concurrent edit rejection, repeated no-op and recovery from each write boundary. Verify explicit skill-disable cannot remove a shared or pinned resource.
  - Continuation: Return transaction/recovery state and exact profile/host mappings before Settings Apply.

- [x] 4.2 [U4] Deliver separate catalog-backed MCP inspection and human-approved host installation with exact preview and non-TTY refusal.
  - Batch: C; after 3.1, independent of 4.1's host writes.
  - Layer: Provider catalog and guarded host configuration.
  - Path claim: `src/mcp/`, `test/mcp/`.
  - Proof: Inspect declared MCP entries and host diffs; an unattended Apply with any approval flag leaves host config unchanged, while an interactive exact-target approval installs only the selected safe entry; unknown provider/host and conflicting config fail closed.
  - Continuation: Return the provider-safety approval path and host support matrix before wiring Settings MCP control.

## 5. Human terminal dashboard

- [x] 5.1 [U5] Deliver a four-tab React OpenTUI dashboard with real keyboard/file/diff/archive browsing, honest artifact/task progress, read-only non-Settings tabs and staged Settings Apply.
  - Batch: D; after 4.1 and 4.2.
  - Layer: Terminal user interface over domain and mutation API.
  - Path claim: `src/tui/`, `test/tui/`.
  - Proof: Launch bare `opsx-schema` in a real TTY; navigate Overview/Changes/Archive/Settings, inspect active and historical files, show Unknown task state, reject stale preview, apply a checked profile change and interactive MCP install, confirm other tabs do not write, exercise resize/no-color/reduced-motion.
  - Continuation: Return interaction transcript and any unsupported renderer/platform issue before package release.

## 6. Standalone delivery and migration guidance

- [x] 6.1 [U6] Deliver a distributable package whose live help and user/agent command guide cover every inventoried sibling capability without requiring the sibling checkout or retaining legacy syntax.
  - Batch: E; after 5.1.
  - Layer: Integration and documentation.
  - Path claim: `docs/`, `test/integration/`, package release metadata.
  - Proof: Install/run the package alone, exercise each parity-matrix operation or OpenSpec delegation, compare live help to compact/JSON behavior, smoke-test both CLI and real TUI, verify supported runtime matrix and run `openspec validate build-opsx-schema-application --type change --strict` after any behavior-spec edit.
  - Continuation: Return complete parity evidence and exact blocker for any unported capability; never check this item for partial delivery.

## Next Handoff

`openspec validate build-opsx-schema-application --type change --strict`

## Context

The smoke test found two independently actionable lifecycle limits. `prepareBundledSchema` in `src/bundled/index.ts` compares an installed same-name tree with the current bundled manifest and returns only `missing`, `intact`, or `collision`; `installBundledSchema` refuses changed trees. OpenSpec changes pin schema **names** in `.openspec.yaml`; Opsx's retained snapshots in `src/revisions/index.ts` preserve bytes for inspection, but `checkRevision` still resolves the live name and marks a changed same-name tree as drift. ADR 0002 already rules out overwriting referenced revisions. In a disposable project, `openspec schema fork <source> <new-name>` created a distinct named schema, rewrote `schema.yaml:name`, and validated without changing the old tree or default.

`SwitchRequest` in `src/switch/index.ts` separately selects named agent `profiles` and native `skillHosts`; an explicit switch uses these to install skills but does not persist the selection for future changes. `createChange` in `src/cli/index.ts` records the schema revision only. `scanLocalActivePins` in `src/resources/index.ts` reads schema names without per-pin selections, so `requiredSkillTargets` reports `RESOURCE_PIN_PROFILE_ASSOCIATION_UNKNOWN` and guarded disable refuses. The same module already resolves a supplied `ActiveSkillPin` with a schema root, named profiles, and bundle, but not native host IDs. ADRs 0001 and 0003 require OpenSpec authority, exact previews, retained old skills, freshness checks, and recoverable guarded writes. The proposal…

## Goals / Non-Goals

**Goals:**

- Make a newer bundle useful without changing the old named schema's operational behavior: an explicit, collision-free new schema ID and a separate guarded default switch.
- Make newly CLI-created pins' exact named-profile, native-host, and bundle selection inspectable and usable by doctor and skill-disable guards; permit evidence-backed reconciliation of unknown legacy pins.
- Preserve no-op, fail-closed, freshness, and partial-write reporting contracts.
- Make OpenCode, OMP, Pi, Atomic, and Senpi independently inspectable and usable for compatible schema workflow adapters, native managed skills, and declared safe MCP servers; keep the OpenSpec schema name/pin host-independent.

**Non-Goals:**

- In-place same-name upgrades of referenced schemas, automatic change migration, historical profile inference, or removal of retained skills.
- Changing OpenSpec's schema resolver, MCP provider-safety approval rules, TUI layout, or incomplete-change validation.
- Promoting optional Gemini/Codex/Claude named profiles to first-class host status, silently installing a third-party Pi extension, or claiming actual provider reachability from a config entry.

## Selected Direction

1. **Bundle alias installation.** Extend `prepareBundledSchema`/`installBundledSchema` and `schemas install` with an explicit destination name, e.g. `--as intent-driven-design-next`. Continue verifying source files against the packaged manifest before planning. Build the destination snapshot by changing only `schema.yaml`'s declared `name` to that validated ID; retain both the original bundle-source digest and the transformed installed-content digest. Reject invalid names, any existing conflicting destination or external same-name shadow, and stale preview/source bytes. Show source ID/version, transformed digest, exact destination, old pinned/default references, and that no default or pin will be edited. An identical installed target remains a no-op. Stage the new tree outside the live schema name, validate the transformed graph and templates using OpenSpec, then publish to the unused destination with no replacement of an existing tree; verify again. On a failed publish, report exact owned partial state and never claim an upgrade or delete unowned content. Reuse the existing separate `schema switch` for default activation and selected migrations.
2. **Recorded default resource selection.** After a successful guarded `schema switch`, persist the *explicit* selected named profile IDs, native host IDs, and skill bundle with the effective destination `RevisionRef` and manifest/profile identities in a project-owned selection receipt. Include the receipt in switch preview, freshness, journal/recovery, and no-op semantics. Do not manufacture a selection for prior switches, direct skill installs, or a different schema revision. A switched project without an applicable verified receipt must supply an explicit selection at change creation.
3. **Per-change association.** Extend `CreateChangeInput` and the `change create` CLI with named-profile and native-host selection (and bundle when applicable). `buildCreatePlan` resolves an explicit selection, or a matching verified project-selection receipt, against the exact schema revision, current declarations, profile manifest, native host catalog, and installed target ownership/health. Bind the resolved selection and digest inputs to its preview token. Record it alongside `recordCreation` in the change-local Opsx provenance sidecar, tied to the current OpenSpec pin and revision. If OpenSpec creation succeeds but receipt finalization fails, report `CREATE_PARTIAL`, leave the change intact, and retain the unknown-association guard; do not silently claim a healthy pin. A schema with no declared skills needs no invented profile selection.
4. **Read and reconcile.** Replace the bare local scan path with a read-only association resolver that reads each active change's `.openspec.yaml` and versioned provenance, verifies the pin/revision and receipt identities, and supplies the existing `ActiveSkillPin` resolver. Extend target derivation for native skill-host IDs as well as named profiles; deduplicate genuinely shared physical targets, never infer selected targets from the inventory alone. Unknown, stale, conflicting, or malformed association evidence keeps doctor and disable fail-closed with a specific diagnostic. Add an exact-target CLI reconciliation preview/apply for an existing active pin: caller selects profile IDs, native hosts, and bundle; preflight the exact current revision, declared skills, installed owned targets, and expected sidecar bytes, then write one guarded association receipt. Do not amend OpenSpec's schema pin or unrelated planning readiness. Archived changes do not hold active-skill targets but retain their history.

5. **Five-host projection and provider support.** Keep schema installation host-independent. Extend the existing shared prompt/command adapter registry to OMP, the native skill-host registry and Settings/CLI selection to OpenCode/Pi/Senpi, and MCP host adapters to Pi (only when the separately installed adapter is verified) and Senpi (native HTTP config). Report three independent capability states per host and project; preview and confirm each provider independently. Use the matrix below for exact paths, safety boundaries, and observable verification, not generic profile assumptions.

## Implementation Guardrails

### Five-host capability boundaries and target matrix

OpenSpec owns one schema tree at `<project>/openspec/schemas/<name>` regardless of agent host. `assets/schemas/manifest.json` binds bundled schema source identity; `assets/adapters/manifest.json` separately binds the existing compound workflow prompt package. Extending project-scoped prompt/command adapters to OMP does not transform every OpenSpec schema into five dialects. Workflows are projected only when a schema actually ships the corresponding adapter bundle. Native skill targets are another independent registry; a selected named profile is not a native host ID. The candidate target matrix, with paths verified against host documentation and existing repo surfaces, is:

| Host | Schema workflow adapter target | Native skill root | Schema-declared HTTP MCP config |
| --- | --- | --- | --- |
| OpenCode | `.opencode/commands` | `.opencode/skills` | existing `opencode.json(c)` or `.opencode/opencode.json(c)`, `mcp` with `type: remote` |
| OMP | `.omp/commands` | `.omp/skills` | `.omp/mcp.json`, `mcpServers` with `type: http` |
| Pi | `.pi/prompts` | `.pi/skills` | project `.mcp.json`, `mcpServers`, only with verified Pi MCP adapter prerequisite |
| Atomic | `.atomic/prompts` | `.atomic/skills` | project `.mcp.json`, `mcpServers` with `url` |
| Senpi | `.senpi/prompts` | `.senpi/skills` | `.senpi/mcp.json`, `mcpServers` with `type: http` |

The skill roots are backed by OpenCode, OMP, Pi, Atomic, and Senpi host documentation (respectively `opencode.ai/docs/skills/`, `omp.sh/docs/skills/`, `pi.dev/docs/latest/skills`, `github.com/ben-vargas/ai-atomic/.../README.md`, and `github.com/code-yeongyu/senpi/.../docs/skills.md`). Installed skill shape is `<root>/<skill>/SKILL.md`; Pi, Atomic, and Senpi have project-trust gates that a static path check cannot bypass. Existing `src/resources/index.ts` supports only OMP and Atomic native skill IDs; `src/tui/settings.tsx` exposes only these two host rows. Add the other three to the same registry and surface, not as one-off profile mappings. Validate path kind, symlinks, aliases, sharing with `.agents/skills`, ownership, and each host's actual discovery/trust behavior. Do not claim running host discovery solely from directory existence.

`src/adapters/index.ts` currently maps OpenCode, Pi, Atomic, and Senpi to the above command/prompt paths and refuses modified/unowned files. Add OMP using its verified project command projection convention (`.omp/commands`) and preserve the adapter package source/digest, exact-file collision, stale preview, and non-overwrite behavior. A schema without those workflow adapters is not advertised as having them; projection install does not change a pin or the OpenSpec schema.

`src/mcp/index.ts` currently supports config installs for OpenCode/OMP/Atomic, a guided-only Pi mode, and no Senpi. Its existing catalog `resources/openspec/schemas/intent-driven-design/mcp.yaml` declares two read-only, no-auth HTTPS servers (`inspo`, `ui-skills`); schema metadata is not a live security or network attestation. Senpi documents project `.senpi/mcp.json` and remote HTTP (`github.com/code-yeongyu/senpi/blob/main/packages/coding-agent/docs/mcp.md`); add only the catalog-compatible HTTP form, preserve unrelated entries, and refuse conflicts. Pi core lacks MCP but the opt-in `pi-mcp-adapter` (`pi.dev/packages/pi-mcp-adapter`, upstream README) loads a project `.mcp.json` and handles remote HTTP. Do not install or grant the extension automatically: verify its presence and compatible transport at the point of host install, otherwise return `prerequisite-needed` rather than installed. Pi and Atomic share `.mcp.json`; plan a single read/merge with independent per-provider ownership and exact diff so neither adapter overwrites the other's entries. Catalog browsing and native skill installation do not constitute provider approval.

Extend the existing CLI host unions/choices and versioned read projections alongside these registries; show per-host `workflow`, `skills`, and `mcp` status independently. Install all declared server/host pairs only through the existing per-target TTY approval, catalog/config snapshot recheck, exact preview token, and explicit human decision. A config write proves configured state, not server availability. Where a host is absent, untrusted, lacks its adapter, or cannot represent a declared transport, preserve an actionable blocked status instead of claiming five-host completion.


- OpenSpec remains the authority for schema identity, graph, validation, change creation, and pins. A source manifest digest is not the installed alias digest; both must be independently identified in read output. Do not reinterpret retained snapshots as an alternate live resolver.
- `schema.yaml`'s name must equal the destination ID. Reject symlinks, unsafe paths, unresolved shadows, content/ownership collisions, and source or target drift at Apply. Do not turn `--as` into a force overwrite.
- Profile IDs and native skill-host IDs are different namespaces. All five host IDs (OpenCode, OMP, Pi, Atomic, Senpi) must resolve from verified native roots; Gemini, Codex, and Claude remain optional named profiles. A known empty selection is valid only when the schema declares no required skills, not as a fallback for missing evidence.
- Keep the versioned change provenance sidecar the sole per-change Opsx receipt; validate optional new association fields when reading legacy records rather than assigning historical choices. Guarded disable still protects old active pins and shared targets. Any new project selection receipt is coupled to the switch transaction so an interrupted switch cannot advertise an uninstalled target as selected.
- Preserve existing `--apply-token` exact-target and freshness patterns. The new resource-reconciliation operation is not an MCP approval path. This planning revision touches no provider config; a later approved implementation may add Pi/Senpi config installs only via the existing provider-specific human safety gate.

## Alternatives Considered

- Replace a same-name schema after retaining old bytes: rejected because OpenSpec name-only pins would resolve new content while `checkRevision` would report drift, even with a retained snapshot.
- Permit same-name replacement only when no references remain: safe in principle, but needs a new ownership baseline and complete active/archived/inherited reference audit; distinct names meet the observed upgrade need without weakening immutable revisions.
- Treat all installed skill roots as an active change's selection: rejected because installation proves neither per-change intent nor exact bundle and can under- or over-protect deletion.
- Require profile flags for every new change: safe but unnecessarily ignores a recorded, verified schema-switch selection; explicit flags remain the path for older projects without such a receipt.

## Risks / Trade-offs

- Additional schema names are visible in OpenSpec catalogs; require the caller to choose an ID and use the existing explicit default-switch operation. No automatic cleanup of old revisions while pins/archive may reference them.
- Alias transformation changes `schema.yaml` bytes and installed digest. Preview and receipts must show the difference; file-level packaged manifest verification still applies to the original source, not to transformed output as if it were untouched.
- Project-selection and per-change receipts may be interrupted after other writes. Reuse switch journaling and `CREATE_PARTIAL` patterns; keep doctor/disable blocked until repaired, with no silent roll-forward.
- A host root can be shared with a profile root. Map actual physical targets and maintain existing sharing guards rather than count selected IDs as independent installations.
- Pi requires a separately installed third-party MCP adapter; do not silently install or trust it. Pi/Atomic can share `.mcp.json`, so an unchanged individual provider must not mask a conflicting shared file. Senpi HTTP support does not imply other Senpi transport/auth support; keep the catalog restriction explicit.

## Migration Plan

1. Preserve all existing installed schemas and provenance; no bulk rewrite. A changed bundle is offered under a new explicit name and only the selected new ID can later become default.
2. Future successful schema switches record selections for their exact revisions; older projects lacking a receipt supply explicit creation flags or complete a reviewed selection operation. New creation snapshots verified selection into its own change record.
3. Legacy active pins without association remain unknown and disable-blocking until explicitly reconciled. Archived records are not assumed to require active skill targets. Report doctor readiness and incomplete-change validation independently.
4. Validate install collision/no-op/alias and pinned-old-revision behavior in an isolated OpenSpec project; separately exercise switch → CLI create → doctor → guarded disable and stale/legacy reconciliation. A project with intentionally incomplete artifacts still fails aggregate verify for that independent reason.
5. In that isolated project, install one compatible schema workflow adapter and managed skill for each of the five hosts, then confirm each host's native discovery/trust behavior. Preview and (only after separate human approvals) install both declared catalog servers into all five supported host integrations; for Pi verify the adapter prerequisite, for Pi/Atomic verify `.mcp.json` merge/no-op, and for Senpi verify native HTTP config. Repeat with Pi adapter absent: no config mutation or installed-state claim. No live-provider connectivity claim is required from config alone.

## Open Questions

- None blocking the proposal. Exact CLI spelling and receipt JSON field names can follow existing command and versioned sidecar conventions during implementation, provided all named scenarios and safety invariants hold.

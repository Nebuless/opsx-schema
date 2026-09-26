## 1. Preserve revision identity while upgrading bundled schemas

- [x] 1.1 Extend `src/bundled/index.ts` and `src/cli/index.ts` schema inspection/install commands with an explicit collision-free destination ID and exact source-versus-installed digest preview; preserve the original named schema, default and pins, and fail on invalid name, symlink/shadow, changed target or stale source. Exercise identical-target no-op, source drift and conflicting-alias refusal in an isolated OpenSpec project.
- [x] 1.2 Update revision inventory/provenance (`src/revisions/index.ts` and relevant CLI read surfaces) to distinguish bundled source identity from transformed installed name/content; exercise an old active and archived pin resolving its original named revision after a newer alias is installed, and a later separately approved default switch.

## 2. Project all five hosts as distinct schema resource targets

- [x] 2.1 Add the OMP native workflow-adapter target to `src/adapters/index.ts`, sharing the existing package's schema-declared `opsx-ce-*` source adapters and preflight/ownership checks. Exercise discovery of a compatible prompt in OMP without treating an OpenSpec schema name as an OMP-native schema or installing adapters from a schema without an adapter bundle.
- [x] 2.2 Extend `src/resources/index.ts`, `src/skills/index.ts`, host selection commands and Settings to resolve verified native skill destinations for OpenCode (`.opencode/skills`), OMP (`.omp/skills`), Pi (`.pi/skills`), Atomic (`.atomic/skills`) and Senpi (`.senpi/skills`), independent of optional named agent profiles. Preserve exact per-host preview, shared-target collision protection and trust/discovery diagnostics. In an isolated project, install a declared skill for each host and exercise each host's discovery contract; verify an unsafe/unavailable destination mutates nothing.

## 3. Preserve exact host and profile association through change creation

- [x] 3.1 Extend `src/switch/index.ts` transaction receipts, `src/cli/index.ts` change creation and `src/provenance/index.ts` with versioned, verified project selection and per-change records for schema ID/content, named profiles, five native host IDs and bundle; do not infer historical choices. Exercise explicit selection and default-inherited creation after a switch, alongside no-skill schemas and interrupted writes.
- [x] 3.2 Replace the bare `scanLocalActivePins` path in `src/resources/index.ts` with verified read-only association resolution and exact-target reconciliation for legacy active pins. Exercise doctor and guarded skill-disable across known five-host pins, shared targets, absent association, stale evidence and intentionally incomplete artifacts. Unknown association must block unsafe deletion without masking unrelated readiness failures.

## 4. Support declared MCP providers without weakening approval

- [x] 4.1 Extend `src/mcp/index.ts` host catalog and safe preview/apply for Pi's separately installed `pi-mcp-adapter` extension and Senpi's native HTTP MCP config. Detect Pi's adapter prerequisite before a ready claim, preserve the shared Pi/Atomic `.mcp.json` with a single-file ownership-aware merge, and refuse unsupported transport/auth. Do not install extensions or edit config during discovery; keep separate immediate interactive provider-specific approval and fail closed without it.
- [x] 4.2 In an isolated project, preview both schema-declared catalog servers across OpenCode, OMP, Pi, Atomic and Senpi; with deliberate approvals exercise exact host writes and provider no-ops, plus Pi-without-adapter refusal, shared-file conflict, stale preview and unsupported transport. Assert configured targets only; do not claim live server connectivity from local config.

## 5. Verify the full user workflow and update surface contracts

- [x] 5.1 Run actual CLI and TUI paths in a disposable OpenSpec project: alias install -> previewed five-host resource selection -> guarded switch -> CLI-created pin -> doctor -> reconciliation/disable guard. Observe each host's independent adapter/skill/MCP state, failure diagnostics, retained old pins, and distinct incomplete-artifact validation result; update existing contract tests only where these observable transitions warrant permanent coverage.
- [x] 5.2 Update affected CLI/Settings guidance and host capability docs to distinguish OpenSpec schemas, native adapters, skills and MCP approval, including Pi's external adapter prerequisite and Senpi's supported HTTP scope. Verify changed help/UI copy against the running surfaces. No configuration or application changes are part of this planning artifact itself.

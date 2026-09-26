# Changelog

All notable changes will be documented here using
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.8.1] - 2026-09-24

### Added

- Add optional OpenSpec lifecycle companion skills and nine Compound lifecycle adapters, including continuation routers.

### Changed

- Publish schemas, companion host resources, installers, and documentation without command-line or terminal-interface entry points.

- Document the planned CLI/TUI migration; version `1.8.0` retains the current `opsx-schema` commands.

### Fixed

- Pin managed skill acquisition to `git` resolved through `PATH`; ignore executable override environment variables.
- Detect observed installer and MCP config ancestor identity changes at conservative pre-mutation boundaries, and restore committed MCP config changes when a later install step fails.

## [1.8.0] - 2026-09-22

### Added

- No changes yet.

### Changed

- Add transparent fork provenance and a concise list of fork additions to the README.

### Fixed

- No changes yet.

## [0.1.9] - 2026-09-22

### Added

- Add `intent-driven-design`, a discovery-led schema with journey evidence, explicit decisions, ADRs, and verifiable tasks.
- Add change-local schema switching with dry-run, compatibility checks, and explicit apply controls.
- Add schema-declared read-only MCP catalog installs with generic `--mcp` selection and safe host configuration.
- Add native `opsx-schema` dual CLI commands for JSON project-state inspection via `inspect` and diagnostics via `doctor`.
- Add guarded `opsx-schema handoff` with safe dry-run by default and explicit `--apply` for metadata-only transfer.
- Add managed skill profiles with collision checks and safe mutation boundaries.
- Add `opsx-schema view` as an isolated optional OpenTUI runtime for Linux x64 glibc on Node.js 26.4+.
- Add read-only project snapshots, guarded handoff and project schema-enable actions in the view, and explicit confirmation with terminal safety checks. Skill actions remain CLI/backend operations.
- Add guarded `set-change-schema` CLI support for existing OpenSpec changes.
- Add project DOX guidance hierarchy.

### Changed

- Prepare version 0.1.9 as the released beta after version 0.1.8.
- Upgrade the Compound intent-driven schema contract with concrete define specs, stable execution-envelope fields, bounded one-task workers, checked outer-owned worktree isolation, continuation handoffs, and universal next-command reporting while OpenSpec remains lifecycle authority.
- Manage project tooling with Nub, make `nub dlx` primary package runner, document schema-level `validate`, retain all-schema `verify` compatibility, and expose install option aliases.
- Restructure root documentation around a concise user entrypoint with linked agent, contributor, and schema-specific guides.
- Keep Node.js 20 CommonJS core commands independent from the optional Node.js 26.4+ OpenTUI runtime.

### Fixed

- Write OpenCode MCP servers at direct `mcp.<server>` keys, validate catalogs through public validation commands, support non-destructive later MCP opt-in, and roll back schema installation when MCP config writes fail.
- Keep `opsx-schema view` alive after the initial OpenTUI frame until explicit shutdown, with idempotent renderer and IPC cleanup.
- Require focused view tests to await child lifecycle completion and print an explicit pass marker; native smoke retains the runtime after frame flush.
- Report missing optional OpenTUI runtime dependencies with stable guidance; persistent view consumers declare `@opentui/core@0.5.11` and `web-tree-sitter@0.25.10` explicitly.
- Require direct schema enable to resolve the target schema authoritatively before config mutation.
- Reap parent-owned snapshot and action workers with their owned subprocess groups during view shutdown and block late IPC.

## [0.1.7] - 2026-09-18

### Added

- No changes yet.

### Changed

- No changes yet.

### Fixed

- Make artifact layout CLI-authoritative across schemas, skills, commands, and Compound host projections; require concrete non-empty capability specs and add offline regression checks.

## [0.1.6] - 2026-09-17

### Added

- Add portable conventional commit, Markdown, and changelog validation.
- Add opt-in Git hooks and CI commit-range checks.
- Add package CLI for schema installation.
- Add Compound adapter templates for supported hosts.

### Changed

- Prepare version 0.1.6 for beta publication.

### Fixed

[Unreleased]: https://github.com/Nebuless/openspec-schemas/commits/HEAD
[1.8.0]: https://www.npmjs.com/package/@nebulesstech/openspec-schemas/v/1.8.0
[0.1.9]: https://www.npmjs.com/package/@nebulesstech/openspec-schemas/v/0.1.9
[0.1.7]: https://github.com/Nebuless/openspec-schemas/releases/tag/v0.1.7
[0.1.6]: https://github.com/Nebuless/openspec-schemas/releases/tag/v0.1.6

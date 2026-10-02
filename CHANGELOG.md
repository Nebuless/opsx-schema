# Changelog

This file records releases of the root `opsx-schema` package. The legacy
schema collection history remains in [resources/CHANGELOG.md](resources/CHANGELOG.md).

## [Unreleased]

### Changed

- Restyle terminal dashboard as a Change Register with distinct active and historical records, aligned planning and task measures, and stronger selected-row contrast.
- Lead read views with exact task counts and remaining work, independent planning readiness, truthful incomplete tracks, and explicit pending, unavailable, zero-task and historical states.
- Add passive bounded Markdown Document reading beside Source and Diff, with persistent reader context and retained file selection through return and terminal resize.
- Reconcile refreshed file actions with the highlighted available inventory row and keep bounded Document/Source suffixes readable at End after native wrapping and resize.

## [0.2.0] - 2026-09-30

### Changed

- Split existing CLI command handlers and lifecycle workflows into focused modules
  without changing CLI behavior; remove the creation/switch/handoff import cycle.

### Added

- Add schema-declared skill-tier diagnostics, guided named schema installation,
  single-target reviewed OMP skill replacement with retained backups and guarded
  restore, plus component-specific verification; keep command adapters separate.
- Restore tracked root agent guidance with repository ownership, OpenSpec authority,
  mutation safety, verification, and delivery rules; correct scoped schema and
  adapter instruction paths.

### Fixed

- Wait for post-publication npm registry visibility before strict release
  verification, without retrying publication or weakening provenance checks.

## [0.1.1] - 2026-09-28

### Added

- Document `bunx opsx-schema` dashboard use, common CLI commands, all command
  families, and the nine bundled schema workflows in a linked user guide.
- Add a guarded manual npm release workflow with protected-main preflight,
  dry-run mode, and cryptographic registry provenance verification before tagging.

### Fixed

- Accept stable OpenSpec 1.x releases from 1.12.0 onward instead of requiring
  exactly 1.12.0. Reject older or unsupported versions before schema writes,
  with an upgrade link for older installations.

## [0.1.0] - 2026-09-26

### Added

- Establish the curated public `opsx-schema` package at version 0.1.0, combining
  the Bun/OpenTUI CLI and dashboard with bundled OpenSpec schemas, host resources,
  and installer support.
- Include schema and adapter integrity manifests, CLI and resource documentation,
  and the initial application and distribution test suites.

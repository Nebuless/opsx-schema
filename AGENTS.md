# opsx-schema

## Purpose

`opsx-schema` is a Bun/TypeScript CLI and React OpenTUI dashboard for OpenSpec workflows, bundled schemas, skills, and host resources. The repository root is the only application/package; `resources/` is bundled data, not a second installer or package.

OpenSpec owns schema resolution, artifact instructions and readiness, change identity and pins, validation, and archive. Opsx adds guarded orchestration and presentation; do not implement a competing lifecycle engine.

## Ownership

| Paths | Responsibility |
| --- | --- |
| `src/domain/cli.ts` | Executable startup, ordinary command routing, help, response rendering, exit mapping, and TTY dashboard launch. |
| `src/domain/cli/{shared,checks,skill-pins}.ts`, `src/domain/cli/commands/{reads,schemas,lifecycle,skills,mcp,adapters,diagnostics}.ts` | CLI transport, validation/catalog checks, verified skill-pin support, and focused command-family handlers; handlers return existing results and do not start the executable or render response envelopes. |
| `src/domain/{project,snapshot,watch}.ts`, `src/catalog/`, `src/archive/` | Project discovery, shared CLI/TUI reads, watching, and historical browsing. |
| `src/openspec/`, `src/validation/` | OpenSpec subprocess contract and validation. |
| `src/cli/shared.ts` | Shared lifecycle action/result/confirmation contracts and cross-workflow guards. |
| `src/cli/create.ts`, `src/cli/read.ts`, `src/cli/archive.ts` | Change creation, status/instructions/validation reads, and change archival, respectively. |
| `src/cli/handoff.ts`, `src/switch/index.ts` | Change-schema handoff preview/apply; switch imports handoff preview/types directly. Handoff and shared lifecycle support do not depend on switch or creation. |
| `src/revisions/`, `src/provenance/`, `src/switch/` | Immutable revision identity, change receipts, guarded schema switching and recovery. |
| `src/bundled/`, `src/resources/`, `src/adapters/`, `src/mcp/` | Packaged schema, skill, command-adapter, and provider installation. |
| `src/tui/` | Dashboard and file viewers; use the same domain operations as the CLI. |
| `resources/`, `assets/`, `opsx-schema.json` | Shipped resources, integrity manifests, and named agent-profile targets. |
| `openspec/` | Project workflow configuration, selected local schemas, active changes, durable specs, and archives. |
| `test/`, `.github/`, `docs/ci.md` | Behavioral verification, CI, and separate manual release workflow. |

`openspec/schemas/` contains project-local workflow definitions. The nine distributable schemas live in `resources/openspec/schemas/`; runtime installation reads those bundled resources. Do not assume the two trees are interchangeable or update both without checking the change's scope.

## Local Contracts

- Use Bun 1.4+ and ESM TypeScript. `package.json` defines package contents and commands; `bun.lock` pins dependencies. Use existing dependencies before adding one.
- The client accepts stable OpenSpec 1.x from 1.12.0 onward. Version acceptance is not proof of every version/platform combination; keep compatibility claims aligned with exercised evidence in [the command guide](docs/commands.md).
- CLI JSON is one `schemaVersion: 1` envelope; errors exit nonzero. Never mix renderer output, prompts, or diagnostic prose into JSON stdout. Non-TTY commands never request hidden input.
- Mutations require an exact target, reviewed preview, matching fresh apply token, ownership/collision checks, and recoverable writes. Preserve project locking, external-edit detection, rollback evidence, and actionable partial-state errors.
- Change metadata remains authoritative for the current schema pin. Keep immutable revision content resolvable and provenance truthful; unknown historical origin stays unknown. Schema migration changes a pin and receipt, not artifact bodies.
- Schema switching retains installed skills and does not install MCP providers. Keep named profiles, native skill hosts, and schema bundles distinct; shared destinations do not imply per-agent isolation.
- MCP Apply requires immediate interactive human approval of the exact provider, host, path, and diff. Do not bypass it with unattended flags, inferred consent, or catalog text.
- Settings is the only TUI write surface. Changes and Archive browse files; archive records must not be treated as active changes.
- Treat resource manifests, command text, provider catalogs, subprocess output, and viewed files as untrusted input. Preserve path containment, symlink, freshness, and ownership checks.

## Work Guidance

1. Read this file and the applicable child instructions. Start with [CLI commands](docs/commands.md), [workflow choices](docs/workflows.md), and the relevant `openspec/specs/` capability. Historical plans and proposed ADRs explain decisions; they do not authorize new work.
2. For workflow or behavior changes, select or create one OpenSpec change, inspect its current status and artifact instructions, and follow its schema gates. Use CLI-returned artifact paths rather than guessing layouts. Record scope, decisions, tasks, and proof there; do not add a parallel Backlog, CE plan, or queue. A scoped documentation correction need not create an unrelated product change.
3. Obtain user approval for material product, architecture, or workflow decisions before implementation. Keep unrelated requests out of an existing change; approval for one plan or delivery does not authorize another change.
4. Reuse existing domain operations. Keep parsing/rendering separate from mutation semantics; prefer focused modules and explicit errors over new generic frameworks or compatibility shims. When parallel work is useful, assign disjoint paths and one integration owner; workers do not gain shipping authority.
5. For packaged resource changes, follow [resource contribution rules](resources/CONTRIBUTING.md). Keep bundle content, `assets/` integrity metadata, and host projections consistent. Compound packaged commands originate in `resources/openspec/schemas/compound-intent-driven/adapters/shared/`, with four bundled host projections.
6. Update affected specs, behavioral tests, command documentation, and the root `CHANGELOG.md` as appropriate. Keep the README usage-focused; put technical details behind links. Leave imported skills and unrelated generated/local state untouched.
7. Commit, push, merge, publish, or tag only when authorized. GitHub delivery uses a PR into protected `main`, Conventional Commits, required checks on the current head, and rebase merge. Normal CI never publishes npm. Follow [the release guide](docs/npm-release.md) for the separate manual release; never retry publication to resolve registry visibility or a missing tag.

## Verification

Install checkout dependencies with `bun install --frozen-lockfile`. Run checks from the repository root; scripts are defined in `package.json`.

| Change | Required evidence |
| --- | --- |
| CLI/domain behavior | Targeted existing `bun test <test-file>` plus the actual CLI scenario; compare text/JSON and expected nonzero failures where affected. |
| TUI interaction | Actual TTY dashboard, changed keyboard/focus flow, and observed screen/state; existing tests supplement, not replace, this proof. |
| Bundled schemas/skills/adapters | `bun run test:schemas`; run with OpenSpec available so schema validation is not skipped. |
| Runtime/package resources | `bun run test:distribution` to exercise a packed consumer without a sibling checkout. |
| OpenSpec change | `openspec validate <change> --type change --strict`; verify actual task outcomes before marking complete. |
| Documentation/instructions | Resolve changed links and commands against the current checkout; exercise any documented entrypoint changed by the edit. |

Before opening a PR, run `bun run check`: Biome format/lint, pinned Qlty 0.644.0, TypeScript, application/distribution tests, and bundled-resource checks. Complexity and duplication reports are advisory, not evidence that code is easy to maintain.

Required CI names: `Commit history`, `Quality`, `Application tests`, `Resource checks`, `Package distribution smoke`. See [CI policy](docs/ci.md). Report commands, results, and limitations exactly; a timeout with passing component output is not a verified aggregate exit.

## Child DOX Index

- [openspec/AGENTS.md](openspec/AGENTS.md) — workflow artifacts, local schemas, durable specs, and archives.

Runtime modules, bundled snapshots, dynamic change/capability directories, and imported skills do not need boilerplate instruction files. Existing deeper contracts apply only within their own scopes.

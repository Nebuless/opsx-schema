# opsx-schema command guide

`opsx-schema` is the single supported distributable CLI/TUI for managing the bundled OpenSpec schemas, agent-skill resources, and declared MCP catalogs. The canonical repository-root package is `opsx-schema@0.1.0`.

The previously published `@nebulesstech/openspec-schemas@1.8.0` is a legacy standalone schema package. Its separate install path is deprecated for the current workflow and is neither used nor required by `opsx-schema`.

## Install and run

Requirements:

- Bun 1.4.0 or newer (the package declares `engines.bun >=1.4.0`).
- OpenSpec CLI 1.12.0 for project lifecycle commands. This build checks the OpenSpec CLI version and rejects a different version rather than guessing compatibility.
- A usable interactive terminal for the dashboard and MCP Apply approval.

For a local package-consumer smoke test, pack the repository root once and install that tarball in a disposable consumer. The tarball is self-contained; do not pack or override a second schema package:

```sh
TMP_DIR=$(mktemp -d)
bun pm pack --destination "$TMP_DIR"
mkdir "$TMP_DIR/consumer"
echo '{"private":true}' > "$TMP_DIR/consumer/package.json"
(cd "$TMP_DIR/consumer" && bun add "$TMP_DIR"/opsx-schema-*.tgz)
"$TMP_DIR/consumer/node_modules/.bin/opsx-schema" --help
"$TMP_DIR/consumer/node_modules/.bin/opsx-schema" --json schemas bundled
```

For a version published to npm, install the CLI with Bun:

```sh
bun add --global opsx-schema@<version>
opsx-schema --help
```

For an unreleased checkout, use the local tarball flow above. The legacy package install path is not part of this workflow. The app exposes the `opsx-schema` executable, not a supported JavaScript import API. Project lifecycle commands use the OpenSpec CLI on `PATH`.

## Bundled resource layout and authoring

Only bundled schemas, host-specific resources, resource guides, and the resource license ship in the npm package. The public source keeps project planning in root openspec/, but excludes legacy archives and specs from resources/openspec/.

The package carries the canonical source tree under `resources/`, including `resources/openspec/schemas/<name>/`, the host-specific trees such as `resources/.agents/` and `resources/.omp/`, and `resources/LICENSE`. Author schemas at `resources/openspec/schemas/<name>/`: `schema.yaml` defines the workflow, `templates/` contains artifact templates, and optional `skills.txt` and `mcp.yaml` declare companion resources. Shared command adapters remain under `resources/openspec/schemas/compound-intent-driven/adapters/`. Integrity metadata stays in `assets/schemas/manifest.json` and `assets/adapters/manifest.json`; these are indexes, not a second schema source tree.

## Invoking the CLI

```sh
opsx-schema [--project <root>] [--json] <command> [arguments]
opsx-schema [--project <root>]                 # open the dashboard on a usable TTY
opsx-schema --help
```

Without `--project`, project commands resolve the nearest OpenSpec project. `--project <root>` selects an exact project root. Put global options before the command, as in the usage line. Bare invocation starts the dashboard only in a usable interactive TTY; a non-TTY bare invocation fails with `TTY_REQUIRED` and a non-zero exit instead of writing terminal control sequences into an agent pipe. Use explicit commands for noninteractive work. The dashboard has Overview, Changes, Archive and Settings tabs; Overview, Changes and Archive are read-only, while Settings stages guarded changes.

Default CLI output is compact TOON, with one response envelope. Add global `--json` before the command for one JSON envelope with `schemaVersion: 1`; it does not authorize a mutation or change the result. A successful JSON command has this shape:

`{"schemaVersion":1,"command":"status","ok":true,"data":{...}}`

An error is also one envelope. For example, an unknown command returns:

`{"schemaVersion":1,"ok":false,"error":{"code":"USAGE","message":"Unknown command ..."}}`

Errors are actionable and exit non-zero. An unknown command and a non-TTY bare invocation were observed exiting with status 1. JSON output contains no extra diagnostic stream; help text and interactive dashboard output are not JSON envelopes.

## Command reference

All commands below are noninteractive unless the command explicitly requires a human approval. Read commands do not mutate project or host files.

### Project, changes, schemas and diagnostics

```text
status
changes [name] [file]
archive [name] [file]
schemas [name]
resources [schema]
doctor
```

- `status` summarizes the resolved project, default schema and active work.
- `changes` reads OpenSpec active changes; optional `name` and `file` narrow the read. `changes <name>` also reports the recorded schema-revision and skill-selection association (or `null` for an unreconciled legacy change).
- `archive` reads archived records independently from active changes; optional `name` and `file` narrow the read.
- `schemas [name]` reads the resolved schema catalog or one schema revision. `resources [schema]` reads declared resource bundles.
- `doctor` reports OpenSpec, managed-skill and declared MCP-catalog diagnostics. Use `skills doctor` for the skill ownership/integrity report.

### OpenSpec lifecycle

```text
change create <name> --description <text> [--goal <text>] [--schema <name>] [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--bundle default|recommended|all] [--apply-token <token>]
change status <change>
change instructions <change> <artifact>
change validate <change>
change archive <change> [--apply-token <token>]
change schema <change> <schema> [--apply-token <token>]
```

OpenSpec remains authoritative for change identity and lifecycle state, schema resolution, artifact instructions, strict validation and archive operations. `change create`, `change status`, `change instructions`, `change validate` and `change archive` delegate lifecycle semantics to the installed OpenSpec CLI; Opsx adds project resolution, revision/provenance checks and safe mutation previews rather than maintaining a second lifecycle engine.

`change schema <change> <schema>` is an explicit change-schema handoff. It is distinct from changing the project default with `schema switch`. It is not the old metadata-only `--allow-incompatible` bypass: review the preview and validation result; there is no promise of that legacy override. A change with a verified skill-selection association must instead migrate through a guarded `schema switch` preview with `--migrate <change>` and a reviewed target selection; standalone handoff refuses to carry the previous revision's association forward.

### Schema installation, validation and switching

```text
schema switch <name> [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--bundle default|recommended|all] [--migrate <change> ...] [--apply-token <token>]
schemas bundled [name]
schemas install <source-name> --project <root> [--as <distinct-name>] [--apply-token <token>]
schemas validate [name]
verify
```

- `schemas bundled [name]` lists or inspects packaged schemas and works outside a project.
- `schemas install` installs a named bundled source into the explicit project. Use `--as` to give a second revision a distinct OpenSpec schema ID; a same-name revision cannot silently replace a pinned schema. The preview identifies both source and destination and refuses unsafe or changed targets. Installation does not switch the project default.
- `schemas validate [name]` asks OpenSpec to resolve and validate the project schema or a specified schema available to OpenSpec. A bundled schema must be installed before OpenSpec can resolve it by name.
- `schema switch` changes the project default. Repeated `--profile` options select named agent profiles; repeated `--skill-host` options select separate native skill roots for OpenCode, OMP, Pi, Atomic and Senpi. Select `--bundle` explicitly when installing schema-declared skills. Each proposed target, trust requirement and shared destination appears in the guarded preview. Repeated `--migrate` options select active changes for compatible, validated migration; completed and archived changes are not migration targets. Existing skills are retained; MCP installation is never implicit.
- `change create` records the exact schema revision, named profiles, native skill hosts and bundle in the change receipt. It uses an explicitly supplied selection or a matching verified switch selection; it does not guess installed hosts from files. For a schema declaring skills, absent or unverified selection blocks creation. A schema without declared skills can be created without host selection.
- `verify` runs the aggregate OpenSpec-schema, active-change, skill and MCP checks. It is a new aggregate command, not a byte-for-byte alias for every legacy verifier.

### Named profiles and skills

```text
skills inspect [schema] [--bundle default|recommended|all]
skills doctor
skills reconcile <change> --revision-digest <sha256> --bundle default|recommended|all [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--apply-token <token>]
skills install [schema] [--profile <agent-id> ...] [--skill-host opencode|omp|pi|atomic|senpi ...] [--bundle default|recommended|all] [--apply-token <token>]
skills disable <project-relative-target> [--apply-token <token>]
```

The shipped `opsx-schema.json` manifest defines these profile IDs and skill roots:

| Profile ID | Label | Skill target |
| --- | --- | --- |
| `claude-code` | Claude Code | `.claude/skills` |
| `codex` | Codex | `.agents/skills` |
| `cursor` | Cursor | `.cursor/skills` |
| `gemini-cli` | Gemini CLI | `.gemini/skills` |
| `opencode` | OpenCode | `.agents/skills` |

The CLI uses the profile manifest shipped with the package and rejects IDs that are not declared there. Native skill hosts are a separate selection: OpenCode `.opencode/skills`, OMP `.omp/skills`, Pi `.pi/skills`, Atomic `.atomic/skills`, and Senpi `.senpi/skills`. `default`, `recommended` and `all` are schema-declared skill bundles, not agent profiles or host checkboxes. Codex and the named OpenCode profile share `.agents/skills`; a native OpenCode host does not share that root. Shared writes are deduplicated and identified in previews. Skill disable is a separate guarded action; it refuses unsafe, modified, shared or currently pinned resources rather than force-removing them. A legacy active pin whose exact profile/bundle/host association cannot be proven leaves disable blocked; do not infer targets from installed files or project defaults.

To reconcile a pre-existing active change without a recorded selection, inspect its schema pin and choose the exact effective revision SHA-256, named profile(s), native host(s), and bundle. `skills reconcile` previews that exact change, revision, and selection, then requires its matching apply token. It records the reviewed association without inventing the historical creation revision; a no-skills selection is valid only when the schema declares no skills. A stale pin, changed manifest, conflicting association or unknown selection fails closed. Re-run `skills doctor` and inspect `changes <name>` after Apply. Reconciliation does not install skills or providers.

There is no `skills enable` alias. Use `skills install` with explicit profile(s) and/or native host(s) and the desired bundle. A schema switch does not disable previously installed skills.

`skills inspect` reads the bundled schema declarations and the package's local profile manifest; it is a read-only catalog and does not fetch GitHub skill repositories. `skills install` may fetch schema-declared external GitHub skill repository content while preparing its preview. The schema's `skills.txt` catalog and packaged host assets do not imply that all external skill payloads are bundled or installed offline.

### MCP provider inspection and installation

```text
mcp list [--schema <name>] [--target-dir <dir>]
mcp inspect <provider> [--schema <name>] [--target-dir <dir>]
mcp install <provider> --host atomic|omp|opencode|pi|senpi [--schema <name>] [--target-dir <dir>] [--apply-token <token>]
```

Only explicitly declared, valid schema catalog providers can be selected. Catalog entries must use HTTPS, declare `readOnly: true` and `auth: none`; unknown, unsafe or ambiguous configuration is refused. `mcp list` and `mcp inspect` are reads and require a catalog in the resolved project schema; without one they return a nonzero error envelope such as `MCP_CATALOG_NOT_FOUND`.

`mcp list`, `mcp inspect`, and an `mcp install` preview without an apply token read the local `mcp.yaml` catalog and prepare a config diff. They do not contact the provider or write host configuration. Apply requires a usable TTY and explicit interactive approval of the safety metadata and exact host/path/diff.

The checked project’s resolved `compound-intent-driven` schema has no `mcp.yaml`, so `mcp list --json` exited 1 with that error. The bundled `intent-driven-design` schema declares `inspo` and `ui-skills`; outside a project, `mcp list --schema intent-driven-design` inspects its bundled catalog without installation. In a project, `--schema` resolves an installed schema.

Installation previews the provider URL/safety metadata, selected host, target path and exact configuration diff. By default the target directory is the resolved OpenSpec project root; `--target-dir` selects the exact alternative target and is required when no project is selected.

| Host | Target/config | Result |
| --- | --- | --- |
| `atomic` | `<target-dir>/.mcp.json`, `mcpServers` entries | Native config write after approval. |
| `omp` | `<target-dir>/.omp/mcp.json`, `mcpServers` entries | Native config write after approval. |
| `opencode` | Existing `opencode.json[c]` or `.opencode/opencode.json[c]`; otherwise `opencode.jsonc`. Uses `mcp` entries. | Native config write after approval; ambiguous existing candidates are refused. |
| `pi` | `<target-dir>/.mcp.json`, `mcpServers` entries (shared with Atomic) | Configurable only when the separately installed `pi-mcp-adapter` package and entrypoint are present under Pi's agent directory and a matching extension is registered in Pi settings. Discovery never installs that extension. Preview/Apply refuse without it; the shared file is ownership-aware and unrelated entries are preserved. |
| `senpi` | `<target-dir>/.senpi/mcp.json`, `mcpServers` entries with `{type: "http", url, auth: false}` | Native HTTP config write after approval for unauthenticated HTTPS catalog providers; other transports/auth are refused. |

For Pi, the prerequisite is a matching `npm:pi-mcp-adapter[@version]` extension entry in a trusted project or global Pi `settings.json` plus the installed package manifest and extension entrypoint under `$PI_CODING_AGENT_DIR/npm/node_modules/pi-mcp-adapter` (default Pi agent directory under `~/.pi/agent`). Install and trust that third-party extension separately; this CLI neither installs it nor interprets its runtime health as proven by a local file check.

MCP Apply fails closed without a usable TTY and fresh, explicit typed human approval of the provider safety metadata and exact selected host/path/diff. A preview token alone, `--json`, `--yes`, or agent confirmation is not that approval. Schema switching never installs MCP implicitly.

### Compound command adapters

```text
adapters inspect <host> --scope project [--schema <name>]
adapters install <host> --scope project [--schema <name>] [--apply-token <token>]
```

This is the separate command-adapter capability, not skill installation. It previews and installs the nine bundled `compound-intent-driven` slash-command templates only for a selected installed OpenSpec schema whose recorded bundle source matches the shipped compound bundle. `--schema` selects an installed alias instead of the project default; arbitrary same-named project schemas and changed bundle sources are refused. Supported hosts and project destinations are:

| Host | Project destination |
| --- | --- |
| `opencode` | `.opencode/commands` |
| `omp` | `.omp/commands` |
| `senpi` | `.senpi/prompts` |
| `pi` | `.pi/prompts` |
| `atomic` | `.atomic/prompts` |

The bundled files are `opsx-ce-bulk-continue.md`, `opsx-ce-compound.md`, `opsx-ce-continue.md`, `opsx-ce-debug.md`, `opsx-ce-define.md`, `opsx-ce-plan.md`, `opsx-ce-review.md`, `opsx-ce-validate.md` and `opsx-ce-work.md`. `adapters inspect` is read-only; install is preview/apply guarded and refuses drift or collisions rather than overwriting unowned files.

## Preview, freshness and confirmation

Every CLI mutation previews by default. Review its exact targets, proposed state, diagnostics and freshness token. To apply, repeat the same command with the token returned by that preview:

```sh
opsx-schema change archive <change>
# Review preview, then use its token:
opsx-schema change archive <change> --apply-token <token>
```

Apply re-reads authoritative state and refuses a stale, changed or ambiguous preview; run the command again and review the new preview. Mutation commands do not apply from `--yes`. A JSON flag is an output-format choice only. Do not reuse a preview token to authorize a different target or changed command.

MCP installation adds a distinct interactive safety gate: use a real TTY and approve the exact provider policy, host, path and diff at the point of Apply. It is intentionally unavailable to unattended/agent-only Apply. No host configuration write is performed by the documented preview commands.

## Source capability parity and legacy migration

The previously published `@nebulesstech/openspec-schemas@1.8.0` package and its standalone binaries are legacy. The current root `opsx-schema@0.1.0` is the only supported app and installer; it bundles schemas, skill/host resources, and catalogs in one archive. The old package installation route is deprecated for this workflow and is not used as a dependency or override. This documentation does not claim that the package has been deprecated in the npm registry.

This matrix maps legacy command capabilities to the new command grammar; it is not a flag-compatible upgrade:

| Legacy capability/syntax | New command(s) | Migration notes |
| --- | --- | --- |
| `openspec-schemas list`, `opsx-schema list` | `schemas [name]`; `schemas bundled [name]` | Use `bundled` for the packaged catalog outside a project. |
| `openspec-schemas validate [schema]` | `schemas validate [name]` | Uses OpenSpec validation, not a second schema validator. |
| `openspec-schemas install <schema> [--target/--skills/--activate/--force]`; `opsx-schema enable <schema>` | `schemas install <source> --project <root> [--as <distinct-name>]`; optional skills via `skills install [schema] --profile <agent-id> ...` or `--skill-host <host> ...`; select the project default with `schema switch <name>` | `--target` maps to explicit `--project`; choose exact named profile/native-host destinations rather than an implicit all-host target. `--as` preserves a separate installed schema ID; activation remains separate. Legacy `--force` is not carried forward. |
| `opsx-schema inspect [--change]`, list/state reads | `status`, `changes`, `archive`, `schemas`, `resources` | Choose the read family that owns the fact; archived records are separate from active changes. |
| Skill-host selection during schema switch | `schema switch <name> --skill-host <host> ...` (OpenCode, OMP, Pi, Atomic, Senpi) | Repeat the option for multiple independent native roots; review target and trust information before Apply. |
| `opsx-schema doctor`; `skills doctor` | `doctor`; `skills doctor`; `verify` | Project/resource diagnostics and aggregate checks have explicit new commands. |
| `openspec-schemas verify` | `verify` and, for a named schema, `schemas validate <name>` | New `verify` reports its documented OpenSpec-schema, active-change, skill and MCP checks; it is not a guarantee of identical legacy internals. |
| `opsx-schema skills inspect/doctor/install/enable/disable` | `skills inspect/doctor/install/disable` | The `--bundle` accepts `default`, `recommended` or `all`; repeated `--profile` and `--skill-host` select distinct named-agent and native destinations. No `enable` alias. |
| Legacy `--mcp` selector (`all` or comma-separated provider names) plus overloaded `--agents <host>` | `mcp list/inspect/install <provider> --host <host>` | Inspect and preview explicitly; install one named provider at a time. No implicit schema-install MCP option or `--mcp all` shortcut. |
| `set-change-schema` / metadata-only `handoff` | `change schema <change> <schema>` | Change pin handoff is separate from `schema switch` (project default); no `--allow-incompatible` bypass. |
| Optional `opsx-schema view` | Bare `opsx-schema` in a usable TTY | React OpenTUI Overview/Changes/Archive/Settings dashboard; non-Settings tabs are read-only. |
| Optional compound command installer | `adapters inspect/install <host> --scope project [--schema <name>]` | Installs nine `/opsx-ce-*` files only from a selected installed schema with verified bundled provenance, not skills. |

The new CLI does not accept the legacy `--mcp`, overloaded `--agents` host selector, `--force`, `--activate` or `--allow-incompatible` syntax. Do not mechanically replace flags: preview each operation and select the corresponding new command.

## Tested runtime matrix

The rows below are the evidence collected for this release slice, not a claim that every upstream platform/package target has been validated.

| Component | Version/target | Evidence and boundary |
| --- | --- | --- |
| OpenSpec CLI | 1.12.0 | Exact version reported locally; project CLI read was exercised. The client rejects every version other than 1.12.0 in this build. |
| Bun | 1.4.2 | Local CLI, package pack/install smoke and TTY dashboard smoke; package metadata requires Bun >=1.4.0. Only 1.4.2 was exercised here. |
| React OpenTUI | `@opentui/core 0.5.12` and `@opentui/react 0.5.12` (React 19.2) | Locked and used by the Linux TTY dashboard smoke. No other OpenTUI release was validated for this slice. |
| OS / architecture | Linux x86_64 | Packaged CLI and interactive dashboard smoke were exercised here. macOS, Windows, Linux ARM64 and other libc/terminal combinations were not release-tested; their support is not inferred from optional dependency package names. |

Before relying on another OpenSpec CLI version or operating-system/architecture combination, run the package, CLI and interactive TTY checks on that target. The OpenSpec compatibility guard is intentionally exact, not a broad semver claim.

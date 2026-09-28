# Workflows and schema choices

Run every command below with `bunx opsx-schema`; Bun downloads the published package when needed, without a global installation. Use Bun 1.4 or newer. Project-aware commands need OpenSpec CLI 1.12.0 on `PATH` and an OpenSpec project; run them from its root or put `--project <root>` immediately after `opsx-schema`. OpenSpec remains responsible for change status, artifact instructions, validation, and archive.

## Choose and activate a schema

```sh
bunx opsx-schema schemas bundled
bunx opsx-schema schemas bundled intent-driven
bunx opsx-schema --project . schemas install intent-driven
```

`schemas bundled` works even before you have a project. `schemas install` previews copying a bundled schema into the selected project; it does not change the default. Review the proposed files and repeat with the returned token:

```sh
bunx opsx-schema --project . schemas install intent-driven --apply-token <token-from-install-preview>
bunx opsx-schema --project . schemas validate intent-driven
bunx opsx-schema --project . schema switch intent-driven --profile codex --bundle default
bunx opsx-schema --project . schema switch intent-driven --profile codex --bundle default --apply-token <token-from-switch-preview>
```

`schema switch` selects the default workflow. `--profile codex` chooses the named Codex skill destination; `--bundle default` chooses the schema's default companion skill set. Use `--skill-host omp` (or another native host) instead when that is your target. Choose your actual profile/host and review its trust and destination details in the preview; these commands do not install MCP providers. If you want to keep the existing default and only use a schema for one new change, supply `--schema <installed-name>` to `change create` instead.

## Work on a change

After the schema is installed and the intended skill selection is applied, start a change. A command that mutates files previews first and needs its own fresh token on the repeated command; the tokens below stand for different preview results.

```sh
bunx opsx-schema change create account-export --description "Let users export their data"
bunx opsx-schema change create account-export --description "Let users export their data" --apply-token <token-from-create-preview>
bunx opsx-schema change status account-export
bunx opsx-schema change instructions account-export proposal
bunx opsx-schema change instructions account-export specs
bunx opsx-schema change validate account-export
bunx opsx-schema change archive account-export
bunx opsx-schema change archive account-export --apply-token <token-from-archive-preview>
```

Use `change status` to see which artifact is ready, then `change instructions <change> <artifact>` for that artifact's content and output path. Write the artifacts in your project before validation. `change validate` and `change archive` use OpenSpec's lifecycle; archive only after the change is complete. `change schema <change> <schema>` previews a change-local schema handoff; `schema switch` changes the project default instead. Changes with verified skill selections need the guarded `schema switch ... --migrate <change>` path. See the [command reference](./commands.md#openspec-lifecycle) for those distinctions.

## Other CLI workflows

Use these command forms after `bunx opsx-schema`. Reads do not change your project; mutations preview and require a matching `--apply-token <token>` for Apply. Global `--json` goes **before** the command for machine-readable results. `--project <root>` goes before the command too. See the [full grammar and approval rules](./commands.md#command-reference).

| Intent | Commands | What you get |
| --- | --- | --- |
| Dashboard | *(no command)* | Overview, Changes, Archive and Settings in an interactive terminal. No TTY: use a command instead. |
| See project work | `status`; `changes [name] [file]`; `archive [name] [file]` | Project state, active changes, or archived records. |
| Browse project resources | `schemas [name]`; `resources [schema]` | Resolved schemas and their declared companion resources. |
| Browse/install/validate bundles | `schemas bundled [name]`; `schemas install <name> --project <root>`; `schemas validate [name]` | Package catalog, an installation preview, or OpenSpec validation of an installed schema. |
| Change project default | `schema switch <name>` | Preview a default-schema and optional skill-selection change; add `--migrate <change>` for eligible active changes. |
| Create and finish work | `change create <name> --description <text>`; `change status <name>`; `change instructions <name> <artifact>`; `change validate <name>`; `change archive <name>`; `change schema <name> <schema>` | OpenSpec change lifecycle, artifact guidance, validation, archive, or explicit handoff. |
| Inspect and manage skills | `skills inspect [schema]`; `skills doctor`; `skills install [schema] --profile <agent-id> --bundle default`; `skills reconcile <change> --revision-digest <sha256> --bundle default`; `skills disable <project-relative-target>` | Skill catalog and health; guarded install, legacy association reconciliation, or disable. Named profiles and native `--skill-host <host>` are separate destinations. |
| Inspect/install MCP providers | `mcp list --schema <name>`; `mcp inspect <provider> --schema <name>`; `mcp install <provider> --host <host> --schema <name>` | Read a schema's declared provider catalog or preview host configuration. Apply also needs a live TTY and explicit human safety approval. Switching schemas never installs an MCP provider. |
| Install Compound command adapters | `adapters inspect <host> --scope project`; `adapters install <host> --scope project` | Inspect or preview slash-command templates for an installed bundled `compound-intent-driven` schema. Distinct from skills. |
| Check health | `doctor`; `verify` | Project diagnostics or aggregate schema, change, skill and MCP checks. |
| Learn syntax | `--help` | The local CLI's supported commands and options. |

For example, to inspect a catalog without a project or look up JSON status in a project:

```sh
bunx opsx-schema mcp list --schema intent-driven-design
bunx opsx-schema --project . --json status
bunx opsx-schema --project . doctor
```

An `mcp install` **preview** only reads catalog data and shows the proposed host config. Its Apply step requires interactive approval at the terminal, in addition to a fresh token. Do not pipe approval or run it unattended. `skills install` previews may fetch external skill repositories; `skills inspect` is local. For exact profile IDs, host destinations, and special-case prerequisites, use the [command reference](./commands.md#named-profiles-and-skills).

## Which schema fits?

These are nine alternative OpenSpec workflows, not nine commands. Install the one that fits the decisions your work must record. Each schema link opens a source guide for its artifact format and rationale. Those guides are historical snapshots: their root-README copy/paste installs, `AGENT_INSTALL.md` or script-based skill installs, and legacy `openspec-schemas --mcp` instructions are not supported by this CLI. Use the steps on this page and the [command reference](./commands.md) for schema, skill and MCP installation.

| Schema | When to use it | Workflow |
| --- | --- | --- |
| [minimalist](../resources/openspec/schemas/minimalist/README.md) | Small, low-risk work that needs requirements and a task list, not an architecture process. | `specs → tasks` |
| [event-driven](../resources/openspec/schemas/event-driven/README.md) | Asynchronous systems: discover domain events, model their flows and validate an AsyncAPI contract before planning implementation. | `event-storming → event-modeling → specs → design → asyncapi → tasks` |
| [behaviour-driven](../resources/openspec/schemas/behaviour-driven/README.md) | Changes whose observable behavior should be written as Given/When/Then scenarios, without an ADR stage. | `proposal → (specs, design) → tasks` |
| [spec-driven-with-adr](../resources/openspec/schemas/spec-driven-with-adr/README.md) | Standard proposal and specification work that also needs a lasting architecture-decision trail. | `proposal → (specs, design) → adr → tasks` |
| [intent-driven](../resources/openspec/schemas/intent-driven/README.md) | Capture contributor intent, observable behavior, technical design and architectural decisions together. Specs and design can proceed after the proposal. | `proposal → (specs, design) → adr → tasks` |
| [intent-driven-engineering](../resources/openspec/schemas/intent-driven-engineering/README.md) | The intent-driven flow with stage-specific engineering skills for domain modeling, design seams and verification. | `proposal → (specs, design) → adr → tasks` |
| [intent-driven-superpowers](../resources/openspec/schemas/intent-driven-superpowers/README.md) | The same intent-driven gates with selected Superpowers and engineering skills for conditional planning and implementation discipline. | `proposal → (specs, design) → adr → tasks` |
| [intent-driven-design](../resources/openspec/schemas/intent-driven-design/README.md) | Product, UI or platform decisions that need a guided discovery journey and explicit user decisions before proposing the change. | `journey → proposal → (specs, design) → adr → tasks` |
| [compound-intent-driven](../resources/openspec/schemas/compound-intent-driven/README.md) | Non-trivial work needing a define/plan/build/simplify/review/compound loop, with proofs and learning folded into OpenSpec work rather than a second tracker. | `proposal → (specs, design) → adr → tasks → apply` |

Parentheses mean the two artifacts can proceed after the proposal; later gates still require the relevant outputs. `apply` is the implementation phase, not a generated artifact. The `spec-driven-with-adr` schema-local guide uses a serial shorthand, but its `schema.yaml` allows specs and design after the proposal. An ADR stage reviews architecture decisions; it does not mean every change needs a new permanent ADR. [Resource overview](../resources/README.md) covers provenance and companion resources, while the [command reference](./commands.md) covers CLI flags and safety details.

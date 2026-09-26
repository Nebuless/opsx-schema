# Intent-Driven Design OpenSpec Schema

`intent-driven-design` adds a guided design journey before implementation. Use
it for product, UI, or platform work where material design choices need
discovery evidence, explicit user decisions, and durable architecture records.

Choose a smaller schema for routine fixes, dependency updates, docs-only work,
or changes whose direction and behavior are already settled. This workflow is
also a poor fit when no user can answer pause requests or own conflicting
directions.

OpenSpec owns artifact status, validation, sync, and archive. Pauses, toolkit
routes, receipts, loopbacks, and reconciliation below are agent protocol. File
presence alone doesn't enforce them.

## Activate

Set the project default in `openspec/config.yaml`:

```yaml
schema: intent-driven-design
```

For existing work, select the schema through supported OpenSpec change-local
metadata. Activation doesn't migrate or reconcile existing artifacts.

Resolve every path from CLI `status` and `instructions`. Use `changeRoot`,
`artifactPaths`, `resolvedOutputPath`, concrete dependency paths, and refreshed
`existingOutputPaths`. For `specs/**/*.md`, write non-empty
`<changeRoot>/specs/<capability>/spec.md` files. OpenSpec 1.13.1 may count a
literal `specs/**/*.md` file as output. Agents MUST reject that state, require a
non-empty <changeRoot>/specs/<capability>/spec.md, and record the protocol failure.
An empty directory also remains incomplete. Missing CLI metadata blocks work.

## Read-Only MCP Catalog

`mcp.yaml` is schema-local stable catalog metadata. Version `1` accepts only
`servers` entries with unique lowercase-hyphen names, HTTPS `url`,
`readOnly: true`, and `auth: none`. This package declares `inspo` and
`ui-skills`.

After user approval, agents inspect target host evidence. Reuse current or
prior approval; ask once only when absent. Invoke `--mcp` with `-a`:

```sh
openspec-schemas install intent-driven-design -t . --mcp all -a opencode
```

`atomic`, `omp`, and `opencode` receive remote read-only entries. `pi` is
guided-only and writes no MCP config until user selects supported extension.
Record catalog names, endpoints, host evidence or explicit host, approval,
host result, and guided-only state in journey receipt.

## Workflow And Ownership

Exact graph:

```text
journey -> proposal -> (specs, design) -> adr -> tasks
```

| Artifact | Output | Decision ownership |
|---|---|---|
| `journey` | `journey.md` | Discovery evidence, route receipts, branch IDs, and user approvals |
| `proposal` | `proposal.md` | Change intent and scope |
| `specs` | `specs/**/*.md` | Change observable behavior in concrete capability specs |
| `design` | `design.md` | Selected implementation guardrails and direction |
| `adr` | `adr.md` | Change durable architecture review and decision manifest |
| `tasks` | `tasks.md` | Change execution as verifiable vertical work |

`specs` and `design` start after `proposal` and may proceed in parallel. `adr`
requires `design`. `tasks` requires concrete specs plus `adr`. One change root
contains one proposal path and one tracked task file. Put a materially different
direction in a sibling change, not a second proposal or task list.

## Receipts And Pause Points

For each material design decision, run Matt Pocock discovery through `grilling`
with `grill-me`, or use `grill-with-docs` when durable domain or ADR material
should be produced. Record invocation and result. If discovery isn't applicable,
record `not_applicable` with reason. If no material choice exists, record
`no_material_decision`. An unavailable invocation uses the routing fallback
contract rather than an invented result.

Record stable `branch_id` values for every direction. IDs survive renames and
loopbacks so sibling changes and reconciliation receipts remain traceable.

Five explicit user pauses:

1. `pause_discovery`: approve discovery summary, material decisions, scope, and
   exclusions before route selection.
2. `pause_route_selection`: approve applicable default and specialist routes.
3. `pause_direction_selection`: choose direction and sibling branches before
   downstream artifacts proceed.
4. `pause_loopback_acceptance`: accept each proposed return to an owning
   artifact before downstream repair.
5. `pause_pre_task_handoff`: approve reconciled specs, design, ADR review, and
   handoff before tasks are written.

Each receipt records decision, user response, timestamp, affected branch IDs,
and evidence path. A pause is protocol evidence, not an OpenSpec engine gate.

## Toolkit Routing Matrix

Impeccable is default method for applicable UI and product design. Specialists
remain optional. Recommend smallest specialist set that covers observed signals.
When routes overlap, present conflict and evidence; user decides direction.

| Route | Trigger | Exclusion | Prerequisite | Owner artifact | Optional output | Approval gate | Loopback | Unavailable fallback or blocker | Provenance and license | Conflict rule |
|---|---|---|---|---|---|---|---|---|---|---|
| Impeccable | UI or product surface needs critique, direction, or polish | Impeccable exclusion: backend-only, infrastructure-only, or settled visual work | Discovery receipt and inspectable surface or brief | `journey.md`, then selected guardrails in `design.md` | Critique, direction brief, or UI guidance | Route and direction pauses | `journey` for route, `design` for guardrails | Record `skill_invocation_unavailable`; block UI direction unless user approves evidence-based manual fallback | [`pbakaus/impeccable@f2c7051`](https://github.com/pbakaus/impeccable/tree/f2c7051), [Apache-2.0](https://github.com/pbakaus/impeccable/blob/f2c7051/LICENSE) | Default yields to narrower specialist only with user approval |
| Emil Kowalski | Interaction motion, animation feel, or transition craft is material | Emil Kowalski exclusion: static surface or motion forbidden by accessibility or platform rules | Approved UI route and motion constraints | `design.md` | Motion critique or interaction specification | Direction pause | `design` | Record `skill_invocation_unavailable`; continue with Impeccable constraints or block if motion is core | [`emilkowalski/skills@85e8e23`](https://github.com/emilkowalski/skills/tree/85e8e23), [MIT](https://github.com/emilkowalski/skills/blob/85e8e23/LICENSE) | Impeccable frames product direction; this route owns motion detail |
| Garden Skills | Broad design-system or product-design practice spans several surfaces | Garden Skills exclusion: one isolated component with no system impact | Discovery signals showing cross-surface consistency need | `journey.md`, selected rules in `design.md` | Design-system audit or practice-specific brief | Route pause | `journey` or `design` by changed decision | Record `skill_invocation_unavailable`; use Impeccable only if it covers observed signals, otherwise block | [`ConardLi/garden-skills@aaf9a82`](https://github.com/ConardLi/garden-skills/tree/aaf9a82), [MIT](https://github.com/ConardLi/garden-skills/blob/aaf9a82/LICENSE) | User chooses when advice conflicts with product direction |
| Elaya Design | Brand, visual identity, or high-level art direction is unresolved | Elaya Design exclusion: established brand with no requested identity change | Brand inputs, audience, and approved scope | `journey.md`, selected direction in `design.md` | Brand or visual direction board | Direction pause | `journey` | Record `skill_invocation_unavailable`; keep existing brand or block new identity choice | [`elayadesign/ai-design-skills@1c1e97c`](https://github.com/elayadesign/ai-design-skills/tree/1c1e97c), [MIT](https://github.com/elayadesign/ai-design-skills/blob/1c1e97c/LICENSE) | User resolves brand direction before UI-detail routes proceed |
| MengTo | Interface concept needs visual composition or product-design teaching patterns | MengTo exclusion: no visual interface or direction already approved | Approved problem frame and target platform | `design.md` | Composition concept or implementation-oriented design notes | Direction pause | `design` | Record `skill_invocation_unavailable`; fall back to Impeccable when its method fits, otherwise block | [`MengTo/Skills@5f47e38`](https://github.com/MengTo/Skills/tree/5f47e38), [MIT](https://github.com/MengTo/Skills/blob/5f47e38/LICENSE) | Selected direction controls over competing visual concepts |
| Jakub Krehel | Typography, layout, or refined web visual craft needs focused review | Jakub Krehel exclusion: non-web surface or no visual-craft signal | Inspectable web surface and approved route | `design.md` | Focused visual-craft critique | Direction pause | `design` | Record `skill_invocation_unavailable`; retain approved Impeccable direction without silent substitution | [`jakubkrehel/skills@267330e`](https://github.com/jakubkrehel/skills/tree/267330e), [MIT](https://github.com/jakubkrehel/skills/blob/267330e/LICENSE) | Specialist detail can't overturn scope or behavior without loopback |
| Tastemaker | Existing or planned UI looks generic and needs stronger taste or brand character | Tastemaker exclusion: backend-only work or strict established design with no visual latitude | UI brief, brand constraints, and approved route | `design.md` | Taste critique or revised visual direction | Direction pause | `design` | Record `skill_invocation_unavailable`; use approved Impeccable route or block if distinctiveness is acceptance-critical | [`codeswithroh/tastemaker@20c438e`](https://github.com/codeswithroh/tastemaker/tree/20c438e), [MIT](https://github.com/codeswithroh/tastemaker/blob/20c438e/LICENSE) | User chooses between competing aesthetics |
| Owl-Listener | User feedback, interview evidence, or listening-led design synthesis is central | Owl-Listener exclusion: no user evidence and no research access | Source feedback with consent and discovery scope | `journey.md` | Research synthesis or user-need themes | Discovery pause | `journey` | Record `skill_invocation_unavailable`; use existing cited evidence or block unsupported user claims | [`Owl-Listener/designer-skills@9a6930c`](https://github.com/Owl-Listener/designer-skills/tree/9a6930c), [MIT](https://github.com/Owl-Listener/designer-skills/blob/9a6930c/LICENSE) | User evidence outranks unsupported aesthetic preference; user resolves true conflicts |
| Leonxlnx | Final UI needs a taste-focused audit after direction is stable | Leonxlnx exclusion: early discovery, non-UI work, or unresolved product direction | Inspectable near-final UI and approved design | `design.md` | Taste audit and bounded polish list | Pre-task handoff pause | `design` | Record `skill_invocation_unavailable`; continue only if existing review evidence satisfies handoff | [`Leonxlnx/taste-skill@e79ca9e`](https://github.com/Leonxlnx/taste-skill/tree/e79ca9e), [MIT](https://github.com/Leonxlnx/taste-skill/blob/e79ca9e/LICENSE) | Audit may refine, not silently replace, approved direction |

Matrix provenance describes research, not guaranteed capability. Confirm each
repository's license and current instructions before on-demand installation.

## Loopbacks

Loopbacks repair the artifact that owns changed meaning:

- `journey owns route changes`; refresh route, approval, branch, and evidence
  receipts.
- `proposal owns intent or scope changes`; then reconcile affected specs and
  design.
- `specs own behavior changes`; reconcile scenarios and any design or ADR
  consequences.
- `design owns implementation-guardrail changes`; rerun ADR review before task
  handoff.

Propose loopback with reason, affected outputs, and branch IDs. Continue only
after `pause_loopback_acceptance`. Re-read dependencies from CLI metadata,
repair downstream content, refresh status, validate, and record receipt. Existing
downstream files don't prove semantic freshness.

`<changeRoot>/adr.md` is change-local completion manifest. Repository ADRs hold
accepted durable decisions; accepted ADRs are immutable. Supersede one with a
new ADR rather than editing history. A changed architecture decision loops back
through `design`, then produces updated ADR review or a superseding repository
ADR as appropriate.

## Sibling Sync And Archive Reconciliation

Track stable sibling change IDs and overlapping capabilities in `journey.md`.
When a sibling completes sync or archive, re-read concrete canonical files in
`openspec/specs/`. Compare them with this change's concrete dependency paths and
refreshed `existingOutputPaths`. Then refresh status, reconcile journey,
proposal, specs, design, and ADR content in ownership order, validate the schema
and change, and record a reconciliation receipt before handoff.

OpenSpec sync and archive update canonical specs through supported lifecycle
commands. They don't choose among design branches or resolve semantic conflict.
Editing a predecessor does not automatically invalidate downstream artifacts.
Agents must detect overlap, request user decisions, and repair affected content.

## Skills And Installation Boundary

Baseline installation may provide Impeccable plus Matt Pocock's `grill-me`,
`grill-with-docs`, `grilling`, and `domain-modeling`. These support default UI
routing, mandatory discovery, durable interview notes, and shared terminology.

Eight specialist repositories are on demand. They are not bundled by this
schema, not guaranteed installed or callable, and not lifecycle authorities.
Install only approved routes after checking source, license, host compatibility,
and local collision policy. Never report a skill result without a real
invocation receipt.

## Optional MCP Resources

`mcp.yaml` is this schema's optional remote-MCP catalog. It declares
read-only, no-auth resources only. `inspo` uses
`https://inspomcp.dev/api/mcp`; `ui-skills` uses
`https://www.ui-skills.com/mcp`.

An agent first identifies host from project evidence. Explicit current or prior
user approval is reused; otherwise it asks once. Only approved setup invokes:

```sh
openspec-schemas install intent-driven-design -t . --mcp all -a <atomic|omp|opencode|pi>
```

Use `--mcp inspo` or `--mcp ui-skills` for one catalog entry. `-a|--agents`
selects host. Atomic writes `.mcp.json`; Oh My Pi writes `.omp/mcp.json`;
OpenCode writes an existing sole project config or `opencode.jsonc`. Existing
server entries are preserved as direct `mcp.<server>` remote entries. A
different selected entry stops unless `--force`
explicitly replaces that entry alone. Pi has no native MCP config: setup is
guided-only until user selects compatible Pi extension. No catalog use means no
host detection or MCP config mutation. A later MCP opt-in reuses an installed
schema without requiring schema replacement or `--force`.

## Associated Skills

These five manifest skills are installed automatically into `.agents/skills/`
by the install guide's skills step:

- [`impeccable`](https://github.com/pbakaus/impeccable/tree/f2c7051/.agents/skills/impeccable) - Runs default UI and product design critique and direction.
- [`grill-me`](https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/productivity/grill-me) - Stress-tests a plan or design through focused questions.
- [`grill-with-docs`](https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/engineering/grill-with-docs) - Runs discovery while producing durable ADR and glossary material.
- [`grilling`](https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/productivity/grilling) - Supplies mandatory material-decision discovery protocol.
- [`domain-modeling`](https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd/skills/engineering/domain-modeling) - Sharpens shared domain terms and durable decisions.

## Research Provenance

Pinned links form reproducible research snapshot used for this guide:

- [Impeccable](https://github.com/pbakaus/impeccable/tree/f2c7051)
- [Matt Pocock skills](https://github.com/mattpocock/skills/tree/74ca5fe077456a0b3b2f5310cf9430999fd0b5fd)
- [Emil Kowalski skills](https://github.com/emilkowalski/skills/tree/85e8e23)
- [Garden Skills](https://github.com/ConardLi/garden-skills/tree/aaf9a82)
- [Elaya Design skills](https://github.com/elayadesign/ai-design-skills/tree/1c1e97c)
- [MengTo Skills](https://github.com/MengTo/Skills/tree/5f47e38)
- [Jakub Krehel skills](https://github.com/jakubkrehel/skills/tree/267330e)
- [Tastemaker](https://github.com/codeswithroh/tastemaker/tree/20c438e)
- [Owl-Listener designer skills](https://github.com/Owl-Listener/designer-skills/tree/9a6930c)
- [Leonxlnx taste skill](https://github.com/Leonxlnx/taste-skill/tree/e79ca9e)

Pins don't promise current behavior forever. Installer manifests identify
repository and path but resolve a mutable default-branch checkout unless the
installer explicitly supports refs. Compare installed content with research
snapshot before relying on claims here.

## Validate

```sh
openspec schema validate intent-driven-design
```

Also refresh OpenSpec status and inspect all resolved outputs before declaring
journey or reconciliation complete.

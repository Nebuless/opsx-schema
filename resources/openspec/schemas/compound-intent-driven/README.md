# Compound Intent-Driven OpenSpec Schema

`compound-intent-driven` keeps OpenSpec as workflow authority while adapting
[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)'s
core engineering loop:

```text
define -> plan -> build -> simplify -> review -> compound
```

It maps that loop onto OpenSpec artifacts instead of creating parallel plan or
tracker files:

- `proposal` defines intent, alternatives, scope, success signals, and prior
  learning (`ce-brainstorm`), then define completes concrete capability specs.
- `specs` makes each approved capability observable and testable.
- `design` records execution guardrails, stable implementation units, batches,
  layers, path claims, proofs, and continuation conditions (`ce-plan`).
- `adr` keeps only durable architecture decisions.
- `tasks` converts units into vertical, dependency-ordered, tracked slices.
- `apply` implements, simplifies settled code, reviews final diff, validates,
  then captures only durable lessons (`ce-work`, `ce-simplify-code`,
  `ce-code-review`, `ce-compound`).

- Good fit: non-trivial product or platform work needing explicit intent,
  reusable learning, and a bounded build-review loop.
- Not a good fit: small tactical fixes, documentation-only changes, dependency
  bumps, or changes with no material decision; use `minimalist` instead.

## Activate

Artifact paths come from CLI `status`/`instructions`: use `changeRoot`,
`artifactPaths`, `resolvedOutputPath`, and concrete dependency paths. `generates`
is relative to `changeRoot`. For `specs/**/*.md`, write non-empty
`<changeRoot>/specs/<capability>/spec.md` files, never a literal glob or empty
directory. Verify file contents and refreshed `existingOutputPaths` and status.
Missing metadata blocks work; never guess a repository-local change root.

```yaml
schema: compound-intent-driven
```

## Stage Gates

```text
proposal -> (specs, design) -> adr -> tasks -> apply
```

`specs` and `design` each require `proposal` and may proceed in parallel. `adr`
requires `design`; `tasks` requires `specs` and `adr`; `apply` tracks
`tasks.md` checkboxes.

The loop is intentionally compact:

1. **Define:** `proposal.md` resolves user-visible intent before implementation.
   It uses repository evidence and relevant `docs/solutions/` learnings first;
   user questions remain only for material decisions evidence cannot settle.
2. **Plan:** `design.md` turns approved intent into implementation guardrails.
   Stable `U1`, `U2`, … units own batch, layer, path claim, proof, and
   continuation fields. They never renumber. `tasks.md` carries those fields in
   prose below parser-safe checkboxes.
3. **Build:** an outer loop selects one ready task and may assign one bounded
   worker. A pre-created worktree is optional after dependency, path-isolation,
   repository-instruction, and ownership checks. Workers run named proof before
   checking a box. Unsafe or oversized work returns continuation evidence for
   the same task instead of claiming completion.
4. **Simplify:** each settled code unit gets a scope-bounded reuse, clarity, and
   efficiency pass. Mechanical and docs-only changes skip it.
5. **Review:** final diff is checked against the change artifacts, in-force ADR
   context, and project standards. Verified in-scope findings are fixed.
6. **Compound:** a learning is written only when its reasoning is non-obvious,
   durable, material, and not already recoverable from code, tests, comments,
   or existing documentation.

## Spec Format

Specs use normal OpenSpec Markdown deltas. Each requirement uses
`### Requirement:` plus SHALL/MUST wording. Each scenario uses exactly
`#### Scenario:` with `GIVEN`, `WHEN`, and `THEN` steps. Every requirement has
at least one scenario. A `MODIFIED` requirement copies its complete existing
block from `openspec/specs/<capability>/spec.md` before editing.

This schema does not install an executable-spec harness. Existing repository
tests or the targeted proof named by each task remain verification authority.

## ADR Persistence

`adr.md` is a change-local review manifest. Repository-level decisions live in
`<repo>/adr/`. Accepted ADRs stay immutable; a new decision creates a new ADR
with `Supersedes:` rather than changing prior text.

## Validate

```bash
openspec schema validate compound-intent-driven
```

## Associated Skills

`skills.txt` declares optional source-qualified companion skills: MIT-licensed
core-loop skills from
[EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin).
It also declares optional lifecycle skills from
[Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec):
`openspec-explore`, `openspec-propose`, `openspec-apply-change`,
`openspec-sync-specs`, and `openspec-archive-change`.
Run the catalog installer to copy them into a target project's
`.agents/skills/`:

```bash
bash /path/to/openspec-schemas/scripts/install-schema-skills.sh \
  openspec/schemas/compound-intent-driven .
```

- `ce-brainstorm` — intent, alternatives, scope boundaries, and success signals.
- `ce-plan` — evidence-grounded implementation guardrails and stable units.
- `ce-work` — implementation plus targeted local verification.
- `ce-simplify-code` — behavior-preserving cleanup of settled code.
- `ce-code-review` — diff review against intent and project standards.
- `ce-compound` — durable learning capture when it clears its eligibility bar.

OpenSpec lifecycle skills are optional companion helpers. OpenSpec CLI JSON
remains lifecycle authority; normal CE skills remain unchanged, focused
helpers.

The source plugin is MIT licensed. This schema is an independent, compact
mapping of its documented core loop to OpenSpec artifacts; it does not copy the
plugin's complete workflow or create a competing lifecycle.

## Shipped Host Command Adapters

`skills.txt` supplies optional companion skills, not commands. Nine
artifact-first adapters ship separately, with canonical host-neutral bodies
under `adapters/shared/`. OpenCode resources add only description frontmatter;
Senpi, Pi, and Atomic resources are byte-identical plain templates.

From this repository clone, choose your installed host:

```sh
sh scripts/install-compound-adapters.sh opencode /path/to/project
sh scripts/install-compound-adapters.sh senpi /path/to/project
sh scripts/install-compound-adapters.sh pi /path/to/project
sh scripts/install-compound-adapters.sh atomic /path/to/project
```

OpenCode uses `.opencode/commands`; Senpi uses `.senpi/prompts`; Pi uses
`.pi/prompts`; Atomic uses `.atomic/prompts`. Target
defaults to `.`. All sources and targets are checked before mutation; collisions
require explicit `--force`, which replaces only declared regular files and
rejects directories and symlinks. Unrelated files stay untouched. This offline
installer installs neither host runtimes nor OpenSpec nor skills. Confirm
resource discovery in your installed host after installation.

```text
/opsx-ce-define [change]
/opsx-ce-plan [change] <specs|design|adr|tasks>
/opsx-ce-work [change] [task]
/opsx-ce-debug [change] [task]
/opsx-ce-review [change]
/opsx-ce-validate [change]
/opsx-ce-compound [change]
/opsx-ce-continue [change] <artifact|task>
/opsx-ce-bulk-continue [change] <selection...>
```

Each adapter resolves the selected change, reads `openspec status` and the
relevant `openspec instructions`, reads every concrete dependency or context
file, performs only its owned stage, reruns status, and hands the next context
back to OpenSpec. It must not start a second lifecycle or invoke CE-native side
effects such as separate plan files, todo trackers, commits, branches, pushes,
issues, or pull requests.

Worktrees, when used, are pre-created and owned by an outer controller after
isolation checks. Adapters and bounded workers don't create or manage them.
Worktree use never permits automatic branches, commits, pushes, pull requests,
archival, or lifecycle advancement.

### Artifact-First Handoff Packet

Every invocation builds a packet from OpenSpec before asking Compound
Engineering to act:

```text
change
schemaName
planningHome
changeRoot
actionContext
artifactId or taskId
instruction
resolvedOutputPath
dependencies or contextFiles
settled decisions
allowed mutation paths
```

Artifact contents and settled decisions are inputs, not prompts to repeat
discovery. The adapter must not ask planning questions already answered by the
packet. Questions are allowed only when required input is absent, artifacts
conflict, a material choice remains unsettled, or safe bounded work cannot
continue. Answers belong in the OpenSpec artifact that owns the decision.

### Stage Ownership

- `/opsx-ce-define` may update proposal intent within its resolved output path.
- `/opsx-ce-plan` writes one explicitly selected ready artifact: specs, design,
  adr, or tasks. It never skips prerequisite gates or creates a separate CE
  plan. Repository-level ADR creation requires separately authorized work.
- `/opsx-ce-work` may change only the selected task's allowed implementation
  paths and its OpenSpec task status.
- `/opsx-ce-debug` may diagnose and fix only the selected task or failure scope;
  design changes return to the owning OpenSpec artifact first.
- `/opsx-ce-review` reports or fixes verified findings within allowed mutation
  paths. OpenSpec artifacts remain review criteria.
- `/opsx-ce-validate` runs named proofs and OpenSpec validation, then reports
  evidence without creating release or repository side effects.
- `/opsx-ce-compound` may write only eligible durable learning at the path
  allowed by the packet.

On every handoff, an adapter returns completed work, proof or findings,
mutations, continuation or unresolved questions, refreshed OpenSpec status, and
the exact next OpenSpec command. It does not select the next stage itself.
OpenSpec owns artifact state, stage readiness, progression, and completion.
Continuation routers use repeated one-operation invocations and never
auto-archive. Bulk continuation requires explicit selected changes, builds
candidates independently, runs concurrent operations only for disjoint
non-sync/non-archive operations, and serializes all other candidates in stable
order. Archive remains gated by direct user consent. Router packets include
outcome, selected change/schema, artifact or task, batch, worker, dependency
layer, proof, mutations, refreshed OpenSpec state, continuation, blocker, and
one exact next command.
When multiple planning artifacts are ready, stable order is `specs`, `design`,
`adr`, then `tasks`.

## Offline Adapter Checks

```sh
sh scripts/test-compound-adapters.sh
sh scripts/test-install-compound-adapters.sh
```

Run from the repository clone. Checks cover nine canonical bodies, host
frontmatter/body parity, stage guardrails, all host mappings, collision
preflight, force replacement, missing sources, symlink refusal, default target,
and preservation of unrelated files. These tests make no network calls and
do not require a host runtime. They validate shipped instructions and installer
behavior, not an LLM's compliance with instructions.

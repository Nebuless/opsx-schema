# Intent-Driven Superpowers OpenSpec Schema

`intent-driven-superpowers` is a proposal-to-tasks workflow for changes where
contributor intent, observable behaviour, technical design, durable
architectural decisions, and disciplined implementation verification should
all be captured before implementation.

It combines OpenSpec artifact gates with selected skills from
[Superpowers](https://github.com/obra/superpowers) and
[Matt Pocock's skills](https://github.com/mattpocock/skills). OpenSpec remains
workflow authority; companion skills provide conditional discipline at each
stage rather than a second workflow engine.

- Good fit: product or platform changes with meaningful behaviour, long-lived
  design decisions, cross-module work, or architecture choices that future
  changes should honor.
- Not a good fit: small tactical fixes, docs-only changes, dependency bumps, or
  behaviour-only work where `behaviour-driven` is enough.

## Activate

Artifact paths come from CLI `status`/`instructions`: use `changeRoot`,
`artifactPaths`, `resolvedOutputPath`, and concrete dependency paths. `generates`
is relative to `changeRoot`. For `specs/**/*.md`, write non-empty
`<changeRoot>/specs/<capability>/spec.md` files, never a literal glob or empty
directory. Verify file contents and refreshed `existingOutputPaths` and status.
Missing metadata blocks work; never guess a repository-local change root.

Set this in `openspec/config.yaml`:

```yaml
schema: intent-driven-superpowers
```

No other keys are required to activate the schema.

## Stage Gates

Artifact order:

```text
proposal -> (specs, design) -> adr -> tasks
```

`specs` and `design` each require only the proposal and can proceed in
parallel; `adr` requires `design`; `tasks` requires `specs` and `adr`. Apply
requires `tasks` and tracks `tasks.md` checkboxes.

Gate expectations:

- `proposal` states why the change matters, lists capabilities that need
  behaviour specs, and records canonical domain terms (`domain-modeling`).
  `research` and `grilling` are conditional: use them only for unresolved
  external facts or material decisions.
- `specs` creates one OpenSpec Markdown delta file per capability at
  `specs/<capability>/spec.md`, written in Gherkin style (`gherkin-authoring`)
  with consistent terms (`glossary`). `spec-as-source` and
  `acceptance-test-authoring` are opt-in when specs must run as acceptance
  tests.
- `design` explains implementation approach, accounts for in-force ADRs,
  evaluates interfaces and seams, prefers deep modules and locality
  (`codebase-design`), and may use `c4-diagrams`. `prototype` is only for
  material UI/state questions existing evidence cannot settle.
- `adr` writes the per-change ADR review manifest. Durable repository-level
  ADRs are created only for major decisions (`architectural-decision-records`).
- `tasks` are vertical, dependency-ordered, independently verifiable slices.
  Use `tdd` for new behaviour and `diagnosing-bugs` for reported bugs.
- `apply` may use `using-git-worktrees` and `subagent-driven-development` when
  isolation or independent work warrants it. Before completion use
  `verification-before-completion`, `requesting-code-review`,
  `receiving-code-review`, then `finishing-a-development-branch` as applicable.

The schema intentionally does not require every skill for every change.

## Spec Format

Use OpenSpec Markdown delta headers so archive can merge the change:

```md
## ADDED Requirements

### Requirement: User data export
The system SHALL let a user export their own saved data.

#### Scenario: Successful CSV export
- **GIVEN** a user has saved data
- **WHEN** the user exports their data as CSV
- **THEN** the system provides a CSV file containing the user's data
```

Requirements use `### Requirement:` with SHALL/MUST wording; scenarios use
exactly four hashtags (`#### Scenario:`) with `GIVEN`/`WHEN`/`THEN` steps. Every
requirement needs at least one scenario. `MODIFIED` entries copy the entire
existing requirement block from `openspec/specs/<capability>/spec.md` before
editing, so no detail is lost at archive time.

## Executable Specs Are Skill-Provided

This schema ships no fenced-Gherkin format, extraction tooling, or acceptance
runner. The opt-in
[`spec-as-source`](https://github.com/intent-driven-dev/skills/tree/main/.agents/skills/spec-as-source)
skill, with `gherkin-authoring` and `acceptance-test-authoring`, provides that
workflow and overrides the `spec.md` and `tasks.md` templates when active.
Use this schema alone when artifact discipline without a test harness is
enough.

## ADR Persistence

The `adr` artifact completion signal is the change-local review manifest at
`<changeRoot>/adr.md` at CLI `resolvedOutputPath`. Durable ADR files live under the target
repository's top-level `adr/` folder beside `openspec/`, never inside the
OpenSpec change folder. Accepted ADRs are immutable; supersession is recorded
by a new ADR whose `Supersedes:` field names the prior one.

## Validate

```bash
openspec schema validate intent-driven-superpowers
```

## Associated Skills

Companion skills are declared in `skills.txt` as source-qualified lines of the
form `<owner/repository><TAB><repository-relative-skill-directory>`. They are
installed by `scripts/install-schema-skills.sh` (see `AGENT_INSTALL.md`),
which clones each source repository once and copies each complete skill
directory into `.agents/skills/`.

The installer refuses existing skill directories by default. Pass `--force`
only when intentional replacement is authorized.

From [intent-driven-dev/skills](https://github.com/intent-driven-dev/skills):

- `acceptance-test-authoring` — acceptance-suite setup and reports.
- `architectural-decision-records` — drafting and reviewing ADRs.
- `c4-diagrams` — C4-style architecture diagrams.
- `gherkin-authoring` — writing and reviewing Gherkin scenarios.
- `glossary` — consistent domain and technical terms.
- `openspec-git-discipline` — Git hygiene for OpenSpec workflows.
- `spec-as-source` — opt-in executable specs and acceptance-first tasks.

From [mattpocock/skills](https://github.com/mattpocock/skills):

- `code-review` — review against change artifacts and repository standards.
- `codebase-design` — interfaces, seams, module depth, and locality.
- `diagnosing-bugs` — reproduction and root-cause diagnosis before fixes.
- `domain-modeling` — sharpening domain terms and boundaries.
- `grilling` — decision-tree interviews for unresolved design questions.
- `improve-codebase-architecture` — targeted deepening for recurring codebase friction.
- `prototype` — throwaway prototypes for material UI/state questions.
- `research` — cited external-fact research when codebase evidence is absent.
- `tdd` — behavior-first tests at pre-agreed seams.

From [obra/superpowers](https://github.com/obra/superpowers):

- `finishing-a-development-branch` — verify and integrate completed work.
- `receiving-code-review` — evaluate review feedback against evidence.
- `requesting-code-review` — request scoped review before integration.
- `subagent-driven-development` — isolated implementation and review loops.
- `systematic-debugging` — root-cause debugging discipline.
- `test-driven-development` — RED/GREEN/REFACTOR development loop.
- `using-git-worktrees` — isolated workspaces for implementation.
- `verification-before-completion` — fresh evidence before completion claims.

All listed sources are MIT licensed. For more schemas, see
https://github.com/intent-driven-dev/openspec-schemas.

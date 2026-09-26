# Intent-Driven Engineering OpenSpec Schema

`intent-driven-engineering` is a copyable extension of `intent-driven`. It
keeps the same artifact graph and OpenSpec mechanics and adds phase guidance
drawn from selected [Matt Pocock](https://github.com/mattpocock/skills)
engineering skills, so planning and implementation land on the smallest
relevant discipline at each stage instead of applying every practice to every
change.

- Good fit: product or platform changes with meaningful behaviour, long-lived
  design decisions, or cross-module work where domain clarity, design seams,
  and disciplined verification matter.
- Not a good fit: small tactical fixes or dependency bumps; use `minimalist`,
  or `behaviour-driven` when the ADR step is not needed.

## Activate

Artifact paths come from CLI `status`/`instructions`: use `changeRoot`,
`artifactPaths`, `resolvedOutputPath`, and concrete dependency paths. `generates`
is relative to `changeRoot`. For `specs/**/*.md`, write non-empty
`<changeRoot>/specs/<capability>/spec.md` files, never a literal glob or empty
directory. Verify file contents and refreshed `existingOutputPaths` and status.
Missing metadata blocks work; never guess a repository-local change root.

Set this in `openspec/config.yaml`:

```yaml
schema: intent-driven-engineering
```

No other keys are required to activate the schema.

## Stage Gates

Artifact order (identical to `intent-driven`):

```text
proposal -> (specs, design) -> adr -> tasks
```

`specs` and `design` each require only the proposal and can proceed in
parallel; `adr` requires `design`; `tasks` requires `specs` and `adr`. Apply
requires `tasks` and tracks `tasks.md` checkboxes.

Gate expectations:

- `proposal` states why the change matters, lists the capabilities that need
  behaviour specs, and records canonical domain terms
  (`domain-modeling`). When the proposal depends on an unresolved external
  fact, it is researched from authoritative sources and cited
  (`research`); otherwise that section is omitted. When a material product or
  design decision remains, `grilling` resolves the currently unblocked branch
  of its decision tree with the user before planning continues.
- `specs` creates one OpenSpec Markdown delta file per capability at
  `specs/<capability>/spec.md`, written in Gherkin style
  (`gherkin-authoring`) using the proposal's canonical terms (`glossary`).
  The `spec-as-source` and `acceptance-test-authoring` companions are
  opt-in: adopt them only when specs must run as acceptance tests.
- `design` explains the implementation approach and accounts for currently
  in-force ADRs. It evaluates module interfaces, records seams where
  behaviour is injected or swapped, prefers deep modules and locality
  (`codebase-design`), may add a C4-style diagram (`c4-diagrams`), and may
  run a throwaway prototype only when a material UI/state question cannot be
  settled from existing evidence (`prototype`).
- `adr` writes the per-change ADR review manifest at
  `<changeRoot>/adr.md` at CLI `resolvedOutputPath` after design and before task planning.
  Durable repository-level ADR files are created only when the change
  introduces a major architectural decision that should persist beyond the
  change (`architectural-decision-records`).
- `tasks` are planned only after proposal, specs, design, and ADR artifacts
  are complete, as vertical, dependency-ordered, independently verifiable
  slices. Every task names its own targeted verification.
- `apply` picks the discipline per task: tight binary repro then diagnosis
  for reported bugs (`diagnosing-bugs`); failing-test-first at seams named
  in the design for new behaviour (`tdd`); direct implementation otherwise.
  Before completion it runs each task's targeted verification, strict change
  validation, schema validation when the schema itself changed, and a review
  of the implementation against the change artifacts and repository
  standards (`code-review`).

## Spec Format

Identical to `intent-driven`: OpenSpec Markdown delta headers, `### Requirement:`
blocks with SHALL/MUST wording, and scenarios with exactly four hashtags
(`#### Scenario:`) and `GIVEN`/`WHEN`/`THEN` steps. Every requirement needs at
least one scenario. `MODIFIED` entries copy the entire existing requirement
block from `openspec/specs/<capability>/spec.md` before editing.

## Executable Specs Are Skill-Provided

As in `intent-driven`, the schema ships no fenced-Gherkin format, extraction
tooling, or acceptance-test runner. The opt-in `spec-as-source` skill (with
`gherkin-authoring` and `acceptance-test-authoring`) provides all of that and
overrides the `spec.md` and `tasks.md` templates when active.

## ADR Persistence

The `adr` artifact completion signal is the change-local review manifest at
`<changeRoot>/adr.md` at CLI `resolvedOutputPath`. Durable ADR files live under the target
repository's top-level `adr/` folder beside `openspec/`, never inside the
OpenSpec change folder. Accepted ADRs are immutable; supersession is recorded
by a new ADR whose `Supersedes:` field names the prior one.

## Validate

```bash
openspec schema validate intent-driven-engineering
```

## Associated Skills

Companion skills are declared in `skills.txt` as source-qualified lines of the
form `<owner/repository><TAB><repository-relative-skill-directory>`. They are
installed by `scripts/install-schema-skills.sh` (see `AGENT_INSTALL.md`), which
clones each declared source repository once and copies the complete skill
directory into `.agents/skills/`.

From [intent-driven-dev/skills](https://github.com/intent-driven-dev/skills):

- `acceptance-test-authoring` — acceptance-suite setup: Gherkin extraction, runners for both stacks, linting, and reports.
- `architectural-decision-records` — drafting/reviewing ADRs; includes MADR, Nygard, and Y-statement templates.
- `c4-diagrams` — C4-style architecture diagrams in ASCII or Mermaid.
- `gherkin-authoring` — writing and reviewing Gherkin/BDD scenarios.
- `glossary` — keeping domain/technical terms consistent across artifacts.
- `openspec-git-discipline` — git hygiene for OpenSpec propose/apply/archive workflows.
- `spec-as-source` — opt-in workflow making `spec.md` the executable source of truth.

From [mattpocock/skills](https://github.com/mattpocock/skills) (`skills/engineering/`):

- `code-review` — two-axis review against change artifacts and repository standards before completion.
- `codebase-design` — interfaces, seams, module depth, and locality for design decisions.
- `diagnosing-bugs` — tight binary reproductions, then diagnosis before fixing reported bugs.
- `domain-modeling` — challenging and sharpening domain terms while planning.
- `prototype` — optional throwaway prototypes to settle material UI/state questions.
- `research` — external-fact research with citations when the codebase cannot answer.
- `tdd` — behavior-first tests at pre-agreed seams for new behaviour.
- `grilling` — decision-tree interviews that resolve each available design question in dependency order.

Both sources are MIT licensed. For more schemas, refer to
https://github.com/intent-driven-dev/openspec-schemas.

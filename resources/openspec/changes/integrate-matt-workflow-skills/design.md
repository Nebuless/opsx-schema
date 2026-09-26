## Context

See `proposal.md` for motivation. This repository ships copyable schema folders and an agent-readable installation guide. `intent-driven` already supplies correct artifact ordering and companion skills, but `skills.txt` assumes every skill exists under `intent-driven-dev/skills/.agents/skills/`. Matt Pocock's engineering skills are stored under `skills/engineering/` in a different repository. OpenSpec validates schema structure, not third-party skills or installation behavior.

## Goals / Non-Goals

**Goals:**

- Keep a conventional `skills.txt` file beside every schema.
- Make one portable POSIX installer the source of install semantics.
- Keep existing bare-name manifests working unchanged.
- Create a selectable schema that directs each OpenSpec stage to the smallest relevant engineering discipline.
- Prove schema validity, install behavior, and a change lifecycle in an isolated consumer project.

**Non-Goals:**

- Modify OpenSpec CLI or its built-in workflows.
- Vendor third-party skill contents.
- Add an issue tracker, required commits, a `CONTEXT.md` convention, or an acceptance-test framework.
- Make optional exploration, research, prototyping, or ADR creation mandatory when no condition calls for it.

## Decisions

### Tab-delimited source-aware manifest

A manifest line has one of two forms:

```text
<legacy-skill-name>
<github-owner/repository><TAB><repository-relative-skill-directory>
```

The legacy form continues to resolve as `intent-driven-dev/skills/.agents/skills/<legacy-skill-name>`. The source-aware form resolves a GitHub repository clone and an explicitly scoped directory inside it. Tabs make source versus path unambiguous and avoid a new parser dependency. Comments and blank lines are ignored.

The schema owns source/path declarations. The installer derives the destination skill name from the final source-directory segment, preserving each source's complete directory tree and preventing display-name drift.

### One installer with preflight and explicit replacement

Add `scripts/install-schema-skills.sh <schema-dir> [target-dir] [--force]`. It validates every declaration and target before mutating. Sources must match `owner/repository`; paths must be normalized relative paths with no `..` segments; source paths must resolve to directories. It clones each source once in a private temporary directory, then copies complete directories. Existing target skill directories cause failure unless `--force` is explicit.

Preflight prevents a partially installed target when a later declaration is invalid or collides. `--force` removes only declared target skill directories, never the target directory itself. `trap` removes temporary clones.

### Extension schema, not mutation

Add `intent-driven-engineering` as a new copyable schema derived from `intent-driven`. Existing `intent-driven` stays stable. The extension keeps the exact artifact graph and adds only phase guidance:

- `proposal`: `domain-modeling`, `research` only for unresolved external facts, and `grilling` only for material user decisions that evidence cannot resolve.
- `specs`: existing `gherkin-authoring`, `glossary`, and optional executable-spec companion skills.
- `design`: `codebase-design`, `c4-diagrams`, ADR review, with `prototype` only when a UI/state question cannot be settled from existing evidence.
- `tasks`: vertical, independently verifiable slices without tracker-specific tickets.
- `apply`: `diagnosing-bugs` for bug reports; `tdd` for new behavior at established seams; `code-review` against the change artifacts and local standards after targeted verification.

The schema instructions name these skills but retain conditional language. This preserves OpenSpec as workflow authority and avoids heavyweight process for small changes.

### Verification contract

Task guidance requires appropriate targeted behavior checks. Behavior-spec changes require strict OpenSpec change validation. Schema modifications require `openspec schema validate intent-driven-engineering`. Review compares implementation with the change artifacts and repository standards; it does not require GitHub, a particular branch, or a commit.

## Risks / Trade-offs

- [Third-party source changes] → Each install reads the current default branch; the installer reports the source revision so consumers can audit or deliberately repeat it.
- [More installer logic than prose-only guide] → One short POSIX script centralizes parsing and can be smoke-tested; all schemas still retain readable `skills.txt` files.
- [Skill instructions conflict] → Extension schema states OpenSpec artifacts and CLI validation control planning and completion; imported skills are phase discipline, not a second workflow engine.
- [User-local customized skill] → Default collision failure preserves it; `--force` makes replacement intentional.

## Migration Plan

1. Add installer, extension schema, source-aware manifest, and documentation.
2. Validate the extension schema with OpenSpec.
3. Install it into an isolated consumer project using the installer without force.
4. Create an OpenSpec change in that consumer project, inspect stage/apply instructions, and run strict validation.
5. Existing schema users may retain existing manifests and the documented manual flow; no migration required.

## Open Questions

None.

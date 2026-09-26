# .omp/skills/opentui-react

## Purpose

OMP OpenTUI React skill with implementation references and validation scripts.

## Ownership

`SKILL.md` owns the skill contract; `references/` owns topic guidance; `scripts/` owns local validation and project-check helpers.

## Local Contracts

- Keep reference filenames and links stable.
- Scripts must validate the skill without changing unrelated project files.
- Documentation must match supported OpenTUI APIs and runtime behavior.

## Work Guidance

Update `SKILL.md` and affected references together. Use scripts as documented, not as substitute for source-level correctness.

## Verification

Use `scripts/validate-skill.mjs`, `scripts/self-check.mjs`, or targeted project checks named by the skill.

## Child DOX Index

No child DOX files. `references/` and `scripts/` are supporting leaves.

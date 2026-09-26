## Why

`intent-driven` currently installs companion skills from one hard-coded repository. It cannot declare Matt Pocock engineering skills, so consumers must reconstruct an incomplete feature workflow manually and cannot install the intended skill set deterministically.

## What Changes

- Add `intent-driven-engineering`, a copyable extension of `intent-driven` that keeps its proposal → specs/design → ADR → tasks workflow and integrates selected engineering disciplines at each stage, including Matt Pocock's current `grilling` skill instead of the legacy `grill-me` skill.
- Add a source-aware skill manifest format and installer that clone each declared source once, install complete skill directories, and refuse to overwrite local skills unless explicitly requested.
- Update `AGENT_INSTALL.md` and repository documentation so projects can install schemas with either legacy single-source manifests or source-aware manifests.
- Define OpenSpec CLI validation as the schema gate and make implementation guidance use specification fidelity, targeted verification, and review before completion.

## Capabilities

### New Capabilities

- `source-aware-schema-installation`: Schema consumers can install skills declared across trusted Git repositories without replacing a local customization by accident.
- `intent-driven-engineering-workflow`: Schema consumers can select a complete intent-driven feature workflow that applies domain modeling, architecture design, test/bug discipline, and review where each is relevant.

### Modified Capabilities

- None.

## Impact

- Adds `intent-driven-engineering` under `openspec/schemas/`; existing schemas and their legacy `skills.txt` manifests stay compatible.
- Adds a POSIX shell installer and source-aware manifest documentation.
- Uses skills from `intent-driven-dev/skills` and `mattpocock/skills`; both sources are MIT licensed.
- Affected schemas: `intent-driven-engineering`.

## Review Baseline

`4bb6de2f57c9275a18a4106341fe4632f5026ac6` (upstream `main` at work start).

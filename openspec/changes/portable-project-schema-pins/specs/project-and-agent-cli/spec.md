## ADDED Requirements

### Requirement: CLI reports schema-origin health consistently
CLI diagnostics and pin workflows SHALL distinguish verified linked-worktree relocation from true origin, content, retention or ownership drift and ambiguous legacy receipts. An independent clone or unverifiable common directory MUST NOT be treated as intact or silently rewritten. CLI errors MUST give actionable explicit re-pin guidance where origin proof is unavailable, and ordinary reads MUST remain read-only.

#### Scenario: Doctor checks proven relocation
- **GIVEN** a relocated pin in linked worktrees with verifiable shared live Git common-directory ownership, intact content and retained snapshot
- **WHEN** revision or skill-pin diagnostics run
- **THEN** CLI reports a healthy pin without a false shadow.

#### Scenario: Doctor checks ambiguous origin
- **GIVEN** an absolute-only receipt with inaccessible original worktree, a separate clone or an unverifiable common directory
- **WHEN** diagnostics or mutation preflight checks it
- **THEN** CLI reports an actionable unhealthy result and refuses to proceed as though intact, without changing pin or provenance.

### Requirement: CLI offers exact-change re-pin preview and recovery
`change re-pin <change> <schema>` SHALL preview one explicit same-name pin and SHALL apply only with its fresh `--apply-token`. It MUST run strict workflow validation against retained/target-equivalent bytes; only the explicitly reviewed historical-origin mismatch MAY be allowed for this re-pin operation. Every other validation result remains mandatory, and ordinary validation MUST NOT be relaxed. Associated changes MUST supply a complete reviewed compatible bundle/profile/skill-host selection, including an explicit empty profile set when applicable; the operation MUST refuse omitted or incompatible association rather than silently transferring ownership. `--recover` SHALL inspect a pending journal without mutation and SHALL require a separate fresh token to apply recovery. CLI JSON and text MUST use the existing response and nonzero-error contracts.

#### Scenario: Explicit re-pin of ambiguous legacy source
- **GIVEN** an exact pinned change with ambiguous old origin, intact retained snapshot and reviewed unshadowed current tracked schema of the same name and digest
- **WHEN** the operator previews and confirms the re-pin
- **THEN** the CLI records a new effective origin without inventing past history and without changing the pin or installed resources.

#### Scenario: Missing reviewed selection
- **GIVEN** a change associated with installed skills and no explicit compatible target selection
- **WHEN** `change re-pin` is previewed
- **THEN** CLI refuses the operation before writing and identifies the required selection review.

#### Scenario: Recovery requires a separate token
- **GIVEN** an incomplete re-pin journal
- **WHEN** `change re-pin <change> <schema> --recover` runs without a token
- **THEN** CLI describes exact absent, present or conflicting intent without mutation; only a fresh token from that recovery preview may authorize a guarded recovery Apply.

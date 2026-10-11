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
`change re-pin <change> <schema>` SHALL preview one explicit same-name pin and SHALL apply only with its fresh `--apply-token`. It MUST run strict completed workflow validation against retained/target-equivalent bytes; only the explicitly reviewed historical-origin mismatch MAY be allowed for this re-pin operation. Every other validation result remains mandatory, and ordinary validation MUST NOT be relaxed. For an eligible vanished absolute-only legacy source, preview MUST disclose that the old location and its former ownership cannot be verified, show the verified current location, and request explicit confirmation that this change should use it. The confirmation MUST bind to the exact preview and fresh Apply token; it does not authenticate the old origin. Associated changes MUST supply a complete reviewed compatible bundle/profile/skill-host selection, including an explicit empty profile set when applicable; the operation MUST refuse omitted or incompatible association rather than silently transferring ownership. `--recover` SHALL inspect a pending journal without mutation and SHALL require a separate fresh token and confirmation of that uncertainty to apply recovery. CLI JSON and text MUST use the existing response and nonzero-error contracts.

#### Scenario: Explicit repair of vanished legacy source
- **GIVEN** an exact pinned change whose missing absolute-only legacy source has normalized exact `openspec/schemas/<name>` shape and safe existing components, with intact retention and a reviewed, unshadowed, witnessed tracked current schema of the same name, digest and bundle
- **WHEN** the operator sees “The old location cannot be verified. The current schema matches the saved schema content. Confirm that this change should use the current location.” and explicitly confirms the exact preview with a fresh Apply token
- **THEN** the CLI appends a new effective origin while preserving the old record, pin, artifacts and installed resources, without claiming proof of the old source's ownership.

#### Scenario: Missing-source warning cannot be bypassed
- **GIVEN** an otherwise eligible vanished legacy source whose old ownership cannot be established
- **WHEN** the operator omits confirmation, changes the reviewed inputs before Apply, or requests recovery with an earlier token
- **THEN** CLI refuses the write and presents a fresh review of the current location and historical uncertainty.

#### Scenario: Missing reviewed selection
- **GIVEN** a change associated with installed skills and no explicit compatible target selection
- **WHEN** `change re-pin` is previewed
- **THEN** CLI refuses the operation before writing and identifies the required selection review.

#### Scenario: Recovery requires a separate token
- **GIVEN** an incomplete re-pin journal
- **WHEN** `change re-pin <change> <schema> --recover` runs without a token
- **THEN** CLI describes exact absent, present or conflicting intent without mutation; only a fresh token from that recovery preview may authorize a guarded recovery Apply.

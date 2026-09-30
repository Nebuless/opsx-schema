## MODIFIED Requirements

### Requirement: Explicit single-target unmanaged skill replacement
The CLI SHALL offer a separate guarded operation to replace exactly one named project-relative, existing unmanaged skill directory with one unambiguously declared source skill for an explicitly selected installed schema and declared bundle. Normal skill installation and schema switching MUST continue refusing unmanaged collisions. Replacement MUST NOT activate the schema, install unrelated skills or adapters, adopt matching bytes, or change a managed, modified, symlinked, unsupported, ambiguously mapped, or non-skill target.

#### Scenario: Five existing OMP collisions
- **GIVEN** a selected installed schema declaring 11 OMP skills, five unowned conflicting skill directories and six missing directories
- **WHEN** the caller previews replacement of one exact unowned skill
- **THEN** the preview identifies that skill's existing and declared source, every shared consumer, its backup target, and the remaining four collisions without claiming the full skill set is ready
- **AND** ordinary schema switch remains blocked until every selected collision is resolved and a fresh full-set preview is reviewed.

#### Scenario: Byte-identical unowned and edited managed resources
- **GIVEN** one byte-identical but unowned skill directory and another managed skill with local edits
- **WHEN** the caller requests replacement of each target
- **THEN** identical unowned bytes are not adopted without explicit reviewed backup/replacement, while the managed edited directory is refused without changing either tree.

### Requirement: Exact and informative preview
Replacement preview SHALL identify the exact target and backup location, declared schema/bundle/source, pre-existing and replacement tree digests, affected host/profile aliases, and a deterministic changed-file inventory with old/new content digests and modes. It SHALL show a reviewable textual diff for text content and identify non-text content by digest/mode without claiming it was text-reviewed. A safe bounded display MUST disclose any omitted diff content rather than silently truncate it. Preview SHALL require a unique, safe backup identifier bound to the token; an existing backup or receipt identifier MUST refuse without overwriting it.

#### Scenario: Mixed text and binary skill content
- **GIVEN** an unmanaged skill tree with changed text and non-text files
- **WHEN** the caller previews a single-target replacement
- **THEN** the preview includes a text diff where representable, path-level old/new digest and mode evidence for all changed files, and explicit binary or truncated markers where relevant.

### Requirement: Complete active-pin and freshness refusal
Preview and Apply MUST verify that active change pin/selection targets can be proven, the selected target is not required by any active pin, every referenced path is contained and free of symlinks or special entries, the source and target are stable, and ownership is unambiguous. Apply SHALL acquire compatible project/resource locks for Opsx-controlled mutations, recheck target identity/content, schema/source manifests, pin association and ownership under those locks, and require a fresh token for the exact reviewed target, backup identifier and effect. Incomplete active-pin knowledge, target/source edits, a newly occupied backup, or mismatched token MUST refuse without changing target or ownership. External OpenSpec commands and filesystem writers do not honor Opsx locks; the CLI SHALL report detected drift without claiming atomic exclusion from those writers, and checks at read and write boundaries detect observed drift rather than providing an atomic guarantee against non-cooperating writers.

#### Scenario: Active change becomes dependent after preview
- **GIVEN** replacement was previewed while no active change required its target
- **WHEN** an active change is created or reconciled to require that target before Apply
- **THEN** Apply refuses as stale or blocked; neither user skill nor ownership metadata is replaced.

#### Scenario: Target or backup path changes after preview
- **GIVEN** a replacement preview and its token
- **WHEN** the unmanaged target changes or the requested backup identifier is occupied before Apply
- **THEN** Apply refuses and does not repurpose the token or overwrite either target.

### Requirement: Verified backup and recoverable ownership transfer
Apply SHALL persist an exact transaction intent before touching the target, create an exclusively reserved contained backup, copy and verify the complete prior tree, stage and verify the declared source, and transfer the target only after both are verified. Ownership SHALL be recorded only for the installed verified declared source. Completion SHALL require matching target, ownership, and durable receipt evidence; verified backups MUST remain available. On interruption or failure, the operation SHALL restore only unchanged transaction-owned state where safe or report exact partial paths and observed states with an actionable inspected recovery route; it MUST NOT overwrite external edits, claim success on a partial write, or fabricate prior installer ownership. Cross-device backup SHALL use verified copying rather than relying on rename.

#### Scenario: Backup copy or cross-device rename restriction
- **GIVEN** the existing skill and backup destination cannot be moved with a filesystem rename or backup copying fails midway
- **WHEN** Apply tries to preserve the existing tree
- **THEN** it uses a verified safe copy path or fails with the original intact, exposes partial backup evidence, and does not claim a managed replacement.

#### Scenario: Failure after target swap
- **GIVEN** source staging and backup completed but the ownership update or durable receipt write fails
- **WHEN** Apply attempts recovery
- **THEN** it restores the original only if current target and ownership still match the transaction's recorded states; otherwise it preserves both trees, identifies the partial state and refuses new replacement attempts until inspected recovery.

### Requirement: Guarded receipt inspection and restoration
The CLI SHALL expose read-only exact-receipt inspection via `skills replace inspect <backup-id>` and separate preview/token-authorized restoration via `skills restore <backup-id>` for a completed or partial replacement. Restoration MUST check receipt identity, backup bytes, current target, ownership, and complete verified active-pin targets against its recorded state while holding compatible locks; it MUST refuse if an active pin now requires this target. It SHALL either restore the original tree without clobbering external work or refuse with exact manual-recovery evidence. It SHALL NOT erase backup/receipt evidence or infer historical change provenance.

#### Scenario: Restore after external modification
- **GIVEN** a successful replacement whose newly managed target has since been modified
- **WHEN** the caller previews restoring its backup
- **THEN** restoration is refused, custom and managed bytes remain untouched, and the receipt identifies why automatic rollback is unsafe.

#### Scenario: Restore after a new active pin
- **GIVEN** a successful replacement followed by an active change creation or reconciliation that requires its managed target
- **WHEN** the caller previews restoration or applies an earlier restoration token
- **THEN** restoration refuses under the verified active-pin guard and retains both managed target and backup.

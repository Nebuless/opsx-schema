## MODIFIED Requirements

### Requirement: Resolved immutable schema revisions
Schema selection SHALL show the effective named revision, resolved source and content identity, including graph, templates, instructions and declared resource manifests. A referenced revision MUST remain inspectable for active and archived changes; a same-name shadow, edit or missing referenced content MUST be reported rather than silently changing a change's effective behavior. A Git-tracked project-local revision MUST identify its origin independently of checkout absolute path. Relocation to a linked worktree MUST NOT cause shadow only when the recorded and current project origins demonstrably share the same still-resolvable Git common directory and corresponding tracked schema path. Independent clones and moved, replaced or unverifiable common directories MUST fail closed with explicit re-pin guidance. Schema name, digest, retained snapshot, real shadow, bundle identity, non-project origin and ownership checks remain independently required.

#### Scenario: Template-only customization
- **GIVEN** an active change pinned to a named revision and a local override with the same name but altered template text
- **WHEN** the application resolves that change or previews a switch
- **THEN** it reports revision drift and refuses mutation until the override is resolved or a distinct revision is selected.

#### Scenario: Verified linked-worktree relocation
- **GIVEN** a Git-tracked project-local pin with an intact retained snapshot and a recorded origin witness
- **WHEN** the change is opened at a different absolute path in a linked worktree sharing the same live common directory and tracked schema path, even after the original worktree is removed
- **THEN** revision health does not report shadow solely for the path change and still checks content, retention, bundle, origin and ownership independently.

#### Scenario: Independent clone or unavailable common directory
- **GIVEN** a separate clone, or a moved, replaced or unverifiable recorded Git common directory
- **WHEN** revision health is checked
- **THEN** the origin is unhealthy with explicit re-pin guidance even if schema bytes, remote, commit and path suffix match.

#### Scenario: Content, retention or genuine shadow
- **GIVEN** a verified linked origin with changed schema content, a missing or altered retained snapshot, or a different same-name schema origin
- **WHEN** revision health is checked
- **THEN** the corresponding drift, retention or shadow result remains unhealthy and cannot be hidden by common-directory proof.

#### Scenario: Legacy path with provable origin
- **GIVEN** an absolute-only legacy receipt whose original schema and worktree remain reachable
- **WHEN** both old and current worktrees independently verify corresponding tracked schemas under the same live Git common directory
- **THEN** the different absolute source may pass origin comparison, subject to all independent checks, without modifying the receipt.

#### Scenario: Ambiguous legacy path
- **GIVEN** an absolute-only receipt whose original worktree or common-directory ownership cannot be verified
- **WHEN** revision health is checked from a different path
- **THEN** the pin remains unhealthy, diagnostics require explicit re-pin, and no witness is backfilled by the read.

## ADDED Requirements

### Requirement: Exact effective re-pin history
Opsx MUST preserve existing creation, retention and migration entries, and MUST append each reviewed re-pin as a distinct ordered event with unique operation ID, exact prior and target references, migration position and explicit association disposition. Historical equality and preview freshness MUST remain exact; only recorded-to-live origin comparison may accept verified relocation. Strict history folding MUST reject duplicate, out-of-order, conflicting, partial or mismatched events. The final effective reference MUST agree with the live OpenSpec pin. Reads MUST NOT rewrite history.

#### Scenario: Re-pin then migrate
- **GIVEN** a change with a valid re-pin event
- **WHEN** a later migration is previewed and recorded
- **THEN** it begins at the re-pinned effective reference, retains the event and earlier receipts, and remains inspectable after archive.

#### Scenario: Invalid event chain
- **GIVEN** a duplicate operation ID, mismatched `from`, invalid migration position or inconsistent final effective reference
- **WHEN** history is read or a mutation is previewed
- **THEN** it is invalid or refused without repair on read.

### Requirement: Reviewed association history
Version-2 provenance MUST distinguish no reviewed skill association from one established at an exact migration and re-pin position. Creation and explicit selection reconciliation MUST record establishment before dependent transitions. Associated migration MUST record exact validated association-before and association-after tied to its from/to revisions and a reviewed target; without that review it MUST refuse mutation. Strict folding MUST reject missing, partial, duplicate, out-of-order, out-of-bounds or mismatched establishment and transition evidence. Version-1 history, including paired migration receipts, MUST remain readable under its documented legacy interpretation, but a pair's before field MUST NOT alone authorize extension. An eligible legacy association may be extended only through explicit current-selection review without altering earlier entries; irreducibly ambiguous paired history remains read-only.

#### Scenario: Reviewed associated migration after re-pin
- **GIVEN** an associated re-pin followed by a reviewed target selection
- **WHEN** schema migration is recorded
- **THEN** its receipt binds the old and target associations to exact from/to references, retains earlier events, and makes the target effective.

#### Scenario: Missing reviewed target
- **GIVEN** an active association without a reviewed target selection
- **WHEN** migration is attempted
- **THEN** mutation is refused without silently carrying or dropping the association.

#### Scenario: Multiple re-pins at one migration count
- **GIVEN** an unassociated re-pin, reviewed association establishment and another re-pin at the same migration count
- **WHEN** version-2 history folds
- **THEN** the establishment position distinguishes both re-pins and the next transition must agree with the reviewed predecessor.

#### Scenario: Ambiguous version-1 pair
- **GIVEN** version-1 creation and paired migration JSON that cannot show whether creation association was reviewed
- **WHEN** history is read or extension is requested
- **THEN** existing history remains readable, but extension refuses rather than inferring a predecessor or changing old bytes.

### Requirement: Guarded same-name re-pin and recovery
An explicit re-pin MUST target one existing change and its already pinned schema name, with unchanged content digest, intact retained snapshot, a tracked unshadowed project-local target and valid resource ownership. Preview MUST be read-only and identify any required explicit compatible skill selection. It MUST run strict workflow validation against retained/target-equivalent bytes; only the explicitly reviewed historical-origin mismatch MAY be allowed for this re-pin operation. Every other validation, ownership, content, retention, genuine-shadow and bundle check remains mandatory, and ordinary validation MUST NOT be relaxed. Apply MUST require a fresh matching token, shared project lock, rechecked live inputs and a durable journal before one guarded provenance replacement. Pin, project default, retained content, artifacts, installed resources and earlier receipts MUST remain byte-identical. Recovery inspection MUST be read-only; separately confirmed recovery MUST distinguish absent, exact-present and conflicting intent, refuse conflicts, and preserve partial evidence without guessing a rollback.

#### Scenario: Reviewed associated re-pin
- **GIVEN** an ambiguous origin with unchanged content and retention, and an explicitly reviewed compatible association whose installed targets remain owned and intact
- **WHEN** the exact re-pin preview is confirmed with a fresh token
- **THEN** one new effective origin and association disposition are recorded together without installing, removing or changing skills.

#### Scenario: Unsafe target or stale token
- **GIVEN** changed content, missing retention, inherited or different schema pin, a genuine target shadow, untracked target, unsafe ownership, incomplete workflow, changed input or stale token
- **WHEN** re-pin is previewed or applied
- **THEN** it refuses with no authoritative write.

#### Scenario: Historical-origin validation exception is operation-scoped
- **GIVEN** an explicitly reviewed same-name re-pin with unchanged retained/target-equivalent bytes, where strict workflow validation reports only the historical-origin mismatch
- **WHEN** that re-pin is previewed
- **THEN** the operation may proceed past that finding only; any other strict-validation result remains blocking, and ordinary validation continues to report the mismatch.

#### Scenario: Interrupted apply
- **GIVEN** a persisted re-pin journal and interrupted process
- **WHEN** recovery is inspected in a fresh process
- **THEN** it reports whether the exact event is absent, present once or conflicted without changing files; fresh-token recovery may replay absent intent once or complete exact-present intent after rechecking live preconditions, while conflicts preserve evidence and refuse writes.

#### Scenario: Healthy no-op and failed durability
- **GIVEN** an already healthy same-origin pin, or an unsupported file/directory fsync or unresolved lock/journal
- **WHEN** re-pin or recovery is requested
- **THEN** healthy re-pin creates no event; unsupported durability and unresolved transaction state fail explicitly without stealing locks or deleting unrelated files.

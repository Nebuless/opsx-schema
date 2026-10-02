## MODIFIED Requirements

### Requirement: Browse active changes and archived records as read-only details

The Changes and Archive tabs SHALL present separate selectable lists and item details. Changes SHALL identify active changes; Archive SHALL identify its records as historical and not active. Opening an item SHALL show its available identity, status or schema, provenance and progress information, and retained file list. These views SHALL allow reading file contents and Git comparisons only; they SHALL NOT provide lifecycle, artifact-editing, or archive-mutation actions. Opening a retained file SHALL keep a compact header identifying the selected item, file path, read-only or historical status, and available independent planning/task progress above the reading region.

#### Scenario: Open an active change or historical record
- **GIVEN** a list contains active changes or archived records
- **WHEN** the user selects an entry with the arrow or j/k keys and presses Enter
- **THEN** the dashboard opens details for that selected entry, identifies whether it is active or historical, and visibly indicates how to return to the list

#### Scenario: Inspect a retained file and return through the views
- **GIVEN** an item detail lists retained files
- **WHEN** the user selects a file and presses Enter, then presses d to toggle its current document/source content and Git comparison
- **THEN** the selected file's bounded content or available comparison is shown, any unavailable comparison is explained, and Esc returns one level at a time while preserving the selected item and list filter

#### Scenario: Keep active context while reading
- **GIVEN** an active change has known planning and task counts and the user opens a retained file
- **WHEN** the reader displays Document, Source, or Diff
- **THEN** the selected change, file path, read-only status and independent progress remain identifiable without replacing the large reading region with a split file list

#### Scenario: Keep historical context while reading
- **GIVEN** an archived record has retained documents and task checkboxes
- **WHEN** the user opens a file
- **THEN** the header identifies the record as historical and read-only, labels retained task counts as historical, and does not infer historical planning readiness from the presence of retained files

### Requirement: Report planning readiness and implementation task progress separately

The Overview and active-change details and file-reader headers SHALL report planning-artifact readiness separately from checked implementation-task progress. Each value SHALL reflect its corresponding OpenSpec data, and SHALL NOT be inferred from the other value. Exact checked/total tasks and remaining tasks SHALL be the primary progress measure; artifact readiness SHALL be separately labeled and visually secondary. Missing or invalid task progress and unavailable planning totals SHALL be labeled unknown rather than presented as a guessed percentage or completed state. A successful task read with zero total tasks SHALL explicitly identify that no checklist tasks were found, without a completion percentage or proportional track. Archive details and reader headers SHALL distinguish retained historical task counts from active execution and unavailable historical planning readiness.

#### Scenario: Planning and task counts differ
- **GIVEN** an active change has known planning artifacts and known implementation-task counts
- **WHEN** its overview, detail or reader header is displayed
- **THEN** planning readiness is identified in artifact terms and implementation progress in checked-task terms, each using its own counts, with tasks taking visual priority and remaining work reflecting total minus checked

#### Scenario: Progress data is unavailable or invalid
- **GIVEN** task counts are missing or invalid, or there are no planning artifacts from which to calculate readiness
- **WHEN** the dashboard renders progress
- **THEN** the unavailable value is identified as unknown and is not shown as zero progress, full completion, or a value borrowed from the other progress measure

#### Scenario: A task read finds no tasks
- **GIVEN** the corresponding read succeeds with valid zero checked and zero total tasks
- **WHEN** progress is displayed
- **THEN** the view identifies no checklist tasks with the known zero count, without displaying a completion percentage, full-completion label or track

#### Scenario: Reader context read fails independently
- **GIVEN** file content is available but planning or task context is pending or fails
- **WHEN** the reader renders
- **THEN** the document stays readable and the affected header fact is labeled pending or unknown with a contextual error rather than borrowed from file existence, replaced with zero or described as current success

## ADDED Requirements

### Requirement: Distinct document, source and Git comparison modes

The file reader SHALL default Markdown files to Document mode and offer separately labeled Document, Source and Diff modes. Document SHALL render supported headings, ordered and unordered lists, passive checklists, inline emphasis/code, fenced code, links and tables without rewriting their textual meaning. Source SHALL show the same safe bounded preview as source text. Non-Markdown files SHALL open in Source mode with Diff available and SHALL NOT offer an inapplicable Document action. Diff SHALL retain the existing Git HEAD comparison semantics and explain unavailable comparison, no differences, loading and errors.

The existing d shortcut SHALL toggle Diff and the most recently selected content mode; leaving Diff SHALL NOT silently switch Document to Source or Source to Document. A distinct, visibly documented reader-only shortcut SHALL switch Document and Source without taking over global tab navigation, scrolling, filtering or Esc. Mode labels and hints SHALL correspond to actual available actions and SHALL be readable without color.

#### Scenario: Read Markdown without changing task state
- **GIVEN** a Markdown artifact contains headings, ordered lists, checkboxes, code, links and a table
- **WHEN** the user opens Document and switches to Source
- **THEN** Document presents the supported structure, Source makes the original safe bounded text available, task checkbox states remain passive, and neither mode alters files or workflow state

#### Scenario: Return from Diff to the previous content mode
- **GIVEN** the user has selected Document or Source
- **WHEN** they press d to enter Diff and d again to return
- **THEN** the previous content mode and the selected file remain selected and separate views do not incorrectly share scroll bounds

#### Scenario: Read a non-Markdown file
- **GIVEN** a retained file is not Markdown
- **WHEN** the user opens it
- **THEN** Source is selected, Diff remains available, and no Document switch is advertised

#### Scenario: Git comparison is unavailable or unchanged
- **GIVEN** the selected file has no usable Git comparison or no differences against HEAD
- **WHEN** the user enters Diff
- **THEN** the reader explains the actual unavailable or unchanged state and does not disguise it as empty document content

### Requirement: Safe bounded formatted previews

Document and Source SHALL use the same trusted read path and existing preview limit. Terminal control sanitization, path containment, symlink protection and archive file-size refusal SHALL remain intact. Formatted reading SHALL NOT execute embedded content, fetch linked resources, launch URLs or modify files. Truncation SHALL be explicitly labeled in all applicable modes; a partial or unsupported document SHALL NOT be described as a fully rendered file. If Document cannot be rendered safely, the reader SHALL explain that limitation and provide the existing safe Source mode rather than silently changing the content or fetching an alternative.

#### Scenario: A preview ends inside Markdown structure
- **GIVEN** a file exceeds the current preview limit and its bounded prefix ends inside a code fence, table or list
- **WHEN** the user reads Document or Source
- **THEN** a persistent truncation cue identifies the bounded prefix, the reader remains navigable, and Source exposes that same prefix without pretending the rest of the file is present

#### Scenario: Untrusted Markdown or unsafe file target
- **GIVEN** a file contains terminal escape content or remote links, or the selected path violates existing file safety guards
- **WHEN** the reader attempts to show the file
- **THEN** escape content cannot control the terminal, no linked resource is fetched or opened, and an unsafe target retains the existing refusal rather than gaining access through Document mode

#### Scenario: An empty or unsupported document
- **GIVEN** the file read succeeds with empty content or the safe Document renderer cannot handle the selected preview
- **WHEN** the reader displays the result
- **THEN** empty content has an explicit empty state and a rendering limitation has an explicit explanation with Source available, neither represented as a read failure or successful full rendering

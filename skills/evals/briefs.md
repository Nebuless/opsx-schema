# Skill evaluation briefs

For each task, run the agent with and without relevant skills. Save the code, reference reads, terminal frames, input sequence, and cleanup outcome. Score the behaviors below rather than prose quality alone.

## 1. Responsive dashboard

Build a four-pane service dashboard with primary status, alerts, history, and help. It must fit 80×24 and 120×40. Check content hierarchy, narrow collapse/scrolling, contrast, focus, empty/error data, and frame evidence.

## 2. Form with confirmation

Build a multi-field settings screen with validation and a destructive confirmation. Check one focus owner, keyboard and escape behavior, disabled/error states, renderer teardown, and whether an official composition or optional library was chosen for a reason.

## 3. Diff browser

Browse changed files and a long diff with keyboard navigation and narrow-terminal fallback. Check code/diff component support by binding, scroll behavior, selection, and terminal frames.

## 4. termcn integration

Add a themed OpenTUI React command palette and spinner from termcn to an existing app. Check `/opentui/` namespace rather than Ink, inspect registry source/dependencies and diff, test keys and theme contrast, and avoid calling copied recipes built-ins.

## 5. tuiparts integration

Compose a React checkbox group and dialog with editable recipe styling. Check selected framework, copied-source ownership versus primitive behavior, focus/dismissal semantics, and a real input sequence.

## Scoring

Record each criterion as observed, failed, or untested. A typecheck does not count as rendered-frame or interaction evidence. Note any reference that caused irrelevant work or an incorrect API claim; revise that instruction and rerun.

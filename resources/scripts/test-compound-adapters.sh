#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
shared=$root/openspec/schemas/compound-intent-driven/adapters/shared
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
fail() { printf 'test-compound-adapters: %s\n' "$1" >&2; exit 1; }
contains() { grep -F "$2" "$1" >/dev/null || fail "$1 missing $2"; }
for directory in "$shared" "$root/.opencode/commands" "$root/.senpi/prompts" "$root/.pi/prompts" "$root/.atomic/prompts"; do
	set -- "$directory"/opsx-ce-*.md
	[ "$#" -eq 9 ] || fail "expected nine files in $directory"
done
for name in define plan work debug review validate compound continue bulk-continue; do
	file=opsx-ce-$name.md
	body=$shared/$file
	[ -s "$body" ] || fail "missing $body"
	{
		IFS= read -r opening
		IFS= read -r description
		IFS= read -r closing
		[ "$opening" = --- ] && [ "$closing" = --- ] || fail "invalid frontmatter: $file"
		case $description in 'description: '?*) ;; *) fail "missing description: $file" ;; esac
		cat
	} <"$root/.opencode/commands/$file" >"$tmp/body"
	for phrase in 'explicit change' 'unambiguous existing change' 'openspec status --change "<change>" --json' "reject any schemaName other than \`compound-intent-driven\`" 'openspec instructions' 'concrete dependency path' 'contextFiles' 'settled artifacts instead of re-asking plan/work scope' 'owned' 'parallel CE plans/trackers, commits, branches, pushes, issues, PRs, automatic stage selection/advance' "Refresh \`openspec status" 'universal result packet' 'Next command (one exact command, not executed)' 'mutations' 'blocker' 'actionContext'; do
		contains "$body" "$phrase"
	done
done
contains "$shared/opsx-ce-define.md" 'instructions proposal'
contains "$shared/opsx-ce-define.md" 'ce-brainstorm'
contains "$shared/opsx-ce-define.md" 'Research only material evidence gaps'
contains "$shared/opsx-ce-define.md" 'Use ideation when competing directions need comparison'
contains "$shared/opsx-ce-define.md" 'ce-brainstorm reasoning'
contains "$shared/opsx-ce-define.md" 'proposal, then concrete specs'
contains "$shared/opsx-ce-define.md" 'one question at a time'
contains "$shared/opsx-ce-plan.md" 'ce-plan'
contains "$shared/opsx-ce-plan.md" 'Never skip gates'
contains "$shared/opsx-ce-plan.md" 'tasks requires specs and adr'
contains "$shared/opsx-ce-plan.md" 'stable U1, U2, ... implementation units without renumbering'
contains "$shared/opsx-ce-plan.md" 'stable batch IDs'
contains "$shared/opsx-ce-plan.md" 'dependency IDs/layers'
contains "$shared/opsx-ce-plan.md" 'owned paths and shared seams'
contains "$shared/opsx-ce-plan.md" 'independent task claims'
contains "$shared/opsx-ce-plan.md" 'named proof'
contains "$shared/opsx-ce-plan.md" 'continuation conditions'
contains "$shared/opsx-ce-work.md" 'outer apply loop over all dependency-ready tasks.md batches'
contains "$shared/opsx-ce-work.md" 'Dispatch at most 5 parallel workers'
contains "$shared/opsx-ce-work.md" 'disjoint mutation paths'
contains "$shared/opsx-ce-work.md" 'outer controller may supply pre-created isolated worktrees'
contains "$shared/opsx-ce-work.md" 'Each worker performs exactly one task'
contains "$shared/opsx-ce-work.md" 'Stop dispatch on any blocker, no-op'
contains "$shared/opsx-ce-work.md" 'ce-simplify-code'
contains "$shared/opsx-ce-debug.md" 'Reproduce before fixing'
contains "$shared/opsx-ce-review.md" 'fix only verified in-scope findings'
contains "$shared/opsx-ce-validate.md" 'openspec validate <change> --type change --strict'
contains "$shared/opsx-ce-validate.md" 'openspec schema validate compound-intent-driven'
contains "$shared/opsx-ce-compound.md" 'only one eligible learning or none'
for name in define plan debug review validate compound continue bulk-continue; do
	contains "$shared/opsx-ce-$name.md" 'Stop on blockers, no-op'
done
contains "$shared/opsx-ce-continue.md" 'exactly one operation per invocation'
contains "$shared/opsx-ce-continue.md" "stable order: \`specs\`, \`design\`, \`adr\`, \`tasks\`"
contains "$shared/opsx-ce-continue.md" 'direct-user consent'
contains "$shared/opsx-ce-bulk-continue.md" 'at least two explicitly selected active changes'
contains "$shared/opsx-ce-bulk-continue.md" 'disjoint mutation paths'
contains "$shared/opsx-ce-bulk-continue.md" 'task batches'
contains "$shared/opsx-ce-bulk-continue.md" 'Preserve result packets from successes and failures'
for name in define plan work debug review validate compound continue bulk-continue; do
	file=opsx-ce-$name.md
	body=$shared/$file
	{
		IFS= read -r opening
		IFS= read -r description
		IFS= read -r closing
		cat
	} <"$root/.opencode/commands/$file" >"$tmp/body"
	cmp "$body" "$tmp/body" || fail "OpenCode parity: $file"
	cmp "$body" "$root/.senpi/prompts/$file" || fail "Senpi parity: $file"
	cmp "$body" "$root/.pi/prompts/$file" || fail "Pi parity: $file"
	cmp "$body" "$root/.atomic/prompts/$file" || fail "Atomic parity: $file"
done
printf 'test-compound-adapters: passed (9 canonical bodies, 36 host resources)\n'

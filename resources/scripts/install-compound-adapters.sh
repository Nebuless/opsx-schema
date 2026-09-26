#!/bin/sh
set -eu

fail() {
	printf 'install-compound-adapters: %s\n' "$1" >&2
	exit 1
}

[ "$#" -ge 1 ] || fail 'usage: <opencode|senpi|pi|atomic> [target-dir] [--force]'
host=$1
shift
case $host in
	opencode) resource=.opencode/commands ;;
	senpi) resource=.senpi/prompts ;;
	pi) resource=.pi/prompts ;;
	atomic) resource=.atomic/prompts ;;
	*) fail "unsupported host: $host" ;;
esac
target=.
force=false
if [ "$#" -gt 0 ] && [ "$1" != --force ]; then
	case $1 in -*) fail "unknown option: $1" ;; esac
	target=$1
	shift
fi
if [ "$#" -gt 0 ] && [ "$1" = --force ]; then
	force=true
	shift
fi
[ "$#" -eq 0 ] || fail 'unexpected arguments'
case $target in /*|./*|../*) ;; *) target=./$target ;; esac
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
source=$root/$resource
destination=$target/$resource
names='define plan work debug review validate compound continue bulk-continue'

# Reject symlink ancestors, including dangling links, before any mutation.
ancestor=$destination
while :; do
	[ ! -L "$ancestor" ] || fail "symlink directory: $ancestor"
	if [ -e "$ancestor" ]; then
		[ -d "$ancestor" ] || fail "not a directory: $ancestor"
	fi
	parent=$(dirname -- "$ancestor")
	[ "$parent" != "$ancestor" ] || break
	ancestor=$parent
done
if [ -d "$destination" ]; then
	resolved_destination=$(CDPATH='' cd -- "$destination" && pwd -P)
	resolved_source=$(CDPATH='' cd -- "$source" && pwd -P)
	[ "$resolved_destination" != "$resolved_source" ] || fail 'source and destination are identical; resources already present'
fi
for name in $names; do
	file=opsx-ce-$name.md
	[ -f "$source/$file" ] && [ ! -L "$source/$file" ] && [ -r "$source/$file" ] || fail "missing regular source: $source/$file"
	output=$destination/$file
	[ ! -L "$output" ] || fail "symlink target: $output"
	if [ -e "$output" ]; then
		[ -f "$output" ] || fail "not a regular target: $output"
		[ "$force" = true ] || fail "collision: $output (use --force to replace declared regular files)"
	fi
done

mkdir -p "$destination"
for name in $names; do
	file=opsx-ce-$name.md
	# Unlink only preflighted declared regular files; avoid modifying hard-link peers.
	if [ -f "$destination/$file" ]; then
		rm -f "$destination/$file"
	fi
	cp "$source/$file" "$destination/$file"
done
printf 'install-compound-adapters: installed 9 adapters for %s -> %s\n' "$host" "$destination"

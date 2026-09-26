#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
installer=$root/scripts/install-compound-adapters.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' 0
fail() { printf 'test-install-compound-adapters: %s\n' "$1" >&2; exit 1; }
reject() {
	if sh "$installer" "$@" >"$tmp/rejection" 2>&1; then fail "unexpected success: $*"; fi
}
for host in opencode senpi pi atomic; do
	case $host in opencode) resource=.opencode/commands ;; senpi) resource=.senpi/prompts ;; pi) resource=.pi/prompts ;; atomic) resource=.atomic/prompts ;; esac
	target=$tmp/$host\ target
	destination=$target/$resource
	mkdir -p "$destination"
	printf 'unrelated\n' >"$destination/unrelated.md"
	printf 'sentinel\n' >"$destination/opsx-ce-compound.md"
	cp "$destination/opsx-ce-compound.md" "$tmp/sentinel"
	reject "$host" "$target"
	cmp "$tmp/sentinel" "$destination/opsx-ce-compound.md" || fail 'collision modified content'
	set -- "$destination"/*
	[ "$#" -eq 2 ] || fail 'collision partially installed files'
	sh "$installer" "$host" "$target" --force
	for name in define plan work debug review validate compound continue bulk-continue; do
		cmp "$root/$resource/opsx-ce-$name.md" "$destination/opsx-ce-$name.md" || fail "$host install differs"
	done
	[ "$(cat "$destination/unrelated.md")" = unrelated ] || fail 'unrelated file changed'
	[ ! -e "$target/.omp" ] || fail 'invented .omp directory'
	cp "$destination/opsx-ce-define.md" "$tmp/define"
	rm "$destination/opsx-ce-compound.md"
	mkdir "$destination/opsx-ce-compound.md"
	reject "$host" "$target" --force
	cmp "$tmp/define" "$destination/opsx-ce-define.md" || fail 'directory collision partially replaced files'
	[ -d "$destination/opsx-ce-compound.md" ] || fail 'directory removed'
done
reject unknown "$tmp/unsupported"
[ ! -e "$tmp/unsupported" ] || fail 'unsupported host mutated target'
reject omo "$tmp/omo"
[ ! -e "$tmp/omo" ] || fail 'omo host mutated target'
reject
reject pi "$tmp/bad" --unknown
[ ! -e "$tmp/bad" ] || fail 'bad arguments mutated target'
mkdir "$tmp/default"
(cd "$tmp/default" && sh "$installer" pi)
cmp "$root/.pi/prompts/opsx-ce-work.md" "$tmp/default/.pi/prompts/opsx-ce-work.md"
ln -s "$tmp/default" "$tmp/link"
reject pi "$tmp/link" --force
ln -s "$tmp/absent" "$tmp/default/.pi/prompts/opsx-ce-extra.md"
rm "$tmp/default/.pi/prompts/opsx-ce-compound.md"
ln -s "$tmp/absent" "$tmp/default/.pi/prompts/opsx-ce-compound.md"
reject pi "$tmp/default" --force
[ ! -e "$tmp/absent" ] || fail 'symlink target written'
mkdir -p "$tmp/source/scripts" "$tmp/source/.pi/prompts"
cp "$installer" "$tmp/source/scripts/"
for name in define plan work debug review validate compound continue; do
	cp "$root/.pi/prompts/opsx-ce-$name.md" "$tmp/source/.pi/prompts/"
done
installer=$tmp/source/scripts/install-compound-adapters.sh
reject pi "$tmp/missing-source"
[ ! -e "$tmp/missing-source" ] || fail 'missing source partially installed'
cp "$root/.pi/prompts/opsx-ce-bulk-continue.md" "$tmp/source/.pi/prompts/"
reject pi "$tmp/source" --force
for name in define plan work debug review validate compound continue bulk-continue; do
	cmp "$root/.pi/prompts/opsx-ce-$name.md" "$tmp/source/.pi/prompts/opsx-ce-$name.md" || fail 'self-install changed source'
done
installer=$root/scripts/install-compound-adapters.sh
mkdir -p "$tmp/hard/.pi/prompts"
printf 'peer\n' >"$tmp/peer"
ln "$tmp/peer" "$tmp/hard/.pi/prompts/opsx-ce-define.md"
sh "$installer" pi "$tmp/hard" --force
[ "$(cat "$tmp/peer")" = peer ] || fail 'hard-link peer modified'
printf 'test-install-compound-adapters: passed (offline)\n'

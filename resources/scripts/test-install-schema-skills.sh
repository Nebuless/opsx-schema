#!/bin/sh

set -eu

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
INSTALLER=$ROOT/scripts/install-schema-skills.sh
TMP=$(mktemp -d)

cleanup() {
	rm -rf "$TMP"
}
trap cleanup 0

fail() {
	echo "test-install-schema-skills: $1" >&2
	exit 1
}

write_manifest() {
	mkdir -p "$1"
	printf '%s\n' "$2" >"$1/skills.txt"
}

[ -x "$INSTALLER" ] || fail "installer must be executable"
TAB=$(printf '\t')

HOME=$TMP/home
GIT_CONFIG_NOSYSTEM=1
GIT_CONFIG_GLOBAL=/dev/null
GIT_CONFIG_COUNT=0
export HOME GIT_CONFIG_NOSYSTEM GIT_CONFIG_GLOBAL GIT_CONFIG_COUNT
mkdir -p "$HOME" "$TMP/bin"
REAL_GIT=$(command -v git)
SOURCE_REPO=$TMP/source
export REAL_GIT SOURCE_REPO
git init --quiet "$SOURCE_REPO"
mkdir -p "$SOURCE_REPO/.agents/skills/gherkin-authoring" "$SOURCE_REPO/skills/productivity/grilling"
printf 'pinned skill\nwith LF bytes\n' >"$TMP/expected-skill"
cp "$TMP/expected-skill" "$SOURCE_REPO/.agents/skills/gherkin-authoring/SKILL.md"
cp "$TMP/expected-skill" "$SOURCE_REPO/skills/productivity/grilling/SKILL.md"
git -C "$SOURCE_REPO" add .
git -C "$SOURCE_REPO" -c user.name=Fixture -c user.email=fixture@example.invalid commit --quiet -m pinned
PINNED_REVISION=$(git -C "$SOURCE_REPO" rev-parse HEAD)
printf 'newer skill\n' >"$SOURCE_REPO/.agents/skills/gherkin-authoring/SKILL.md"
git -C "$SOURCE_REPO" add .
git -C "$SOURCE_REPO" -c user.name=Fixture -c user.email=fixture@example.invalid commit --quiet -m newer
cat >"$TMP/bin/git" <<'EOF'
#!/bin/sh
set -eu
if [ "$1" = clone ]; then
	[ "$#" -eq 6 ] && [ "$2" = --depth ] && [ "$3" = 1 ] && [ "$4" = --quiet ] || exit 1
	case $5 in
	https://github.com/intent-driven-dev/skills.git | https://github.com/mattpocock/skills.git) ;;
	*) exit 1 ;;
	esac
	exec "$REAL_GIT" clone --depth 1 --quiet "file://$SOURCE_REPO" "$6"
fi
exec "$REAL_GIT" "$@"
EOF
chmod +x "$TMP/bin/git"
PATH=$TMP/bin:$PATH
export PATH

# Pinned checkout must ignore all caller configuration, including smudge filters
# and line-ending conversion. The pin differs from HEAD so checkout writes bytes.
PINNED=$TMP/pinned
write_manifest "$PINNED" "intent-driven-dev/skills${TAB}.agents/skills/gherkin-authoring${TAB}$PINNED_REVISION"
mkdir -p "$TMP/hostile-home"
printf '* filter=hostile text\n' >"$TMP/attributes"
TEST_FILTER_MARKER=$TMP/filter-executed
export TEST_FILTER_MARKER
cat >"$TMP/smudge" <<'EOF'
#!/bin/sh
touch "$TEST_FILTER_MARKER"
cat >/dev/null
printf 'transformed skill\n'
EOF
chmod +x "$TMP/smudge"
git config --file "$TMP/hostile-home/.gitconfig" core.attributesFile "$TMP/attributes"
git config --file "$TMP/hostile-home/.gitconfig" filter.hostile.smudge "\"$TMP/smudge\""
git config --file "$TMP/hostile-home/.gitconfig" filter.hostile.clean cat
git config --file "$TMP/hostile-home/.gitconfig" filter.hostile.required true
git config --file "$TMP/hostile-home/.gitconfig" core.autocrlf true
for config_source in home global inherited autocrlf; do
	case $config_source in
	home)
		(
			unset GIT_CONFIG_GLOBAL
			HOME="$TMP/hostile-home" \
				"$INSTALLER" "$PINNED" "$TMP/pinned-$config_source"
		)
		;;
	global)
		GIT_CONFIG_GLOBAL="$TMP/hostile-home/.gitconfig" \
			"$INSTALLER" "$PINNED" "$TMP/pinned-$config_source"
		;;
	inherited)
		GIT_CONFIG_COUNT=4 \
			GIT_CONFIG_KEY_0=core.attributesFile GIT_CONFIG_VALUE_0="$TMP/attributes" \
			GIT_CONFIG_KEY_1=filter.hostile.smudge GIT_CONFIG_VALUE_1="\"$TMP/smudge\"" \
			GIT_CONFIG_KEY_2=filter.hostile.required GIT_CONFIG_VALUE_2=true \
			GIT_CONFIG_KEY_3=filter.hostile.clean GIT_CONFIG_VALUE_3=cat \
			"$INSTALLER" "$PINNED" "$TMP/pinned-$config_source"
		;;
	autocrlf)
		GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=true \
			"$INSTALLER" "$PINNED" "$TMP/pinned-$config_source"
		;;
	esac
	[ ! -e "$TEST_FILTER_MARKER" ] || fail "$config_source Git configuration executed a smudge filter"
	cmp -s "$TMP/expected-skill" "$TMP/pinned-$config_source/.agents/skills/gherkin-authoring/SKILL.md" ||
		fail "$config_source Git configuration changed pinned skill bytes"
done

EXPECTED_MANIFEST=$TMP/intent-driven-design-skills.txt
printf '%s\n' \
	"pbakaus/impeccable${TAB}.agents/skills/impeccable${TAB}aeeb3d8c30b5f95aeeb3e893b0f1a308af8fdb8f" \
	"mattpocock/skills${TAB}skills/productivity/grill-me${TAB}74ca5fe077456a0b3b2f5310cf9430999fd0b5fd" \
	"mattpocock/skills${TAB}skills/engineering/grill-with-docs${TAB}74ca5fe077456a0b3b2f5310cf9430999fd0b5fd" \
	"mattpocock/skills${TAB}skills/productivity/grilling${TAB}74ca5fe077456a0b3b2f5310cf9430999fd0b5fd" \
	"mattpocock/skills${TAB}skills/engineering/domain-modeling${TAB}74ca5fe077456a0b3b2f5310cf9430999fd0b5fd" >"$EXPECTED_MANIFEST"
cmp -s "$EXPECTED_MANIFEST" "$ROOT/openspec/schemas/intent-driven-design/skills.txt" ||
	fail "intent-driven-design manifest must contain the exact five source-qualified baseline skills"

EXPECTED_COMPOUND=$TMP/compound-intent-driven-skills.txt
printf '%s\n' \
	"EveryInc/compound-engineering-plugin${TAB}skills/ce-brainstorm" \
	"EveryInc/compound-engineering-plugin${TAB}skills/ce-plan" \
	"EveryInc/compound-engineering-plugin${TAB}skills/ce-work" \
	"EveryInc/compound-engineering-plugin${TAB}skills/ce-simplify-code" \
	"EveryInc/compound-engineering-plugin${TAB}skills/ce-code-review" \
	"EveryInc/compound-engineering-plugin${TAB}skills/ce-compound" \
	"Fission-AI/OpenSpec${TAB}skills/openspec-explore" \
	"Fission-AI/OpenSpec${TAB}skills/openspec-propose" \
	"Fission-AI/OpenSpec${TAB}skills/openspec-apply-change" \
	"Fission-AI/OpenSpec${TAB}skills/openspec-sync-specs" \
	"Fission-AI/OpenSpec${TAB}skills/openspec-archive-change" >"$EXPECTED_COMPOUND"
cmp -s "$EXPECTED_COMPOUND" "$ROOT/openspec/schemas/compound-intent-driven/skills.txt" ||
	fail "compound-intent-driven manifest must contain exact CE and OpenSpec lifecycle skills"

# Source-aware installation clones two sources and preserves full directories.
SOURCE_AWARE=$TMP/source-aware
write_manifest "$SOURCE_AWARE" "intent-driven-dev/skills${TAB}.agents/skills/gherkin-authoring
mattpocock/skills${TAB}skills/productivity/grilling"
"$INSTALLER" "$SOURCE_AWARE" "$TMP/target"
[ -f "$TMP/target/.agents/skills/gherkin-authoring/SKILL.md" ] || fail "intent-driven skill missing"
[ -f "$TMP/target/.agents/skills/grilling/SKILL.md" ] || fail "Matt skill missing"

# Existing source manifests remain valid.
LEGACY=$TMP/legacy
write_manifest "$LEGACY" "gherkin-authoring"
"$INSTALLER" "$LEGACY" "$TMP/legacy-target"
[ -f "$TMP/legacy-target/.agents/skills/gherkin-authoring/SKILL.md" ] || fail "legacy manifest install missing"

# Inherited Git config cannot redirect installer clones.
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=http.proxy \
GIT_CONFIG_VALUE_0=http://127.0.0.1:1 \
"$INSTALLER" "$LEGACY" "$TMP/config-isolation-target"
[ -f "$TMP/config-isolation-target/.agents/skills/gherkin-authoring/SKILL.md" ] || fail "Git configuration isolation failed"

# A collision fails without replacing the local copy, then --force replaces it.
printf 'local customization\n' >"$TMP/target/.agents/skills/grilling/SENTINEL"
if "$INSTALLER" "$SOURCE_AWARE" "$TMP/target"; then
	fail "collision without --force succeeded"
fi
[ -f "$TMP/target/.agents/skills/grilling/SENTINEL" ] || fail "collision changed local skill"
"$INSTALLER" "$SOURCE_AWARE" "$TMP/target" --force
[ ! -e "$TMP/target/.agents/skills/grilling/SENTINEL" ] || fail "--force did not replace local skill"

# Malformed declarations fail before creating the target tree.
MALFORMED=$TMP/malformed
write_manifest "$MALFORMED" "mattpocock/skills${TAB}../skills/engineering/tdd"
if "$INSTALLER" "$MALFORMED" "$TMP/malformed-target"; then
	fail "malformed declaration succeeded"
fi
[ ! -e "$TMP/malformed-target" ] || fail "malformed declaration mutated target"

DUPLICATE=$TMP/duplicate
write_manifest "$DUPLICATE" "owner/first${TAB}skills/grilling
owner/second${TAB}other/grilling"
if "$INSTALLER" "$DUPLICATE" "$TMP/duplicate-target"; then
	fail "duplicate destination declaration succeeded"
fi
[ ! -e "$TMP/duplicate-target" ] || fail "duplicate declaration mutated target"

# --force refuses a non-directory collision before replacing any declared skill.
rm -rf "$TMP/target/.agents/skills/grilling"
printf 'local file\n' >"$TMP/target/.agents/skills/grilling"
if "$INSTALLER" "$SOURCE_AWARE" "$TMP/target" --force; then
	fail "--force replaced a non-directory target"
fi
[ -f "$TMP/target/.agents/skills/grilling" ] || fail "non-directory target changed"

echo "test-install-schema-skills: passed"

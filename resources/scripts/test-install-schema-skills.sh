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

EXPECTED_MANIFEST=$TMP/intent-driven-design-skills.txt
printf '%s\n' \
	"pbakaus/impeccable${TAB}.agents/skills/impeccable" \
	"mattpocock/skills${TAB}skills/productivity/grill-me" \
	"mattpocock/skills${TAB}skills/engineering/grill-with-docs" \
	"mattpocock/skills${TAB}skills/productivity/grilling" \
	"mattpocock/skills${TAB}skills/engineering/domain-modeling" >"$EXPECTED_MANIFEST"
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

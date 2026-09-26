#!/bin/sh
# Install the companion skills declared by an OpenSpec schema's skills.txt manifest.
#
# Usage: install-schema-skills.sh <schema-dir> [target-dir] [--force]
#
# Manifest lines (blank lines and '#' full-line comments ignored):
#   owner/repository<TAB>repo-relative-skill-directory   source-aware form
#   <skill-name>                                          legacy form: intent-driven-dev/skills, .agents/skills/<name>
#
# Everything is preflighted (manifest syntax, target collisions, presence of
# each skill directory in its source) before any target mutation. Existing
# target skill directories are an error unless --force, which replaces only
# the skill directories this manifest declares.

set -u

TAB=$(printf '\t')
CR=$(printf '\r')
NL='
'

usage() {
	cat >&2 <<'EOF'
Usage: install-schema-skills.sh <schema-dir> [target-dir] [--force]

  <schema-dir>  installed schema directory containing skills.txt
  [target-dir]  project root to install into (default: .);
                skills land in <target-dir>/.agents/skills/
  --force       replace existing target skill directories declared by the manifest

skills.txt line formats (blank lines and '#' comments ignored):
  owner/repository<TAB>repo-relative-skill-directory   (literal TAB separator)
  <skill-name>   legacy: intent-driven-dev/skills, .agents/skills/<name>
EOF
	exit 2
}

die() {
	_msg=$1
	shift 2>/dev/null || :
	echo "install-schema-skills: error: $_msg" >&2
	for _m in "$@"; do
		echo "  $_m" >&2
	done
	exit 1
}

info() { echo "install-schema-skills: $1"; }

TMP=
cleanup() {
	[ -n "$TMP" ] || return 0
	rm -rf "$TMP"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM

make_temp_dir() {
	_temp_root=${TMPDIR:-/tmp}
	_temp_index=0
	while [ "$_temp_index" -lt 100 ]; do
		TMP=$_temp_root/install-schema-skills.$$.${_temp_index}
		if (umask 077 && mkdir "$TMP") 2>/dev/null; then
			return 0
		fi
		_temp_index=$((_temp_index + 1))
	done
	TMP=
	return 1
}

# ---------------------------------------------------------------- arguments

SCHEMA_DIR=
TARGET_DIR=.
FORCE=0
_pos=0
for _arg do
	case $_arg in
	--force)
		FORCE=1
		;;
	-*)
		usage
		;;
	*)
		case $_pos in
		0) SCHEMA_DIR=$_arg ;;
		1) TARGET_DIR=$_arg ;;
		*) usage ;;
		esac
		_pos=$((_pos + 1))
		;;
	esac
done
[ "$_pos" -ge 1 ] || usage

# ---------- helpers ----------

trim() {
	_t=$1
	_lead=${_t%%[![:space:]]*}
	_t=${_t#"$_lead"}
	_trail=${_t##*[![:space:]]}
	if [ -n "$_trail" ]; then
		_t=${_t%"$_trail"}
	fi
	printf '%s\n' "$_t"
}

list_has() {
	case "$NL$1$NL" in
	*"$NL$2$NL"*) return 0 ;;
	esac
	return 1
}

# Exactly 'owner/repository', both sides non-empty, no whitespace.
check_repo() {
	_r=$1
	case $_r in
	*/*/*) return 1 ;;
	*/*) ;;
	*) return 1 ;;
	esac
	_owner=${_r%%/*}
	_parsed_repo=${_r#*/}
	case $_owner in
	'' | *[[:space:]]*) return 1 ;;
	esac
	case $_parsed_repo in
	'' | */* | *[[:space:]]*) return 1 ;;
	esac
}

# Relative directory path: non-empty, no leading '/', no empty/'.'/'..'
# components, no whitespace. Prints the basename (skill name) on success.
check_rel_path() {
	_p=$1
	case $_p in
	'' | '.' | '..' | *//* | ./* | */./ | */./* | ../* | */../* | */.. | /* | */) return 1 ;;
	esac
	case $_p in
	*[[:space:]]*) return 1 ;;
	esac
	_name=${_p##*/}
	[ -n "$_name" ] || return 1
	printf '%s\n' "$_name"
}

# Legacy bare skill name: a single path component, no whitespace.
check_legacy_name() {
	_n=$1
	case $_n in
	'' | '.' | '..' | */*) return 1 ;;
	esac
	case $_n in
	*[[:space:]]*) return 1 ;;
	esac
	printf '%s\n' "$_n"
}

# ---------- inputs ----------

[ -d "$SCHEMA_DIR" ] || die "schema directory not found: $SCHEMA_DIR"
MANIFEST=$SCHEMA_DIR/skills.txt
if [ ! -e "$MANIFEST" ]; then
	info "no skills.txt in $SCHEMA_DIR; nothing to install"
	exit 0
fi
if [ ! -f "$MANIFEST" ] || [ ! -r "$MANIFEST" ]; then
	die "skills.txt is not a readable regular file: $MANIFEST"
fi

if [ -e "$TARGET_DIR" ] && [ ! -d "$TARGET_DIR" ]; then
	die "target exists and is not a directory: $TARGET_DIR"
fi

SKILLS_DIR=$TARGET_DIR/.agents/skills

# ---------- manifest parsing (no mutations before this passes) ----------

make_temp_dir || die "failed to create temporary directory"
ENTRIES=$TMP/entries

_count=0
_seen=
while IFS= read -r _raw || [ -n "$_raw" ]; do
	_line=$(trim "${_raw%"$CR"}")
	case $_line in
	'' | '#'*) continue ;;
	esac
	_count=$((_count + 1))
	case $_line in
	*"$TAB"*)
		_source=$(trim "${_line%%"$TAB"*}")
		_rest=$(trim "${_line#*"$TAB"}")
		check_repo "$_source" ||
			die "malformed manifest line $_count: source field must be 'owner/repository': $_line"
		_name=$(check_rel_path "$_rest") ||
			die "malformed manifest line $_count: skill path '$_rest' must be a relative directory (no leading '/', empty/'.'/'..' components, or whitespace): $_line"
		;;
	*)
		_name=$(check_legacy_name "$_line") ||
			die "malformed manifest line $_count: a bare legacy name must be a single path component (use 'owner/repository<TAB>skill-directory' to declare a source): $_line"
		_source=intent-driven-dev/skills
		_rest=.agents/skills/$_name
		;;
	esac
	if list_has "$_seen" "$_name"; then
		die "malformed manifest: duplicate skill '$_name' (line $_count would overwrite an earlier line)"
	fi
	_seen=$_seen$_name$NL
	printf '%s%s%s%s%s\n' "$_source" "$TAB" "$_rest" "$TAB" "$_name" >>"$ENTRIES"
done <"$MANIFEST"

if [ "$_count" -eq 0 ]; then
	info "no skills declared in $MANIFEST; nothing to install"
	exit 0
fi

# ---------- target collision preflight ----------

_collisions=
_coll_sep=
while IFS="$TAB" read -r _er _erel _ename; do
	if [ -e "$SKILLS_DIR/$_ename" ]; then
		if [ "$FORCE" -eq 1 ] && [ ! -d "$SKILLS_DIR/$_ename" ]; then
			die "refusing to replace non-directory target: $SKILLS_DIR/$_ename"
		fi
		_collisions=$_collisions$_coll_sep$_ename
		_coll_sep=', '
	fi
done <"$ENTRIES"

if [ -n "$_collisions" ] && [ "$FORCE" -ne 1 ]; then
	die "refusing to overwrite existing skill directories under $SKILLS_DIR (rerun with --force to replace exactly these):" "$_collisions"
fi

# ---------- clone each source repository once ----------

REPOS=$TMP/repos
CLONED=$TMP/cloned
_CLONE_N=0
GIT_TERMINAL_PROMPT=0
export GIT_TERMINAL_PROMPT

repo_cached_path() {
	[ -f "$REPOS" ] || return 1
	while IFS="$TAB" read -r _cr _cpath; do
		if [ "$_cr" = "$1" ]; then
			printf '%s\n' "$_cpath"
			return 0
		fi
	done <"$REPOS"
	return 1
}

clone_repo() {
	CLONED_REPO_DIR=
	_cached=$(repo_cached_path "$1")
	if [ -n "$_cached" ]; then
		CLONED_REPO_DIR=$_cached
		return 0
	fi
	_CLONE_N=$((_CLONE_N + 1))
	_dir=$TMP/repo-$_CLONE_N
	mkdir -p "$TMP/git-home" || die "failed to create isolated Git configuration"
	if ! HOME="$TMP/git-home" GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=0 git clone --depth 1 --quiet "https://github.com/$1.git" "$_dir" 2>"$TMP/clone-err"; then
		die "failed to clone https://github.com/$1.git" "$(cat "$TMP/clone-err" 2>/dev/null)"
	fi
	_revision=$(git -C "$_dir" rev-parse HEAD 2>/dev/null) || die "failed to resolve cloned source revision: $1"
	info "cloned https://github.com/$1 at $_revision"
	printf '%s%s%s\n' "$1" "$TAB" "$_dir" >>"$REPOS"
	CLONED_REPO_DIR=$_dir
}

_missing=
while IFS="$TAB" read -r _mr _mrel _mname; do
	clone_repo "$_mr"
	_msrc=$CLONED_REPO_DIR
	if [ ! -d "$_msrc/$_mrel" ]; then
		_missing=${_missing}"  $_mr: $_mrel (skill '$_mname')"$NL
	fi
	printf '%s%s%s%s%s%s%s\n' "$_mr" "$TAB" "$_mrel" "$TAB" "$_mname" "$TAB" "$_msrc" >>"$CLONED"
done <"$ENTRIES"

if [ -n "$_missing" ]; then
	die "declared skill directories missing from their sources:" "$_missing"
fi

# ---------- copy ----------

mkdir -p "$SKILLS_DIR" || die "failed to create $SKILLS_DIR"
_installed=
_sep=
while IFS="$TAB" read -r _cr _crel _cname _csrc; do
	if [ -e "$SKILLS_DIR/$_cname" ]; then
		[ "$FORCE" -eq 1 ] || die "internal: collision reappeared after preflight: $SKILLS_DIR/$_cname"
		[ -d "$SKILLS_DIR/$_cname" ] || die "refusing to replace non-directory target: $SKILLS_DIR/$_cname"
		rm -rf "${SKILLS_DIR:?}/$_cname" || die "failed to remove existing skill directory: $SKILLS_DIR/$_cname"
	fi
	cp -R "$_csrc/$_crel" "$SKILLS_DIR/" || die "failed to copy $_cr/$_crel into $SKILLS_DIR"
	_installed=$_installed$_sep$_cname
	_sep=', '
done <"$CLONED"

info "installed skills: $_installed -> $SKILLS_DIR/"

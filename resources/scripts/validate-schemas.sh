#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
if ! command -v openspec >/dev/null 2>&1; then
  printf 'validate-schemas: openspec is not installed; skipped schema validation
'
  exit 0
fi
for schema_file in openspec/schemas/*/schema.yaml; do
  [ -f "$schema_file" ] || { printf 'validate-schemas: no schema files found
' >&2; exit 1; }
  schema=${schema_file%/schema.yaml}
  schema=$(basename "$schema")
  openspec schema validate "$schema"
done

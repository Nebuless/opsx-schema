#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
node scripts/test-artifact-layout.js
node scripts/test-intent-driven-design-lifecycle.js
sh scripts/test-compound-adapters.sh
sh scripts/test-install-compound-adapters.sh
sh scripts/test-install-schema-skills.sh
sh scripts/validate-schemas.sh

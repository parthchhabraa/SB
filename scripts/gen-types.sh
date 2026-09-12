#!/usr/bin/env bash
#
# Generates lib/supabase/database.types.ts from the live schema of the local
# test cluster, so the types cannot drift away from the migrations.
#
# Once you have a real Supabase project you can swap this for
#   supabase gen types typescript --project-id <id>
# which produces the same shape.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/scripts/gen-types.mjs" "$@"

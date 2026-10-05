#!/usr/bin/env bash
# Project-scoped rollback of tavalod's web container to an earlier release (run ON THE SERVER):
#   bash <TAVALOD_BASE>/current/deploy/rollback.sh [<sha>]
# Without an argument the release before the current one in ops/releases.log is used.
# The database is NOT restored: migrations are additive/forward-only, so older code keeps working
# with the newer schema. Restoring a backup would discard newer user data and must be a separate,
# deliberate decision (see docs/operations.md).
#
# Compatibility guards: some older releases would mis-handle data written by newer ones. The guard
# below checks the real data, not just the schema, and refuses instead of rolling back unsafely.
set -euo pipefail
# shellcheck source=release-env.sh
. "$(dirname "${BASH_SOURCE[0]}")/release-env.sh"
CUR=$(basename "$(readlink "$BASE/current")")
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  TARGET=$(awk '{print $2}' "$BASE/ops/releases.log" | grep -v "^$CUR$" | tail -n 1)
fi
[ -n "$TARGET" ] && [ -d "$BASE/releases/$TARGET" ] || { echo "release '$TARGET' not found" >&2; exit 1; }
docker image inspect "tavalod:$TARGET" >/dev/null

DB="$C exec -T db psql -U tavalod -d tavalod -Atc"
# Phase 2 (migration 0004) introduced private surprise spaces. Releases before it load every
# expense/settlement of a group into the PUBLIC ledger, which would expose surprise money.
if [ ! -f "$BASE/releases/$TARGET/drizzle/0004_phase2_privacy_triggers.sql" ]; then
  PRIVATE=$($DB "select (select count(*) from expenses where space_id is not null) + (select count(*) from settlements where space_id is not null)" 2>/dev/null || echo "?")
  if [ "$PRIVATE" != "0" ]; then
    echo "refusing rollback to $TARGET: it predates private spaces and $PRIVATE private money row(s) exist;" >&2
    echo "that release would show surprise expenses in public group balances. Roll forward with a fix instead." >&2
    exit 2
  fi
  echo "guard: $TARGET predates private spaces; no private money rows exist, rollback is safe."
fi

# Same server settings as the current release, pointing at the target release.
sed "s/^TAVALOD_RELEASE=.*/TAVALOD_RELEASE=$TARGET/" "$SCRIPT_DIR/release.env" > "$BASE/releases/$TARGET/deploy/release.env"
cd "$BASE/releases/$TARGET/deploy"
C="docker compose -p tavalod -f compose.yml --env-file release.env"
$C up -d web backup
for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' tavalod-web-1)" = healthy ] && break; sleep 3; done
ln -sfn "$BASE/releases/$TARGET" "$BASE/current"
echo "$(date -u +%FT%TZ) $TARGET rollback-from=$CUR" >> "$BASE/ops/releases.log"
echo "rolled back to $TARGET: $(curl -fsS "$URL/api/health")"

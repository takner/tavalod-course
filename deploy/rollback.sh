#!/usr/bin/env bash
# Project-scoped rollback of tavalod's web container to an earlier release (run ON THE SERVER):
#   bash /home/deploy/apps/tavalod/current/deploy/rollback.sh [<sha>]
# Without an argument the release before the current one in ops/releases.log is used.
# The database is NOT restored: migrations are additive/forward-only, so older code keeps working
# with the newer schema. Restoring a backup would discard newer user data and must be a separate,
# deliberate decision (see docs/operations.md).
set -euo pipefail
BASE=/home/deploy/apps/tavalod
CUR=$(basename "$(readlink "$BASE/current")")
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  TARGET=$(awk '{print $2}' "$BASE/ops/releases.log" | grep -v "^$CUR$" | tail -n 1)
fi
[ -n "$TARGET" ] && [ -d "$BASE/releases/$TARGET" ] || { echo "release '$TARGET' not found" >&2; exit 1; }
docker image inspect "tavalod:$TARGET" >/dev/null
cd "$BASE/releases/$TARGET/deploy"
echo "TAVALOD_RELEASE=$TARGET" > release.env
C="docker compose -p tavalod -f compose.yml --env-file release.env"
$C up -d web backup
for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' tavalod-web-1)" = healthy ] && break; sleep 3; done
ln -sfn "$BASE/releases/$TARGET" "$BASE/current"
echo "$(date -u +%FT%TZ) $TARGET rollback-from=$CUR" >> "$BASE/ops/releases.log"
echo "rolled back to $TARGET: $(curl -fsS https://tavalod.example.com/api/health)"

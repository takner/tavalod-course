#!/usr/bin/env bash
# Proves the latest tavalod backup restores, in an isolated throwaway container with no network
# (container "tavalod-restoretest", removed at the end). Live data is untouched. Run ON THE SERVER:
#   bash <TAVALOD_BASE>/current/deploy/restore-test.sh [dump-file]
set -euo pipefail
# shellcheck source=release-env.sh
. "$(dirname "${BASH_SOURCE[0]}")/release-env.sh"
DUMP="${1:-$(ls -1t "$BASE"/backups/tavalod-*.dump | head -n 1)}"
NAME=tavalod-restoretest
docker rm -f "$NAME" >/dev/null 2>&1 || true
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$NAME" --network none --memory 512m --cpus 0.5 \
  -e POSTGRES_USER=tavalod -e POSTGRES_DB=tavalod -e POSTGRES_PASSWORD=restoretest postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U tavalod -d tavalod >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker cp "$DUMP" "$NAME:/tmp/restore.dump"
docker exec "$NAME" pg_restore -U tavalod -d tavalod --no-owner /tmp/restore.dump
Q="select (select count(*) from users) users, (select count(*) from groups) groups, (select count(*) from expenses) expenses, (select count(*) from settlements) settlements"
echo "restored ($(basename "$DUMP")): $(docker exec "$NAME" psql -U tavalod -d tavalod -Atc "$Q")"
echo "live now                      : $(docker exec tavalod-db-1 psql -U tavalod -d tavalod -Atc "$Q")"
echo "restore test OK"

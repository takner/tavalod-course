#!/usr/bin/env bash
# Server side of a deploy. Invoked by deploy/deploy.sh after the release has been unpacked into
# /home/deploy/apps/tavalod/releases/<sha>. Touches only tavalod's own containers, image and files.
#   bash remote-deploy.sh <sha>
set -euo pipefail
umask 077
SHA="$1"
BASE=/home/deploy/apps/tavalod
REL="$BASE/releases/$SHA"
URL=https://tavalod.example.com
cd "$REL/deploy"

for f in app.env db.env; do
  [ -f "$BASE/shared/$f" ] || { echo "missing $BASE/shared/$f — run deploy/server-init.sh first" >&2; exit 1; }
done
echo "TAVALOD_RELEASE=$SHA" > release.env
C="docker compose -p tavalod -f compose.yml --env-file release.env"
PREV=$(readlink "$BASE/current" 2>/dev/null | xargs -r basename || echo none)

echo "==> building image tavalod:$SHA"
docker build -q -f "$REL/deploy/Dockerfile" -t "tavalod:$SHA" "$REL" >/dev/null

echo "==> database"
$C up -d db
for i in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' tavalod-db-1 2>/dev/null)" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' tavalod-db-1)" = healthy ] || { echo "database not healthy" >&2; exit 1; }

echo "==> pre-migration backup"
TS=$(date -u +%Y%m%dT%H%M%SZ)
$C exec -T db pg_dump -U tavalod -d tavalod -Fc > "$BASE/backups/tavalod-predeploy-$SHA-$TS.dump.partial"
mv "$BASE/backups/tavalod-predeploy-$SHA-$TS.dump.partial" "$BASE/backups/tavalod-predeploy-$SHA-$TS.dump"
# keep the 10 most recent pre-deploy dumps
ls -1t "$BASE"/backups/tavalod-predeploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f

echo "==> migrations"
$C run --rm migrate

echo "==> starting web + backup"
$C up -d web backup
for i in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' tavalod-web-1 2>/dev/null)" = healthy ] && break
  sleep 3
done
[ "$(docker inspect -f '{{.State.Health.Status}}' tavalod-web-1)" = healthy ] || {
  echo "web did not become healthy — logs:" >&2
  $C logs --tail 50 web >&2
  exit 1
}

echo "==> verifying $URL"
OK=""
for i in $(seq 1 40); do
  BODY=$(curl -fsS --max-time 10 "$URL/api/health" 2>/dev/null || true)
  if echo "$BODY" | grep -q "\"release\":\"$SHA\""; then OK=1; break; fi
  sleep 3
done
[ -n "$OK" ] || { echo "public health check did not report release $SHA (last: ${BODY:-none})" >&2; exit 1; }

ln -sfn "$REL" "$BASE/current"
echo "$(date -u +%FT%TZ) $SHA previous=$PREV" >> "$BASE/ops/releases.log"
echo "deployed $SHA: $BODY"

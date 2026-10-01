#!/usr/bin/env bash
# Re-creates the web container of the current release so it picks up changes in shared/app.env
# (e.g. after filling in SMTP settings). Run ON THE SERVER:
#   bash /home/deploy/apps/tavalod/current/deploy/restart-web.sh
set -euo pipefail
BASE=/home/deploy/apps/tavalod
cd "$BASE/current/deploy"
C="docker compose -p tavalod -f compose.yml --env-file release.env"
$C up -d --force-recreate web
for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' tavalod-web-1)" = healthy ] && break; sleep 3; done
echo "web: $(docker inspect -f '{{.State.Health.Status}}' tavalod-web-1) — $(curl -fsS https://tavalod.example.com/api/health)"

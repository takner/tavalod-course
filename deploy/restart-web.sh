#!/usr/bin/env bash
# Re-creates the web container of the current release so it picks up changes in shared/app.env
# (e.g. after filling in SMTP settings). Run ON THE SERVER:
#   bash <TAVALOD_BASE>/current/deploy/restart-web.sh
set -euo pipefail
# shellcheck source=release-env.sh
. "$(dirname "${BASH_SOURCE[0]}")/release-env.sh"
$C up -d --force-recreate web
for i in $(seq 1 40); do [ "$(docker inspect -f '{{.State.Health.Status}}' tavalod-web-1)" = healthy ] && break; sleep 3; done
echo "web: $(docker inspect -f '{{.State.Health.Status}}' tavalod-web-1) — $(curl -fsS "$URL/api/health")"

#!/usr/bin/env bash
# Repeatable deploy from a developer machine (Git Bash / Linux / macOS).
#   cp deploy/deploy.env.example deploy/deploy.env   # once; fill in your server
#   deploy/deploy.sh init       # once per server: directories + generated secrets
#   deploy/deploy.sh            # deploys HEAD
#   deploy/deploy.sh <commit>   # deploys a specific pushed commit
# Requires: a clean working tree, the commit pushed to origin, SSH access to the server.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
die() { echo "deploy: $*" >&2; exit 1; }

[ -f deploy/deploy.env ] || die "deploy/deploy.env not found — copy deploy/deploy.env.example and fill it in"
set -a
# shellcheck disable=SC1091
. deploy/deploy.env
set +a
for v in TAVALOD_SERVER TAVALOD_BASE TAVALOD_DOMAIN TRAEFIK_NETWORK TRAEFIK_ENTRYPOINT TRAEFIK_CERTRESOLVER; do
  [ -n "${!v:-}" ] || die "$v is not set in deploy/deploy.env"
done
SERVER="$TAVALOD_SERVER"
BASE="$TAVALOD_BASE"
# Settings handed to the server-side scripts (shell-quoted).
REMOTE_ENV=$(printf 'TAVALOD_BASE=%q TAVALOD_DOMAIN=%q TRAEFIK_NETWORK=%q TRAEFIK_ENTRYPOINT=%q TRAEFIK_CERTRESOLVER=%q' \
  "$TAVALOD_BASE" "$TAVALOD_DOMAIN" "$TRAEFIK_NETWORK" "$TRAEFIK_ENTRYPOINT" "$TRAEFIK_CERTRESOLVER")
SSH=(ssh -o BatchMode=yes "$SERVER")

if [ "${1:-}" = "init" ]; then
  echo "==> preparing $SERVER:$BASE"
  "${SSH[@]}" "$REMOTE_ENV bash -s" < deploy/server-init.sh
  exit 0
fi

REF="${1:-HEAD}"
git diff --quiet && git diff --cached --quiet || die "working tree has uncommitted changes"
SHA=$(git rev-parse --short=12 "$REF^{commit}")
git fetch -q origin
git branch -r --contains "$SHA" | grep -q 'origin/' || die "commit $SHA is not on origin — push it first"

echo "==> uploading $SHA to $SERVER"
"${SSH[@]}" "test -d $BASE/shared || { echo 'server not initialised: run deploy/deploy.sh init' >&2; exit 1; }; rm -rf $BASE/releases/$SHA && mkdir -p $BASE/releases/$SHA"
git archive --format=tar "$SHA" | "${SSH[@]}" "tar -x -C $BASE/releases/$SHA"

echo "==> deploying on server"
"${SSH[@]}" "$REMOTE_ENV bash $BASE/releases/$SHA/deploy/remote-deploy.sh $SHA"

# Keep the 5 newest releases (and whatever `current` points to); remove their old images too.
"${SSH[@]}" "cd $BASE/releases && cur=\$(basename \$(readlink $BASE/current)) && ls -1t | tail -n +6 | grep -v \"^\$cur\$\" | while read r; do rm -rf \"\$r\"; docker image rm -f \"tavalod:\$r\" >/dev/null 2>&1 || true; done"
echo "==> done: https://$TAVALOD_DOMAIN ($SHA)"

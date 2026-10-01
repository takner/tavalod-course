#!/usr/bin/env bash
# Repeatable deploy from a developer machine (Git Bash / Linux / macOS):
#   deploy/deploy.sh            # deploys HEAD
#   deploy/deploy.sh <commit>   # deploys a specific pushed commit
# Requires: a clean working tree, the commit pushed to origin, SSH access to the server.
set -euo pipefail
SERVER="${TAVALOD_SERVER:-deploy@your-server.example}"
BASE=/home/deploy/apps/tavalod
REF="${1:-HEAD}"
cd "$(git rev-parse --show-toplevel)"

die() { echo "deploy: $*" >&2; exit 1; }
git diff --quiet && git diff --cached --quiet || die "working tree has uncommitted changes"
SHA=$(git rev-parse --short=12 "$REF^{commit}")
git fetch -q origin
git branch -r --contains "$SHA" | grep -q 'origin/' || die "commit $SHA is not on origin — push it first"

echo "==> uploading $SHA to $SERVER"
ssh -o BatchMode=yes "$SERVER" "test -d $BASE/shared || { echo 'server not initialised: run deploy/server-init.sh' >&2; exit 1; }; rm -rf $BASE/releases/$SHA && mkdir -p $BASE/releases/$SHA"
git archive --format=tar "$SHA" | ssh -o BatchMode=yes "$SERVER" "tar -x -C $BASE/releases/$SHA"

echo "==> deploying on server"
ssh -o BatchMode=yes "$SERVER" "bash $BASE/releases/$SHA/deploy/remote-deploy.sh $SHA"

# Keep the 5 newest releases (and whatever `current` points to); remove their old images too.
ssh -o BatchMode=yes "$SERVER" "cd $BASE/releases && cur=\$(basename \$(readlink $BASE/current)) && ls -1t | tail -n +6 | grep -v \"^\$cur\$\" | while read r; do rm -rf \"\$r\"; docker image rm -f \"tavalod:\$r\" >/dev/null 2>&1 || true; done"
echo "==> done: https://tavalod.example.com ($SHA)"

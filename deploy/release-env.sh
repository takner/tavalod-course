#!/usr/bin/env bash
# Sourced by the server-side scripts. Loads the settings recorded for this release
# (deploy/release.env, written by remote-deploy.sh) and exposes BASE, URL and C (compose command).
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
[ -f "$SCRIPT_DIR/release.env" ] || { echo "missing $SCRIPT_DIR/release.env — this release was never deployed" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. "$SCRIPT_DIR/release.env"
set +a
: "${TAVALOD_BASE:?}" "${TAVALOD_DOMAIN:?}"
BASE="$TAVALOD_BASE"
URL="https://$TAVALOD_DOMAIN"
C="docker compose -p tavalod -f $SCRIPT_DIR/compose.yml --env-file $SCRIPT_DIR/release.env"

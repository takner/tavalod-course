#!/usr/bin/env bash
# One-time (idempotent) server preparation for tavalod, normally run through `deploy/deploy.sh init`
# (which passes TAVALOD_BASE and TAVALOD_DOMAIN). Creates the directory layout and generates secrets
# that never leave the server. Existing files are never overwritten; secret values are never printed.
set -euo pipefail
: "${TAVALOD_BASE:?set TAVALOD_BASE}" "${TAVALOD_DOMAIN:?set TAVALOD_DOMAIN}"
BASE="$TAVALOD_BASE"
umask 077
mkdir -p "$BASE"/{releases,shared,backups,ops}
chmod 700 "$BASE" "$BASE/shared" "$BASE/releases" "$BASE/ops"
chmod 755 "$BASE/backups" # the backup container writes here as the deploy user's uid

if [ ! -f "$BASE/shared/db.env" ]; then
  DB_PASSWORD=$(openssl rand -hex 24)
  cat > "$BASE/shared/db.env" <<EOF
POSTGRES_USER=tavalod
POSTGRES_DB=tavalod
POSTGRES_PASSWORD=$DB_PASSWORD
EOF
  echo "created shared/db.env"
else
  echo "shared/db.env exists — kept"
fi

if [ ! -f "$BASE/shared/app.env" ]; then
  DB_PASSWORD=$(grep '^POSTGRES_PASSWORD=' "$BASE/shared/db.env" | cut -d= -f2-)
  cat > "$BASE/shared/app.env" <<EOF
NODE_ENV=production
APP_URL=https://$TAVALOD_DOMAIN
DATABASE_URL=postgres://tavalod:$DB_PASSWORD@tavalod-db:5432/tavalod
DATABASE_POOL_MAX=10
EMAIL_TRANSPORT=smtp
# Fill these in to enable sign-in emails, then: bash $BASE/current/deploy/restart-web.sh
SMTP_HOST=
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
EOF
  echo "created shared/app.env (SMTP_* still empty)"
else
  echo "shared/app.env exists — kept"
fi
chmod 600 "$BASE"/shared/*.env
touch "$BASE/ops/releases.log"
echo "variables in app.env: $(cut -d= -f1 "$BASE/shared/app.env" | grep -v '^#' | tr '\n' ' ')"

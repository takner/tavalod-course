#!/bin/sh
# Daily tavalod database backup (pg_dump custom format) with retention in days.
# Runs inside the tavalod `backup` container only; touches nothing outside /backups.
set -eu
umask 077
export PGPASSWORD="${POSTGRES_PASSWORD}"
RET="${BACKUP_RETENTION_DAYS:-14}"
while true; do
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  # Housekeeping first: expired sessions and day-old sign-in tokens are never needed again.
  psql -qtA -c "delete from sessions where expires_at < now(); delete from login_tokens where expires_at < now() - interval '1 day';" >/dev/null 2>&1 || true
  if pg_dump -Fc -f "/backups/tavalod-db-${TS}.dump.partial"; then
    mv "/backups/tavalod-db-${TS}.dump.partial" "/backups/tavalod-db-${TS}.dump"
    echo "backup ok ${TS}"
  else
    echo "backup FAILED ${TS}" >&2
    rm -f "/backups/tavalod-db-${TS}.dump.partial"
  fi
  find /backups -maxdepth 1 -name 'tavalod-db-*.dump' -mtime "+${RET}" -delete
  sleep 86400
done

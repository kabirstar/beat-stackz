#!/bin/sh
# pg_dump the app database, gzip it, upload to s3://$BACKUP_BUCKET/<ts>.sql.gz.
#   backup.sh once   -> one backup, exit non-zero on failure (used by the local check)
#   backup.sh loop   -> forever, every BACKUP_INTERVAL seconds (default 24h)
# Retention is an R2 lifecycle rule on the bucket (see docs/HOSTING.md), not code here.
set -eu
: "${DATABASE_URL:?}" "${BACKUP_BUCKET:?}" "${S3_ENDPOINT:?}" "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}"
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" AWS_DEFAULT_REGION="${S3_REGION:-auto}"
export AWS_EC2_METADATA_DISABLED=true

run() {
  name="bpackz-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -6 > "/tmp/$name"
  size=$(wc -c < "/tmp/$name")
  [ "$size" -gt 200 ] || { echo "backup: dump suspiciously small ($size bytes)"; rm -f "/tmp/$name"; return 1; }
  aws --endpoint-url "$S3_ENDPOINT" s3 cp --only-show-errors "/tmp/$name" "s3://$BACKUP_BUCKET/$name"
  rm -f "/tmp/$name"
  echo "backup ok: $name ($size bytes)"
}

case "${1:-loop}" in
  once) run ;;
  loop) while :; do run || echo "backup FAILED at $(date -u +%FT%TZ)"; sleep "${BACKUP_INTERVAL:-86400}"; done ;;
  *) echo "usage: backup.sh once|loop"; exit 2 ;;
esac

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# --- .env loading disabled, using credentials for hstn.me hosting ---
# NOTE: Credentials are now hardcoded here and should match backend/config/config.php
DB_HOST="sql304.hstn.me"
DB_PORT="3306"
DB_SOCKET=""
DB_NAME="mseet_41262115_db_ams"
DB_USER="mseet_41262115"
DB_PASS="qHc1zGYAbyZP"

mkdir -p backups
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="backups/${DB_NAME}_${STAMP}.sql.gz"

export MYSQL_PWD="$DB_PASS"

MYSQLDUMP_BIN="mysqldump"
if [[ -x /opt/lampp/bin/mysqldump ]]; then
  MYSQLDUMP_BIN="/opt/lampp/bin/mysqldump"
fi

if [[ -n "$DB_SOCKET" ]]; then
  "$MYSQLDUMP_BIN" --single-transaction --routines --triggers \
    --socket="$DB_SOCKET" -u "$DB_USER" "$DB_NAME" | gzip > "$OUT_FILE"
else
  "$MYSQLDUMP_BIN" --single-transaction --routines --triggers \
    -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" | gzip > "$OUT_FILE"
fi

unset MYSQL_PWD

echo "Backup created: $OUT_FILE"

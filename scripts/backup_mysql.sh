#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || { echo "Missing value for --env-file" >&2; exit 1; }
      ENV_FILE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "Usage: $0 [--env-file /path/to/.env] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

load_env_file() {
  local env_file="$1"
  local raw_line key value

  [[ -f "$env_file" ]] || { echo "Env file not found: $env_file" >&2; exit 1; }

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    raw_line="${raw_line%$'\r'}"
    case "$raw_line" in
      ''|'#'*) continue ;;
    esac

    [[ "$raw_line" == *=* ]] || continue

    key="${raw_line%%=*}"
    value="${raw_line#*=}"
    key="${key#export }"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"

    if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:-1}"
    fi

    export "$key=$value"
  done < "$env_file"
}

require_env_var() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "$value" ]] || { echo "Missing required env var $name in $ENV_FILE" >&2; exit 1; }
}

load_env_file "$ENV_FILE"

DB_HOST="${DB_HOST:-}"
DB_PORT="${DB_PORT:-3306}"
DB_SOCKET="${DB_SOCKET:-}"
DB_NAME="${DB_NAME:-}"
DB_USER="${DB_USER:-}"
DB_PASS="${DB_PASS:-}"

require_env_var DB_NAME
require_env_var DB_USER
require_env_var DB_PASS

if [[ -z "$DB_SOCKET" ]]; then
  require_env_var DB_HOST
fi

mkdir -p backups
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="backups/${DB_NAME}_${STAMP}.sql.gz"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run successful."
  echo "Env file: $ENV_FILE"
  echo "Backup file: $OUT_FILE"
  if [[ -n "$DB_SOCKET" ]]; then
    echo "Connection: socket $DB_SOCKET"
  else
    echo "Connection: host $DB_HOST port $DB_PORT"
  fi
  echo "Database: $DB_NAME"
  echo "User: $DB_USER"
  exit 0
fi

export MYSQL_PWD="$DB_PASS"
trap 'unset MYSQL_PWD' EXIT

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

echo "Backup created: $OUT_FILE"

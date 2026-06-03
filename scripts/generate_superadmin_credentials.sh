#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.superadmin}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || { echo "Missing value for --env-file" >&2; exit 1; }
      ENV_FILE="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 [--env-file /path/to/.env.superadmin]" >&2
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

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

load_env_file "$ENV_FILE"

require_env_var SUPERADMIN_UNIQUE_USER_ID
require_env_var SUPERADMIN_NAME
require_env_var SUPERADMIN_PASSWORD

SUPERADMIN_OUTPUT_FILE="${SUPERADMIN_OUTPUT_FILE:-scripts/superadmin_credentials.local.sql}"
PASSWORD_HASH="$(
  SUPERADMIN_PASSWORD="$SUPERADMIN_PASSWORD" php -r 'echo password_hash(getenv("SUPERADMIN_PASSWORD"), PASSWORD_DEFAULT), PHP_EOL;'
)"

mkdir -p "$(dirname "$SUPERADMIN_OUTPUT_FILE")"

cat > "$SUPERADMIN_OUTPUT_FILE" <<SQL
-- Generated locally by scripts/generate_superadmin_credentials.sh
-- Source env file: ${ENV_FILE}
-- Password is intentionally not stored in this SQL file.

SET @sa_unique_user_id = '$(sql_escape "$SUPERADMIN_UNIQUE_USER_ID")';
SET @sa_name = '$(sql_escape "$SUPERADMIN_NAME")';
SET @sa_password_hash = '$(sql_escape "$PASSWORD_HASH")';

UPDATE \`users\`
SET
  \`college_id\` = NULL,
  \`name\` = @sa_name,
  \`email\` = NULL,
  \`password_hash\` = @sa_password_hash,
  \`role\` = 'super_admin',
  \`status\` = 'active',
  \`deleted_at\` = NULL
WHERE \`unique_user_id\` = @sa_unique_user_id;

INSERT INTO \`users\` (
  \`unique_user_id\`,
  \`college_id\`,
  \`name\`,
  \`email\`,
  \`password_hash\`,
  \`role\`,
  \`status\`,
  \`deleted_at\`,
  \`last_login\`
)
SELECT
  @sa_unique_user_id,
  NULL,
  @sa_name,
  NULL,
  @sa_password_hash,
  'super_admin',
  'active',
  NULL,
  NULL
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM \`users\`
  WHERE \`unique_user_id\` = @sa_unique_user_id
);

SELECT \`id\`, \`unique_user_id\`, \`name\`, \`role\`, \`status\`
FROM \`users\`
WHERE \`unique_user_id\` = @sa_unique_user_id;
SQL

echo "Generated: $SUPERADMIN_OUTPUT_FILE"
echo "Login ID: $SUPERADMIN_UNIQUE_USER_ID"
echo "Name: $SUPERADMIN_NAME"
echo "Password source: $ENV_FILE"

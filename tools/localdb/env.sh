# tools/localdb 共通設定（source して使う）
LOCALDB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${LOCALDB_DIR}/../.." && pwd)"
PGDATA_DIR="${REPO_ROOT}/.localdb/data"
PGLOG="${REPO_ROOT}/.localdb/postgres.log"
export PGHOST=127.0.0.1
export PGPORT="${LOCALDB_PORT:-54329}"
export PGUSER=postgres
LOCALDB_NAME="${LOCALDB_NAME:-mj_dev}"

PGBIN=""
for d in /opt/homebrew/opt/postgresql@14/bin /usr/local/opt/postgresql@14/bin /opt/homebrew/opt/postgresql@15/bin /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@17/bin; do
  if [ -x "$d/initdb" ]; then PGBIN="$d"; break; fi
done
if [ -z "$PGBIN" ]; then
  if command -v initdb >/dev/null 2>&1; then
    PGBIN="$(dirname "$(command -v initdb)")"
  else
    echo "PostgreSQL が見つかりません（brew install postgresql@14）" >&2
    exit 1
  fi
fi
export PATH="$PGBIN:$PATH"

#!/usr/bin/env bash
# 開発DB（既定 mj_dev）を作り直す: 認証スタブ → ローカル認証の拡張 → v2 migrations → 初期データ。
# 接続先は env.sh が 127.0.0.1:54329 に固定する。ローカル以外には流れない。
set -euo pipefail
source "$(dirname "$0")/env.sh"
V2="${REPO_ROOT}/supabase/v2"

if ! pg_isready -q -h "${PGHOST}" -p "${PGPORT}"; then
  echo "DB が起動していません。先に tools/localdb/start.sh" >&2
  exit 1
fi

psql -X -q -v ON_ERROR_STOP=1 -d postgres \
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='${LOCALDB_NAME}' and pid <> pg_backend_pid()" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${LOCALDB_NAME}" -c "create database ${LOCALDB_NAME}"

run() { psql -X -q -v ON_ERROR_STOP=1 -d "${LOCALDB_NAME}" -f "$1"; }
run "${V2}/tests/00_local_auth_stub.sql"
run "${LOCALDB_DIR}/sql/01_local_auth.sql"
for f in "${V2}"/migrations/*.sql; do
  echo "== apply $(basename "$f")"
  run "$f"
done
echo "== seed"
node "${LOCALDB_DIR}/seed.mjs" | psql -X -q -v ON_ERROR_STOP=1 -d "${LOCALDB_NAME}" >/dev/null
psql -X -At -d "${LOCALDB_NAME}" -c "select 'users=' || (select count(*) from auth.users) || ' clubs=' || (select count(*) from public.clubs) || ' club_code=' || (select club_code from public.clubs limit 1)"
psql -X -At -d "${LOCALDB_NAME}" -c "select 'ledger problems=' || count(*) from public.clubs c, lateral private.verify_point_chain_impl(c.id)"

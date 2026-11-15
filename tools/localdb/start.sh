#!/usr/bin/env bash
# ローカル開発用 PostgreSQL を <repo>/.localdb/ に用意して起動する（ポート 54329・127.0.0.1 のみ）。
set -euo pipefail
source "$(dirname "$0")/env.sh"

if [ ! -f "${PGDATA_DIR}/PG_VERSION" ]; then
  mkdir -p "$(dirname "${PGDATA_DIR}")"
  initdb -D "${PGDATA_DIR}" -U postgres --auth=trust -E UTF8 --locale=C >/dev/null
  echo "initdb: ${PGDATA_DIR}"
fi

if pg_isready -q -h "${PGHOST}" -p "${PGPORT}"; then
  echo "すでに起動しています (port ${PGPORT})"
else
  # TCP は 127.0.0.1 だけ。UNIX ソケットは使わない
  pg_ctl -D "${PGDATA_DIR}" -o "-p ${PGPORT} -c listen_addresses=127.0.0.1 -k ''" -l "${PGLOG}" -w start >/dev/null
  echo "起動しました (port ${PGPORT})"
fi

if ! psql -X -At -d postgres -c "select 1 from pg_database where datname='${LOCALDB_NAME}'" | grep -q 1; then
  echo "DB ${LOCALDB_NAME} がまだありません → reset.sh を実行します"
  bash "${LOCALDB_DIR}/reset.sh"
fi
echo "DATABASE_URL=postgres://postgres@127.0.0.1:${PGPORT}/${LOCALDB_NAME}"

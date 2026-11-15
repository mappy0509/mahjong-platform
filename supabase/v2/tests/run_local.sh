#!/usr/bin/env bash
# v2 スキーマのローカル検証。
# 使い方:
#   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres bash supabase/v2/tests/run_local.sh
# 指定した Postgres に使い捨て DB（既定 mj_v2_test）を作り直し、
# auth スタブ → migrations → テストの順に流す。本番・リモートには絶対に向けないこと。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
V2="$(dirname "$HERE")"
DB="${TEST_DB:-mj_v2_test}"

case "${PGHOST:-localhost}" in
  127.0.0.1|localhost|::1|/*) ;;
  *) echo "refuse: PGHOST=${PGHOST} はローカルではありません" >&2; exit 2 ;;
esac

psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"

run() { psql -X -q -v ON_ERROR_STOP=1 -d "${DB}" -f "$1"; }

run "${HERE}/00_local_auth_stub.sql"
for f in "${V2}"/migrations/*.sql; do
  echo "== apply $(basename "$f")"
  run "$f"
done
for f in "${HERE}"/[1-9]*.sql; do
  echo "== test  $(basename "$f")"
  run "$f"
done

psql -X -q -v ON_ERROR_STOP=1 -d "${DB}" -At -c "select format('PASS %s / FAIL %s', count(*) filter (where ok), count(*) filter (where not ok)) from test.results"
psql -X -q -d "${DB}" -c "select id, name, detail from test.results where not ok order by id"
FAILS=$(psql -X -q -d "${DB}" -At -c "select count(*) from test.results where not ok")
[ "${FAILS}" = "0" ]

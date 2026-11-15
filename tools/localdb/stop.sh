#!/usr/bin/env bash
# ローカル開発用 PostgreSQL を止める（データは残る）。
set -euo pipefail
source "$(dirname "$0")/env.sh"
pg_ctl -D "${PGDATA_DIR}" -m fast stop

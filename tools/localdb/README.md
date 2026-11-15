# tools/localdb — ローカル開発用 PostgreSQL

Docker なしで動かすための道具。Homebrew の PostgreSQL 14 を使い、クラスタは `<repo>/.localdb/`（gitignore 済み）に作る。
ポート 54329・127.0.0.1 のみ・認証 trust。**本番やリモートには一切つながない。**

| コマンド | 内容 |
|---|---|
| `bash tools/localdb/start.sh` | 無ければ initdb → 起動。DB `mj_dev` が無ければ reset も実行 |
| `bash tools/localdb/reset.sh` | `mj_dev` を作り直す（認証スタブ → `sql/01_local_auth.sql` → `supabase/v2/migrations/*` → `seed.mjs`） |
| `bash tools/localdb/stop.sh` | 停止（データは残る） |
| `node tools/localdb/smoke.mjs` | API の通し確認（90項目）。Web を `TABLE_SERVER_URL=http://127.0.0.1:8799` で起動してから実行 |

接続先: `postgres://postgres@127.0.0.1:54329/mj_dev`

## 初期データ（全員のパスワードは `mahjong-dev-1234`。開発専用）

| メール | 役割 | 表示名 |
|---|---|---|
| platform@example.test | プラットフォーマー | 運営 |
| owner@example.test | オーナー（龍門倶楽部） | 龍門オーナー |
| agent@example.test | エージェント | 代理の辰 |
| p1@ / p2@example.test | プレイヤー（オーナー直下） | 東風 / 南雲 |
| p3@ / p4@example.test | プレイヤー（エージェント配下） | 西園 / 北斗 |

クラブにダイヤ200、金庫に発行100万、各自に持ち点5万（エージェントは配布後5万）。クラブIDは reset のたびに変わる（reset.sh の最後に表示）。

## 注意
- `sql/01_local_auth.sql` は auth.users に `encrypted_password` 等を足すローカル専用の拡張。Supabase には流さない。
- スキーマのテストは従来どおり `PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres bash supabase/v2/tests/run_local.sh`（別DB `mj_v2_test` を使う）。

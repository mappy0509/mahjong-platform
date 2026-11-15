# supabase/v2 — 麻雀プラットフォーム新スキーマ

全体設計は `docs/RENEWAL_PLAN.md`。旧 `supabase/migrations/` は参考のみ（流用していない）。
**旧スキーマと同名のテーブル（profiles, clubs など）があるため、旧スキーマと同じ DB には載らない。新しい Supabase プロジェクト（または旧スキーマを消した DB）に適用する前提。**

## 方針

- 全テーブル RLS 有効・既定は拒否。`authenticated` には SELECT だけ渡し、RLS で絞る。INSERT/UPDATE/DELETE のポリシーは作らない。
- 書き込みはすべて `SECURITY DEFINER` + `set search_path = ''` の RPC。内部で `auth.uid()` とロールを検証する。
- `anon` にはテーブルも関数も一切渡さない。`service_role` も表の直接書き込みは不可（RPC のみ）。
- 台帳（ダイヤ・ポイント・監査ログ・局結果）は追記のみ。UPDATE/DELETE/TRUNCATE はトリガーで拒否（postgres でも）。
- 台帳と残高テーブルは `private.post_point` / `private.post_diamond` だけが書ける（トランザクション内フラグ `app.ledger_write` が立っている間だけ）。残高は台帳と同じ関数・同じトランザクションで更新。
- ポイント台帳はクラブ単位のハッシュ連鎖（`seq` 連番、`prev_hash → hash` = SHA-256）。`verify_ledgers(club_id)` でチェーン・`balance_after` の連続性・残高テーブルとの一致・振替の借方貸方を検証。

## ファイル

| ファイル | 内容 |
|---|---|
| `migrations/20261115000100_base.sql` | 拡張、`private` スキーマ、`platform_settings`、`profiles`、`platform_admins`、`audit_log`、共通補助関数、`update_profile` |
| `migrations/20261115000200_clubs.sql` | `clubs`、`club_members`、`club_invite_codes`、ロール判定関数（RLS と RPC で共用） |
| `migrations/20261115000300_ledgers.sql` | `point_ledger` / `point_balances` / `diamond_ledger` / `diamond_balances`、ガード、ハッシュ、記帳関数、検証関数 |
| `migrations/20261115000400_tables_games.sql` | `tables`、`table_seats`、`games`、`game_players`、`game_rounds`、既定ルールと検証 |
| `migrations/20261115000500_rpc_club.sql` | クラブ運営 RPC |
| `migrations/20261115000600_rpc_economy.sql` | ダイヤ・ポイント RPC |
| `migrations/20261115000700_rpc_tables.sql` | 卓・対局・精算 RPC |
| `migrations/20261115000800_rpc_read.sql` | 戦績・集計の読み取り RPC |
| `migrations/20261115000900_rls_grants.sql` | RLS ポリシーと GRANT/REVOKE（最後に流す） |
| `tests/00_local_auth_stub.sql` | **ローカル専用** auth スキーマ/ロールの最小スタブ（本番では流さない） |
| `tests/10_harness.sql` | なりすましテストのハーネス（`test` スキーマ） |
| `tests/20_scenarios.sql` | 役割別の可否・経済・精算・不変条件・改ざん検知（212 件） |
| `tests/run_local.sh` | 使い捨て DB を作って全部流す |

## テーブル

| テーブル | 中身 |
|---|---|
| `platform_settings` | 設定値（ダイヤ消費量など。**値はすべて仮置き・要確認**） |
| `profiles` | auth.users と 1:1。表示名・アイコン（https のみ） |
| `platform_admins` | プラットフォーマー（L1）。付与は人間が SQL で行う |
| `clubs` | 公開ID `club_code`（数字7桁で採番、制約は6〜8桁）、Fee 設定、貸し越し可否、既定ルール、状態 |
| `club_members` | role owner/agent/player、status pending/active/removed/rejected、`agent_id`、エイリアス |
| `club_invite_codes` | 招待コード。`agent_id` null = クラブのコード、非 null = エージェント個人のコード |
| `diamond_ledger` / `diamond_balances` | クラブのダイヤ。grant / club_create / table_open / maintenance / adjust |
| `point_ledger` / `point_balances` | クラブ×口座のポイント。口座は会員（user_id）かクラブ金庫（account_id = club_id）。issue / burn / transfer / game_result / fee / adjust |
| `tables` / `table_seats` | 卓（3/4人、東風/半荘、レート、最低持ち込み、ルールJSON、状態）と着席 |
| `games` / `game_players` / `game_rounds` | 対局結果（最終点・順位・ウマオカ後スコア×10・ポイント増減・Fee・牌譜パス）と局ごとの結果 |
| `audit_log` | 全 RPC の操作記録（追記のみ） |

## RPC

| RPC | 呼べる人 | 内容 |
|---|---|---|
| `create_club(name, description)` | ログインユーザー（`club_create_open=false` ならプラットフォーマーのみ） | クラブ作成。返り値 club_id / club_code / invite_code |
| `request_join_club(club_code, invite_code)` | ログインユーザー | 参加申請（pending）。エージェントのコードならその配下に付く。誤りは区別せず `invalid_club_or_code` |
| `approve_member(club, user, approve)` | オーナー（全申請）/ エージェント（自分のコード経由のみ） | 承認・却下 |
| `remove_member(club, user)` | オーナー / エージェント（自分の配下 player） | 除名。残高0・未着席・配下なしが条件 |
| `set_member_role(club, user, 'agent'/'player')` | オーナー | 昇格でエージェント用招待コードを発行。配下が残っていれば降格不可 |
| `set_member_agent(club, user, agent)` | オーナー | 配下の付け替え（null でオーナー直下） |
| `set_alias(club, user, alias)` | オーナー / エージェント（配下）/ 本人 | クラブ内の呼び名 |
| `rotate_invite_code(club)` | オーナー（クラブのコード）/ エージェント（自分のコード） | 招待コード再発行（旧コードは無効） |
| `update_club_settings(club, jsonb)` | オーナー | 許可キーのみ: name, description, fee_mode, fee_target, fee_rate_bp, fee_fixed, fee_cap, allow_negative, members_can_open_tables, default_rules |
| `set_club_status(club, status)` | プラットフォーマー | active / suspended / closed |
| `grant_diamonds(club, amount, memo)` | プラットフォーマー | 発行（負の値は調整。残高は負にならない） |
| `issue_points(club, amount, memo)` | オーナー | クラブ金庫へ発行（負で消却） |
| `transfer_points(club, to_user, amount, memo)` | オーナー（金庫⇔任意の active メンバー）/ エージェント（自分⇔自分の配下、自分の残高の範囲） | 正で配布・負で回収。出す側が着席中なら拒否 |
| `open_table(club, name, 3/4, 'east'/'south', rate, min_buyin, rules)` | オーナー・エージェント（設定で player も） | ダイヤを消費して卓を開設 |
| `join_table(table, seat?)` / `leave_table(table)` / `close_table(table)` | active メンバー / 本人（開始前）/ 開設者・オーナー（開始前） | 着席・離席・閉鎖（閉鎖でダイヤは戻らない） |
| `start_game(table, game_id)` | **service_role のみ** | 満席の卓で対局開始。Fee 設定をスナップショット。冪等 |
| `record_round(game, idx, result)` | **service_role のみ** | 局の結果を保存（同じ idx は無視） |
| `abort_game(game, reason)` | **service_role のみ** | 中止。ポイントは動かない |
| `settle_game(game, final_points[], rounds, kifu_path)` | **service_role のみ** | 精算（冪等）。下記 |
| `charge_club_maintenance(club)` | **service_role のみ** | 日次維持費。払えなければ suspended |
| `verify_ledgers(club)` | オーナー・プラットフォーマー・service_role | 台帳検証（0行なら正常） |
| `my_game_history(club?, limit, before)` / `my_balances()` | 本人 | 自分の戦績・残高 |
| `club_ranking(club, from, to)` | クラブの active メンバー | クラブ内ランキング |
| `agent_downline_summary(club, agent?, from, to)` | オーナー（任意のエージェント）/ エージェント（自分） | 配下ごとの残高・対局数・収支・Fee・受取/返却 |
| `club_fee_income(club, from, to)` | オーナー・プラットフォーマー | 日別 Fee 収入（JST） |

## ロールごとの閲覧範囲（SELECT）

| 対象 | プラットフォーマー | オーナー | エージェント | プレイヤー | 部外者 | anon |
|---|---|---|---|---|---|---|
| クラブ | 全部 | 自クラブ | 自クラブ | 自クラブ（申請中も可） | × | × |
| メンバー | 全部 | 全 status | active 全員＋自分の配下（pending 含む） | active 全員 | × | × |
| プロフィール | 全部 | 同クラブ active＋自クラブへの申請者 | 同クラブ active＋自分の配下の申請者 | 同クラブ active | 本人のみ | × |
| 招待コード | 全部 | 自クラブ全部 | 自分のコード | × | × | × |
| ポイント台帳・残高 | 全部 | 自クラブ全部（金庫含む） | 自分＋配下 | 自分 | × | × |
| ダイヤ台帳・残高 | 全部 | 自クラブ | × | × | × | × |
| 卓・着席・対局・順位 | 全部 | 自クラブ | 自クラブ | 自クラブ | × | × |
| 局ごとの結果 | 精算済のみ | 同左 | 同左 | 同左 | × | × |
| 監査ログ | 全部 | 自クラブ | × | × | × | × |

## 決めた設計（PPPoker 寄せ）

1. **クラブ金庫**: オーナーが発行したポイントは金庫（`account_id = club_id`）に入り、そこから配る。Fee も金庫に入る。これで「総量 = 発行 − 消却」が常に成り立ち、会員側の総量は配布・回収・Fee でしか動かない。
2. **エージェント**: 1段だけ（エージェントの上にエージェントは付かない）。自分の持ち点から配下に配り、回収する。オーナーは誰にでも直接配れる。
3. **招待**: クラブID＋招待コード。エージェントは自分の招待コードを持ち、そのコードで来た人は自動でその配下・承認もそのエージェントができる。
4. **卓 = 1対局**: 開設ごとにダイヤ消費。終局で `finished`。
5. **着席中は持ち点を動かせない**（配布/回収の出す側になれない）。対局中に点を逃がす抜け道を塞ぐ。
6. **精算の計算**（`settle_game`、対局サーバーが service_role で呼ぶ）:
   - 最終点（席順、各100点単位、合計 = 配給原点×人数でなければ拒否）から順位（同点は起家に近い席が上）。
   - スコア×10 = (最終点 − 返し) / 100 + ウマ×10 + （トップのみ）オカ×10。例 4人 25000持ち30000返し 40000点トップ → +45.0。
   - ポイント = スコア × 卓レート（スコア1.0あたり）。2位以下は切り捨て、トップが端数を吸収してゼロサム。
   - 貸し越し不可（既定）: 負けは残高で頭打ち、勝ちは比例で縮める（ゼロサム維持、端数は最上位の勝者）。貸し越し可なら負残高を許す。
   - Fee: `rate`×`winners` = 勝ち分×率／`fixed`×`winners` = 固定額（勝ち分まで）／`fixed`×`all` = 全員から固定額／`rate`×`all` = 最低持ち込み×率。`fee_cap` は1人1局の上限。貸し越し不可なら残高を超えて取らない。
   - Fee 設定と貸し越し可否は `start_game` 時点のスナップショットを使う（対局中の設定変更は効かない）。
   - 冪等: `games` 行をロックし、`settled` なら記帳せず前回結果を返す。台帳にも (game_id, 口座, 種別) の一意制約。
7. **既定ルール**: 4人 25000/30000・ウマ+15/+5/−5/−15、3人 35000/40000・ウマ+15/0/−15。クラブ既定は `default_rules` に `{"4": {...}, "3": {...}}` で人数別に入れる。DB が厳密に見るのは精算に使う start_points / return_points / uma だけ（他はエンジン側が検証）。

## ローカルでの流し方

`supabase start` は Docker が要る（この Mac には無い）ので、Homebrew の PostgreSQL 14 で検証した。

```bash
# 使い捨てクラスタ（例）
initdb -D /tmp/mjpg -U postgres --auth=trust
pg_ctl -D /tmp/mjpg -o "-p 54329 -k ''" -l /tmp/mjpg.log start
# 実行（DB mj_v2_test を作り直す。PGHOST がローカル以外なら拒否する）
PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres bash supabase/v2/tests/run_local.sh
```

`supabase start` が使える環境なら、migrations をローカルスタックに流し、`tests/10_harness.sql` と `tests/20_scenarios.sql` を `psql` で流せば同じ検証になる（`00_local_auth_stub.sql` は不要）。

## 本番適用の手順（**適用は山本さんの確認後。勝手にやらない**）

1. 新しい Supabase プロジェクトを用意する（旧スキーマと同居させない）。
2. `supabase link` → `supabase/v2/migrations/` を `supabase/migrations/` 相当として `supabase db push`（または `apply_migration` を順に）。**`tests/00_local_auth_stub.sql` は流さない。**
3. `platform_settings` の仮置き値を確定値に更新。
4. プラットフォーマーを SQL で付与: `insert into public.platform_admins (user_id, note) values ('<uuid>', '...');`
5. `get_advisors`（security / performance）を確認。SECURITY DEFINER 関数の警告は意図的（RPC 経由の書き込み）。
6. 対局サーバーには service_role キーをサーバー側の環境変数でのみ渡す。クライアントには anon キーだけ。
7. 日次ジョブ（pg_cron か対局サーバー）で `charge_club_maintenance` を呼ぶ（維持費が 0 の間は不要）。
8. 型生成: `npx supabase gen types typescript --linked`。

注意:
- Supabase は public に新しく作った表・関数へ `anon`/`authenticated` の既定権限を付ける。**今後マイグレーションを足すときは、その都度 revoke/grant を明示する**（0900 は作成済みのものにしか効かない）。
- 0900 の `revoke all on all functions/tables in schema public` は public の全オブジェクトに効く。v2 専用 DB で流すこと。

## 未決事項（要確認）

- `platform_settings` の値すべて（ダイヤ消費量・作成時付与・維持費・クラブ数上限・上限額・レート上限）。
- ダイヤを有償販売するか（するなら決済と法務。今は grant のみ）。
- 一般ユーザーがクラブを作れるか（既定 true）。
- 連戦卓（1卓で複数半荘）にするか。今は 1卓 = 1対局。
- オーナーの譲渡、エージェントの多段化（スーパーエージェント）、エージェントへの Fee 還元（リベート）。
- 供託の扱い: 終局時に残った供託は対局サーバー側でトップに加算してから送る前提（合計が原点×人数でないと拒否する）。「供託は消滅」ルールを採るなら引数を足す。
- 中止（abort）時の扱い: 今はポイントを動かさない。途中までの結果で精算するかは要確認。
- 申請のレート制限（招待コード総当たり対策）は DB では持たない。API 側（Edge Function / ゲートウェイ）で入れる。
- 退会したユーザー（auth.users 削除）は台帳の参照があるので消せない。アカウント削除の運用は要設計。
- 同時に2回 `settle_game` が来たケースは手動で1回確認済み（2セッション並列 → 片方 `already_settled=false`・もう片方 `true`、台帳は1回分のみ、チェーン正常）。自動テストには入れていない。

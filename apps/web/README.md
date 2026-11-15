# @mj/web — ロビー・クラブ・管理画面と API

対局画面（`/table/[id]`・`src/game`・`src/components/table`）は別担当。ここは「対局以外の全部」。

## 起動
```bash
bash tools/localdb/start.sh          # ローカルDB（54329）
cp apps/web/.env.example apps/web/.env.local
pnpm --dir apps/web dev              # http://localhost:3100
```
ログインは `tools/localdb/README.md` のアカウント。

## 構成
- ブラウザは DB に直接つながない。すべて `/api/...`（`src/app/api/[...path]/route.ts` → `src/server/routes/*`）。
- `src/server/db.ts`: 1リクエスト＝1トランザクション。`set local role authenticated` と `request.jwt.claims` を設定してから RPC/SELECT を実行（RLS と RPC の権限検査がそのまま効く）。内部API だけ `service_role`。SQL はすべてパラメータ化。
- 認証は差し替え式（`src/server/auth/provider.ts`）。`LocalAuthProvider`（ローカルDBの auth.users・scrypt。DB がローカルの時だけ動く）／`SupabaseAuthProvider`（`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` がある時。GoTrue の REST。**未検証**）。
- セッションは自前の JWT（HS256・`APP_JWT_SECRET`・30日）を httpOnly / SameSite=Lax の cookie `mj_session` に入れる。書き込みは Origin も確認。
- ログイン・参加申請・サインアップにはプロセス内のレート制限あり（複数台構成ではゲートウェイ側にも必要）。

## API（すべて `/api` 配下。エラーは `{ error, message }`）
| | |
|---|---|
| 認証 | `POST auth/signup` `POST auth/login` `POST auth/logout` `GET auth/me` `GET auth/ws-token` |
| プロフィール | `GET/PATCH profile` `GET history?clubId&limit&before` |
| クラブ | `GET/POST clubs` `POST clubs/join` `GET/PATCH clubs/:id` `POST clubs/:id/invite-code` |
| メンバー | `GET clubs/:id/members` `POST clubs/:id/members/:uid/approve` `PATCH/DELETE clubs/:id/members/:uid` |
| 卓 | `GET/POST clubs/:id/tables` `GET tables/:id` `POST tables/:id/join|leave|close` |
| ポイント | `GET clubs/:id/points?account=me|treasury|<uid>` `POST clubs/:id/points/issue` `POST clubs/:id/points/transfer` `GET clubs/:id/verify` |
| 集計 | `GET clubs/:id/ranking?period=today|7d|30d|all` `GET clubs/:id/income` |
| 運営 | `GET admin/overview` `POST admin/clubs/:id/diamonds` `POST admin/clubs/:id/status` `GET admin/clubs/:id/verify` `PATCH admin/settings` |
| 内部 | `POST internal/game-start` `POST internal/round` `POST internal/game-end`（`Authorization: Bearer {TABLE_SERVER_KEY}`） |

## 対局サーバーとの取り決め
- `GET /api/auth/ws-token` → `{ token, userId, name }`。HS256・`APP_JWT_SECRET`・12時間。payload は `{ sub, name, user_metadata:{display_name}, iat, exp }`。
- 着席で満席になった時に `POST {TABLE_SERVER_URL}/tables`（`{ id, rules, seats:[{userId,name}] }`、席順）。失敗しても着席は残り、卓一覧（着席者本人）・卓の詳細の取得時に再送する（4秒に1回まで）。`playing` になった卓へは再送しない。
- `rules` は `@mj/core` の `Rules`（`src/server/rules.ts` で DB のルールJSONから変換）。

### RPC と合わない点・こちらで決めたこと
- **game_id**: 内部APIに gameId が無いので `games.id = tables.id` とした（1卓＝1対局）。
- **startDealer**: DB に置き場所が無く保存していない。`settle_game` の同点時の順位は「席番号が小さい方が上」固定。起家が席0でない場合、同点の着順が対局サーバーとずれうる（`game-end` の応答 `rankMismatchSeats` に出す。DB が正）。
- **round**: `record_round` の result には `{ result, events }` をまとめて保存する。
- **game-end**: `settle_game` は合計が「配給原点×人数」でないと拒否する。残り供託が点数に入っていない場合に備え、不足が1000点単位（2万点以下）ならトップに足してから精算する（応答 `kyotakuAddedToTop`）。それ以外の不一致は 400。`standings` は順位の照合にだけ使い、ポイントは DB が計算する。
- game-start が届かないまま round / game-end が来た場合は、その場で `start_game` を呼ぶ（冪等）。
- 卓の `tables.rules` には DB 用（`start_points` 等）とエンジン用（camelCase）が同居する。画面から変えられるのは aka / kuitan / ippatsu / uraDora / tobi / extension / kiriageMangan / timeBase。

## 追加したマイグレーション
`supabase/v2/migrations/20261115001000_rpc_platform_settings.sql` — `set_platform_setting(key, value)`（プラットフォーマーのみ・型一致・監査ログ）。`tests/run_local.sh` は 212 件合格のまま。

## 未検証・未対応
- SupabaseAuthProvider、本番 Supabase（`set local role` が接続ユーザーで通るか）での動作。
- 実際の対局サーバーとの結合（模擬の受け口でのみ確認）。
- セッションの失効（サーバー側の無効化リスト）は無い。パスワード変更・再設定、メール確認も未実装。

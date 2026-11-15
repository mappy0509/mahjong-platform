import { isUuid } from '../db';
import { ApiError } from '../errors';
import { int, optStr, userRoute, uuid, uuidParam } from '../http';
import { requireActive } from './clubs';

// 残高と台帳。account: 省略=自分 / 'treasury'=クラブ金庫 / <userId>。見える範囲は RLS が決める
userRoute('GET', '/clubs/:id/points', async (db, user, ctx) => {
  const id = uuidParam(ctx, 'id');
  const me = await requireActive(db, id, user.id);
  const raw = ctx.url.searchParams.get('account');
  const account = !raw || raw === 'me' ? user.id : raw === 'treasury' ? id : isUuid(raw) ? raw : null;
  if (!account) throw new ApiError(400, 'bad_request');
  const before = Number(ctx.url.searchParams.get('before') ?? 0);
  const ledger = await db.rows(
    `select l.seq, l.kind, l.amount, l.balance_after, l.counterparty_id, l.game_id, l.memo, l.created_at,
            case when l.counterparty_id = l.club_id then 'クラブ金庫' else coalesce(m.alias, p.display_name) end as counterparty_name,
            coalesce(am.alias, ap.display_name) as actor_name
       from public.point_ledger l
       left join public.profiles p on p.id = l.counterparty_id
       left join public.club_members m on m.club_id = l.club_id and m.user_id = l.counterparty_id
       left join public.profiles ap on ap.id = l.actor_id
       left join public.club_members am on am.club_id = l.club_id and am.user_id = l.actor_id
      where l.club_id = $1 and l.account_id = $2 and ($3::bigint = 0 or l.seq < $3)
      order by l.seq desc limit 100`,
    [id, account, Number.isSafeInteger(before) && before > 0 ? before : 0],
  );
  const bal = await db.one<{ balance: number; treasury: number | null }>(
    `select coalesce((select balance from public.point_balances where club_id = $1 and account_id = $2), 0) as balance,
            (select balance from public.point_balances where club_id = $1 and account_id = $1) as treasury`,
    [id, user.id],
  );
  const accountBalance = await db.value<number | null>(
    'select balance from public.point_balances where club_id = $1 and account_id = $2', [id, account]);
  return { role: me.role, balance: bal!.balance, treasury: bal!.treasury, account: account === id ? 'treasury' : account, accountBalance, ledger };
});

// 発行（正）／消却（負）: オーナーのみ。クラブ金庫に出入りする
userRoute('POST', '/clubs/:id/points/issue', async (db, _u, ctx) => {
  const b = await ctx.body();
  const amount = int(b.amount, '数量', -1_000_000_000, 1_000_000_000);
  if (amount === 0) throw new ApiError(400, 'invalid_amount');
  const treasury = await db.value<number>('select public.issue_points($1, $2, $3)', [uuidParam(ctx, 'id'), amount, optStr(b.memo, 'メモ', 200)]);
  return { treasury };
});

// 配布（正）／回収（負）: オーナー＝金庫⇔メンバー、エージェント＝自分⇔配下
userRoute('POST', '/clubs/:id/points/transfer', async (db, _u, ctx) => {
  const b = await ctx.body();
  const amount = int(b.amount, '数量', -1_000_000_000, 1_000_000_000);
  if (amount === 0) throw new ApiError(400, 'invalid_amount');
  return db.value('select public.transfer_points($1, $2, $3, $4)', [
    uuidParam(ctx, 'id'), uuid(b.toUser, '相手'), amount, optStr(b.memo, 'メモ', 200),
  ]);
});

// 台帳の検証（オーナー・プラットフォーマー）。problems が空なら正常
userRoute('GET', '/clubs/:id/verify', async (db, _u, ctx) => {
  const problems = await db.rows('select * from public.verify_ledgers($1)', [uuidParam(ctx, 'id')]);
  return { ok: problems.length === 0, problems };
});

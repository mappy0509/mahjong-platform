import type { Db } from '../db';
import { ApiError } from '../errors';
import { int, str, userRoute, uuidParam } from '../http';
import { toDbRules } from '../rules';
import { ensureRemoteTable } from '../tableServer';
import { requireActive } from './clubs';

const TABLE_SQL = `
  select t.id, t.club_id, t.name, t.player_count, t.game_length, t.rate, t.min_buyin, t.rules, t.status,
         t.created_by, t.diamond_cost, t.created_at, t.started_at, t.finished_at,
         coalesce((select jsonb_agg(jsonb_build_object('seat', s.seat, 'userId', s.user_id,
                                                       'name', coalesce(m.alias, p.display_name, 'プレイヤー')) order by s.seat)
                     from public.table_seats s
                     left join public.profiles p on p.id = s.user_id
                     left join public.club_members m on m.club_id = t.club_id and m.user_id = s.user_id
                    where s.table_id = t.id), '[]'::jsonb) as seats
    from public.tables t`;

interface TableRow {
  id: string; club_id: string; status: string; player_count: number;
  seats: { seat: number; userId: string; name: string }[];
}

const isFullWaiting = (t: TableRow) => t.status === 'waiting' && t.seats.length === t.player_count;

// 卓の一覧（開始待ち・対局中＋直近24時間に終わった卓）。ロビーが数秒おきに呼ぶ
userRoute('GET', '/clubs/:id/tables', async (db, user, ctx) => {
  const id = uuidParam(ctx, 'id');
  await requireActive(db, id, user.id);
  const tables = await db.rows<TableRow>(
    `${TABLE_SQL}
      where t.club_id = $1 and (t.status in ('waiting', 'playing') or t.finished_at > now() - interval '24 hours')
      order by case t.status when 'waiting' then 0 when 'playing' then 1 else 2 end, t.created_at desc
      limit 80`,
    [id],
  );
  // 自分が座っている満席の卓が対局サーバーにまだ無ければ作らせる（前回の送信が失敗していた場合の再送）
  for (const t of tables) {
    if (isFullWaiting(t) && t.seats.some((s) => s.userId === user.id)) await ensureRemoteTable(db, t.id);
  }
  const balance = await db.value<number>(
    'select coalesce((select balance from public.point_balances where club_id = $1 and account_id = $2), 0)', [id, user.id]);
  return { tables, balance, now: new Date().toISOString() };
});

// 卓を開く（ダイヤ消費）。開設者は自動では着席しない
userRoute('POST', '/clubs/:id/tables', async (db, _u, ctx) => {
  const id = uuidParam(ctx, 'id');
  const b = await ctx.body();
  const name = str(b.name, '卓の名前', 1, 40);
  const players = b.players === 3 ? 3 : b.players === 4 ? 4 : null;
  if (!players) throw new ApiError(400, 'invalid_player_count');
  if (b.length !== 'east' && b.length !== 'south') throw new ApiError(400, 'invalid_game_length');
  const rate = int(b.rate, 'レート', 1, 1_000_000_000);
  const minBuyin = int(b.minBuyin ?? 0, '最低持ち込み', 0, 1_000_000_000);
  const tableId = await db.value<string>(
    'select public.open_table($1, $2, $3, $4, $5, $6, $7::jsonb)',
    [id, name, players, b.length, rate, minBuyin, JSON.stringify(toDbRules(b.rules))],
  );
  return { tableId };
});

async function loadTable(db: Db, tableId: string): Promise<TableRow> {
  const t = await db.one<TableRow>(`${TABLE_SQL} where t.id = $1`, [tableId]);
  if (!t) throw new ApiError(404, 'table_not_found'); // RLS で見えない卓も同じ扱い
  return t;
}

// 卓の詳細。満席なのに対局サーバーに未作成なら、ここで再送する
userRoute('GET', '/tables/:id', async (db, _u, ctx) => {
  const t = await loadTable(db, uuidParam(ctx, 'id'));
  const remote = isFullWaiting(t) ? await ensureRemoteTable(db, t.id) : 'skipped';
  const game = await db.one(
    `select g.id, g.status, g.fee_total, g.started_at, g.ended_at,
            (select jsonb_agg(jsonb_build_object('seat', p.seat, 'userId', p.user_id, 'finalPoints', p.final_points, 'rank', p.rank,
                                                 'score', p.score_x10 / 10.0, 'pointDelta', p.point_delta, 'fee', p.fee) order by p.seat)
               from public.game_players p where p.game_id = g.id) as players
       from public.games g where g.table_id = $1`,
    [t.id],
  );
  return { table: t, game, remote };
});

userRoute('POST', '/tables/:id/join', async (db, _u, ctx) => {
  const id = uuidParam(ctx, 'id');
  const b = await ctx.body();
  const seat = b.seat === undefined || b.seat === null ? null : int(b.seat, '席', 0, 3);
  const got = await db.value<number>('select public.join_table($1, $2)', [id, seat]);
  const t = await loadTable(db, id);
  // この着席で満席になったら対局サーバーに卓を作らせる。失敗しても着席は取り消さない（一覧・詳細の取得時に再送）
  const full = isFullWaiting(t);
  const remote = full ? await ensureRemoteTable(db, id, { force: true }) : 'skipped';
  return { seat: got, full, remote, table: t };
});

userRoute('POST', '/tables/:id/leave', async (db, _u, ctx) => {
  await db.value('select public.leave_table($1)', [uuidParam(ctx, 'id')]);
  return { ok: true };
});

userRoute('POST', '/tables/:id/close', async (db, _u, ctx) => {
  await db.value('select public.close_table($1)', [uuidParam(ctx, 'id')]);
  return { ok: true };
});

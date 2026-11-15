import { asService, isUuid, type Db } from '../db';
import { ApiError } from '../errors';
import { requireTableServer, route, type Ctx } from '../http';

/**
 * 対局サーバー → Web の内部API。Authorization: Bearer {TABLE_SERVER_KEY} を検証し、service_role で RPC を呼ぶ。
 * 1卓＝1対局なので games.id には tables.id をそのまま使う（対局サーバーは tableId だけ知っていればよい）。
 */
function tableId(b: Record<string, unknown>): string {
  if (!isUuid(b.tableId)) throw new ApiError(400, 'bad_request', 'tableId が正しくありません');
  return b.tableId;
}

/** games 行が無ければ（game-start の通知が届いていなかった場合）ここで開始扱いにする。冪等。 */
async function ensureGame(db: Db, table: string): Promise<string> {
  const id = await db.value<string | null>('select id from public.games where table_id = $1', [table]);
  if (id) return id;
  await db.value('select public.start_game($1, $1)', [table]);
  return table;
}

function internal(path: string, fn: (db: Db, body: Record<string, unknown>, ctx: Ctx) => Promise<unknown>) {
  route('POST', path, async (ctx) => {
    requireTableServer(ctx.req);
    const body = await ctx.body();
    return asService((db) => fn(db, body, ctx));
  });
}

// { tableId, seats: [userId...], startDealer }
internal('/internal/game-start', async (db, b) => {
  const table = tableId(b);
  if (Array.isArray(b.seats)) {
    const rows = await db.rows<{ user_id: string }>('select user_id from public.table_seats where table_id = $1 order by seat', [table]);
    const want = rows.map((r) => r.user_id);
    const got = (b.seats as unknown[]).map(String);
    if (want.length !== got.length || want.some((u, i) => u !== got[i])) throw new ApiError(409, 'seats_mismatch');
  }
  const r = await db.value<{ game_id: string; already_started: boolean }>('select public.start_game($1, $1)', [table]);
  return { gameId: r.game_id, alreadyStarted: r.already_started };
});

// { tableId, index, result, events }
internal('/internal/round', async (db, b) => {
  const table = tableId(b);
  const index = b.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 200) throw new ApiError(400, 'bad_request', 'index が正しくありません');
  const game = await ensureGame(db, table);
  const result = { result: b.result ?? null, events: Array.isArray(b.events) ? b.events : [] };
  const inserted = await db.value<boolean>('select public.record_round($1, $2, $3::jsonb)', [game, index, JSON.stringify(result)]);
  return { ok: true, inserted };
});

// { tableId, scores: number[]（席順の最終点）, standings: [{seat, rank, score, points}] }
internal('/internal/game-end', async (db, b) => {
  const table = tableId(b);
  if (!Array.isArray(b.scores) || b.scores.some((s) => typeof s !== 'number' || !Number.isInteger(s))) {
    throw new ApiError(400, 'bad_request', 'scores が正しくありません');
  }
  const scores = [...(b.scores as number[])];
  const game = await ensureGame(db, table);
  const g = await db.one<{ status: string; player_count: number; start_points: number }>(
    `select status, player_count, (rules_snapshot ->> 'start_points')::int as start_points from public.games where id = $1`,
    [game],
  );
  // 残った供託（リーチ棒）が点数に含まれていない場合は、取り決めどおりトップに足す（README）。settle_game は合計が合わないと拒否する
  let kyotaku = 0;
  if (g && g.status === 'playing' && scores.length === g.player_count) {
    const diff = g.start_points * g.player_count - scores.reduce((a, c) => a + c, 0);
    if (diff > 0 && diff % 1000 === 0 && diff <= 20000) {
      let top = 0;
      for (let i = 1; i < scores.length; i++) if (scores[i] > scores[top]) top = i;
      scores[top] += diff;
      kyotaku = diff;
    }
  }
  const r = await db.value<{ already_settled: boolean; players: { seat: number; rank: number }[] }>(
    'select public.settle_game($1, $2::int[], null, null)',
    [game, scores],
  );
  // 対局サーバーの順位と DB の順位が食い違っていないか（DB が正。食い違いは返すだけ）
  const mismatch: number[] = [];
  if (Array.isArray(b.standings)) {
    for (const s of b.standings as { seat?: number; rank?: number }[]) {
      const p = r.players?.find((x) => x.seat === s.seat);
      if (p && typeof s.rank === 'number' && p.rank !== s.rank) mismatch.push(p.seat);
    }
  }
  return { ...r, kyotakuAddedToTop: kyotaku, rankMismatchSeats: mismatch };
});

import 'server-only';
import type { Db } from './db';
import { env } from './env';
import { toCoreRules } from './rules';

interface TableRow {
  id: string;
  club_id: string;
  player_count: number;
  game_length: string;
  status: string;
  rules: Record<string, unknown>;
}

const g = globalThis as unknown as { __mjPushed?: Map<string, number> };
const pushed = (g.__mjPushed ??= new Map<string, number>());

/**
 * 満席で開始待ちの卓を対局サーバーに作らせる（POST /tables）。
 * 対局サーバー側が同じ id を無視するので何度呼んでもよい。失敗しても着席は取り消さない。
 * 戻り値: 'sent' | 'skipped'（満席でない・未設定・直前に送った）| 'failed'
 */
export async function ensureRemoteTable(db: Db, tableId: string, opts: { force?: boolean } = {}): Promise<'sent' | 'skipped' | 'failed'> {
  if (!env.tableServerUrl) return 'skipped';
  const t = await db.one<TableRow>(
    'select id, club_id, player_count, game_length, status, rules from public.tables where id = $1',
    [tableId],
  );
  if (!t || t.status !== 'waiting') return 'skipped';
  const seats = await db.rows<{ seat: number; user_id: string; name: string }>(
    `select s.seat, s.user_id, coalesce(m.alias, p.display_name, 'プレイヤー') as name
       from public.table_seats s
       left join public.profiles p on p.id = s.user_id
       left join public.club_members m on m.club_id = $2 and m.user_id = s.user_id
      where s.table_id = $1 order by s.seat`,
    [tableId, t.club_id],
  );
  if (seats.length !== t.player_count) return 'skipped';

  const last = pushed.get(tableId) ?? 0;
  if (!opts.force && Date.now() - last < 4000) return 'skipped';
  pushed.set(tableId, Date.now());
  if (pushed.size > 5000) for (const [k, v] of pushed) if (Date.now() - v > 3600_000) pushed.delete(k);

  try {
    const res = await fetch(`${env.tableServerUrl}/tables`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.tableServerKey}` },
      body: JSON.stringify({
        id: t.id,
        rules: toCoreRules(t),
        seats: seats.map((s) => ({ userId: s.user_id, name: s.name })),
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.error(`[table-server] POST /tables -> ${res.status}`);
      pushed.delete(tableId);
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    console.error(`[table-server] POST /tables failed: ${(e as Error).message}`);
    pushed.delete(tableId);
    return 'failed';
  }
}

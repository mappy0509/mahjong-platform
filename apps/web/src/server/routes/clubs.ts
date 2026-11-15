import type { Db } from '../db';
import { ApiError } from '../errors';
import { clientIp, dateParam, optStr, rateLimit, str, userRoute, uuid, uuidParam } from '../http';

interface Me { role: 'owner' | 'agent' | 'player'; status: string; agent_id: string | null; alias: string | null }

/** 自分の所属を取る。active でなければ 403（pending は呼び出し側で扱う）。 */
export async function myMembership(db: Db, clubId: string, userId: string): Promise<Me | null> {
  return db.one<Me>('select role, status, agent_id, alias from public.club_members where club_id = $1 and user_id = $2', [clubId, userId]);
}
export async function requireActive(db: Db, clubId: string, userId: string): Promise<Me> {
  const me = await myMembership(db, clubId, userId);
  if (me && me.status === 'active') return me;
  // プラットフォーマーは閲覧だけできる（RLS が全件を見せる。書き込みは RPC 側が拒否する）
  const admin = await db.value<boolean>('select exists (select 1 from public.platform_admins where user_id = $1)', [userId]);
  if (admin) return { role: 'player', status: 'active', agent_id: null, alias: null };
  throw new ApiError(403, 'forbidden');
}

// ホーム: 所属クラブ（残高つき）と申請中のクラブ
userRoute('GET', '/clubs', async (db, user) => {
  const clubs = await db.rows(
    `select b.club_id, b.club_code, b.club_name, b.role, b.balance, c.status,
            (select count(*)::int from public.tables t where t.club_id = b.club_id and t.status in ('waiting', 'playing')) as open_tables
       from public.my_balances() b join public.clubs c on c.id = b.club_id
      order by c.created_at`,
  );
  const pending = await db.rows(
    `select c.id as club_id, c.club_code, c.name as club_name, m.requested_at
       from public.club_members m join public.clubs c on c.id = m.club_id
      where m.user_id = $1 and m.status = 'pending' order by m.requested_at desc`,
    [user.id],
  );
  const seated = await db.one(
    `select t.id as table_id, t.club_id, t.name, t.status
       from public.table_seats s join public.tables t on t.id = s.table_id
      where s.user_id = $1 and t.status in ('waiting', 'playing') limit 1`,
    [user.id],
  );
  return { clubs, pending, seated };
});

userRoute('POST', '/clubs', async (db, _u, ctx) => {
  const b = await ctx.body();
  const name = str(b.name, 'クラブ名', 1, 40);
  const description = optStr(b.description, '紹介文', 500);
  return db.value('select public.create_club($1, $2)', [name, description]);
});

userRoute('POST', '/clubs/join', async (db, user, ctx) => {
  // 招待コードの総当たり対策
  rateLimit(`join:${user.id}`, 10, 10 * 60_000);
  rateLimit(`join:ip:${clientIp(ctx.req)}`, 40, 10 * 60_000);
  const b = await ctx.body();
  const code = str(b.clubCode, 'クラブID', 6, 8);
  if (!/^[0-9]+$/.test(code)) throw new ApiError(400, 'invalid_club_or_code');
  const invite = str(b.inviteCode, '招待コード', 6, 16).toUpperCase();
  if (!/^[A-Z0-9]+$/.test(invite)) throw new ApiError(400, 'invalid_club_or_code');
  const clubId = await db.value<string>('select public.request_join_club($1, $2)', [code, invite]);
  return { clubId, status: 'pending' };
});

// クラブの概要（ロビーの土台）
userRoute('GET', '/clubs/:id', async (db, user, ctx) => {
  const id = uuidParam(ctx, 'id');
  const me = await myMembership(db, id, user.id);
  const club = await db.one<Record<string, unknown>>(
    `select c.id, c.club_code, c.name, c.description, c.owner_id, c.status, c.fee_mode, c.fee_target, c.fee_rate_bp,
            c.fee_fixed, c.fee_cap, c.allow_negative, c.members_can_open_tables, c.created_at
       from public.clubs c where c.id = $1`,
    [id],
  );
  const isAdmin = await db.value<boolean>('select exists (select 1 from public.platform_admins where user_id = $1)', [user.id]);
  if (!club || (!isAdmin && (!me || !['active', 'pending'].includes(me.status)))) throw new ApiError(404, 'club_not_found');
  if (!me || me.status !== 'active') {
    if (!isAdmin) return { club: { id: club.id, club_code: club.club_code, name: club.name, status: club.status }, me: { status: me?.status ?? 'none' } };
  }
  const role = me?.status === 'active' ? me.role : null;
  const extra = await db.one<Record<string, unknown>>(
    `select
       (select count(*)::int from public.club_members m where m.club_id = $1 and m.status = 'active') as member_count,
       (select count(*)::int from public.club_members m where m.club_id = $1 and m.status = 'pending') as pending_count,
       coalesce((select balance from public.point_balances where club_id = $1 and account_id = $2), 0) as balance,
       (select balance from public.point_balances where club_id = $1 and account_id = $1) as treasury,
       (select balance from public.diamond_balances where club_id = $1) as diamonds,
       (select code from public.club_invite_codes where club_id = $1 and revoked_at is null
          and agent_id is not distinct from (case when $3 = 'agent' then $2::uuid else null end)) as invite_code,
       (select value from public.platform_settings where key = 'diamond_cost_table_open_4p') as cost_4p,
       (select value from public.platform_settings where key = 'diamond_cost_table_open_3p') as cost_3p,
       (select value from public.platform_settings where key = 'max_table_rate') as max_rate,
       (select p.display_name from public.profiles p where p.id = $4) as owner_name`,
    [id, user.id, role ?? '', club.owner_id],
  );
  return {
    club,
    me: {
      status: me?.status ?? 'none',
      role,
      alias: me?.alias ?? null,
      agentId: me?.agent_id ?? null,
      isAdmin,
      canOpenTable: role === 'owner' || role === 'agent' || (role === 'player' && club.members_can_open_tables === true),
    },
    ...extra,
  };
});

userRoute('PATCH', '/clubs/:id', async (db, _u, ctx) => {
  const id = uuidParam(ctx, 'id');
  const b = await ctx.body();
  // 許可するキーと型はここでも絞る（最終的な検査は RPC）
  const out: Record<string, unknown> = {};
  if (b.name !== undefined) out.name = str(b.name, 'クラブ名', 1, 40);
  if (b.description !== undefined) out.description = optStr(b.description, '紹介文', 500) ?? '';
  if (b.fee_mode !== undefined) out.fee_mode = b.fee_mode === 'fixed' ? 'fixed' : 'rate';
  if (b.fee_target !== undefined) out.fee_target = b.fee_target === 'all' ? 'all' : 'winners';
  for (const [k, max] of [['fee_rate_bp', 5000], ['fee_fixed', 1_000_000_000]] as const) {
    if (b[k] !== undefined) {
      if (typeof b[k] !== 'number' || !Number.isInteger(b[k]) || (b[k] as number) < 0 || (b[k] as number) > max) {
        throw new ApiError(400, 'bad_request', 'Fee の値が正しくありません');
      }
      out[k] = b[k];
    }
  }
  if (b.fee_cap !== undefined) {
    if (b.fee_cap !== null && (typeof b.fee_cap !== 'number' || !Number.isInteger(b.fee_cap) || b.fee_cap < 0 || b.fee_cap > 1_000_000_000)) {
      throw new ApiError(400, 'bad_request', 'Fee 上限の値が正しくありません');
    }
    out.fee_cap = b.fee_cap;
  }
  for (const k of ['allow_negative', 'members_can_open_tables']) {
    if (b[k] !== undefined) {
      if (typeof b[k] !== 'boolean') throw new ApiError(400, 'bad_request');
      out[k] = b[k];
    }
  }
  if (Object.keys(out).length === 0) throw new ApiError(400, 'bad_request', '変更する項目がありません');
  await db.value('select public.update_club_settings($1, $2::jsonb)', [id, JSON.stringify(out)]);
  return { ok: true };
});

userRoute('POST', '/clubs/:id/invite-code', async (db, _u, ctx) => {
  const code = await db.value<string>('select public.rotate_invite_code($1)', [uuidParam(ctx, 'id')]);
  return { inviteCode: code };
});

// メンバー一覧（見える範囲は RLS が決める: プレイヤーは active のみ、残高は自分と配下だけ）
userRoute('GET', '/clubs/:id/members', async (db, user, ctx) => {
  const id = uuidParam(ctx, 'id');
  await requireActive(db, id, user.id);
  const members = await db.rows(
    `select m.user_id, p.display_name, m.alias, m.role, m.status, m.agent_id, m.requested_at, m.approved_at, b.balance,
            (select i.code from public.club_invite_codes i
              where i.club_id = m.club_id and i.agent_id = m.user_id and i.revoked_at is null) as invite_code,
            exists (select 1 from public.table_seats s join public.tables t on t.id = s.table_id
                     where s.user_id = m.user_id and t.club_id = m.club_id and t.status in ('waiting', 'playing')) as seated
       from public.club_members m
       left join public.profiles p on p.id = m.user_id
       left join public.point_balances b on b.club_id = m.club_id and b.account_id = m.user_id
      where m.club_id = $1 and m.status in ('active', 'pending')
      order by (m.status = 'pending') desc, case m.role when 'owner' then 0 when 'agent' then 1 else 2 end, m.approved_at nulls last, m.requested_at`,
    [id],
  );
  return { members };
});

userRoute('POST', '/clubs/:id/members/:uid/approve', async (db, _u, ctx) => {
  const b = await ctx.body();
  await db.value('select public.approve_member($1, $2, $3)', [uuidParam(ctx, 'id'), uuidParam(ctx, 'uid'), b.approve !== false]);
  return { ok: true };
});

userRoute('DELETE', '/clubs/:id/members/:uid', async (db, _u, ctx) => {
  await db.value('select public.remove_member($1, $2)', [uuidParam(ctx, 'id'), uuidParam(ctx, 'uid')]);
  return { ok: true };
});

// ロール変更・エージェントの割当・エイリアス（指定された項目だけ。全部まとめて1トランザクション）
userRoute('PATCH', '/clubs/:id/members/:uid', async (db, _u, ctx) => {
  const id = uuidParam(ctx, 'id');
  const uid = uuidParam(ctx, 'uid');
  const b = await ctx.body();
  const out: Record<string, unknown> = {};
  if (b.role !== undefined) {
    if (b.role !== 'agent' && b.role !== 'player') throw new ApiError(400, 'invalid_role');
    out.role = await db.value('select public.set_member_role($1, $2, $3)', [id, uid, b.role]);
  }
  if (b.agentId !== undefined) {
    const agent = b.agentId === null ? null : uuid(b.agentId, 'エージェント');
    await db.value('select public.set_member_agent($1, $2, $3)', [id, uid, agent]);
  }
  if (b.alias !== undefined) {
    await db.value('select public.set_alias($1, $2, $3)', [id, uid, optStr(b.alias, '呼び名', 24) ?? '']);
  }
  if (b.role === undefined && b.agentId === undefined && b.alias === undefined) throw new ApiError(400, 'bad_request', '変更する項目がありません');
  return { ok: true, ...out };
});

// ランキング（period: all / 30d / 7d / today、または from/to）
userRoute('GET', '/clubs/:id/ranking', async (db, _u, ctx) => {
  const id = uuidParam(ctx, 'id');
  const period = ctx.url.searchParams.get('period') ?? 'all';
  let from = dateParam(ctx, 'from');
  const to = dateParam(ctx, 'to');
  if (!from) {
    const now = Date.now();
    if (period === '30d') from = new Date(now - 30 * 86400_000).toISOString();
    else if (period === '7d') from = new Date(now - 7 * 86400_000).toISOString();
    else if (period === 'today') {
      // JST の今日 0時
      const jst = new Date(now + 9 * 3600_000);
      from = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600_000).toISOString();
    }
  }
  const ranking = await db.rows('select * from public.club_ranking($1, $2, $3, 100)', [id, from, to]);
  return { ranking };
});

// 収支: オーナー＝Fee 収入・ダイヤ台帳・エージェント別の配下集計 ／ エージェント＝自分の配下集計
userRoute('GET', '/clubs/:id/income', async (db, user, ctx) => {
  const id = uuidParam(ctx, 'id');
  const me = await requireActive(db, id, user.id);
  if (me.role === 'player') throw new ApiError(403, 'forbidden');
  const from = dateParam(ctx, 'from');
  const to = dateParam(ctx, 'to');
  if (me.role === 'agent') {
    const downline = await db.rows('select * from public.agent_downline_summary($1, null, $2, $3)', [id, from, to]);
    return { role: 'agent', downline };
  }
  const fee = await db.rows('select * from public.club_fee_income($1, $2, $3)', [id, from, to]);
  const diamonds = await db.one(
    'select balance from public.diamond_balances where club_id = $1', [id]);
  const diamondLedger = await db.rows(
    `select l.seq, l.kind, l.amount, l.balance_after, l.memo, l.created_at, t.name as table_name
       from public.diamond_ledger l left join public.tables t on t.id = l.table_id
      where l.club_id = $1 order by l.seq desc limit 50`,
    [id],
  );
  const agents = await db.rows<{ user_id: string; display_name: string; alias: string | null; balance: number }>(
    `select m.user_id, p.display_name, m.alias, coalesce(b.balance, 0) as balance
       from public.club_members m join public.profiles p on p.id = m.user_id
       left join public.point_balances b on b.club_id = m.club_id and b.account_id = m.user_id
      where m.club_id = $1 and m.role = 'agent' and m.status = 'active' order by m.approved_at`,
    [id],
  );
  const byAgent = [];
  for (const a of agents) {
    const downline = await db.rows('select * from public.agent_downline_summary($1, $2, $3, $4)', [id, a.user_id, from, to]);
    byAgent.push({ ...a, downline });
  }
  const totals = await db.one(
    `select coalesce(sum(amount) filter (where kind = 'issue'), 0) as issued,
            coalesce(-sum(amount) filter (where kind = 'burn'), 0) as burned,
            coalesce(sum(amount) filter (where kind = 'fee'), 0) as fee_total
       from public.point_ledger where club_id = $1 and account_id = $1`,
    [id],
  );
  return { role: 'owner', fee, diamonds: diamonds ? (diamonds as { balance: number }).balance : 0, diamondLedger, agents: byAgent, totals };
});

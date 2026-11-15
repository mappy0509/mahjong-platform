import type { Db } from '../db';
import { ApiError } from '../errors';
import { int, optStr, str, userRoute, uuidParam } from '../http';

async function requireAdmin(db: Db, userId: string) {
  const ok = await db.value<boolean>('select exists (select 1 from public.platform_admins where user_id = $1)', [userId]);
  if (!ok) throw new ApiError(403, 'forbidden');
}

userRoute('GET', '/admin/overview', async (db, user) => {
  await requireAdmin(db, user.id);
  const clubs = await db.rows(
    `select c.id, c.club_code, c.name, c.status, c.created_at, c.owner_id, p.display_name as owner_name,
            coalesce(d.balance, 0) as diamonds,
            (select count(*)::int from public.club_members m where m.club_id = c.id and m.status = 'active') as members,
            (select count(*)::int from public.tables t where t.club_id = c.id and t.status in ('waiting', 'playing')) as open_tables,
            (select count(*)::int from public.games g where g.club_id = c.id and g.status = 'settled') as games,
            coalesce((select balance from public.point_balances b where b.club_id = c.id and b.account_id = c.id), 0) as treasury,
            coalesce((select sum(balance) from public.point_balances b where b.club_id = c.id), 0) as points_total
       from public.clubs c
       left join public.profiles p on p.id = c.owner_id
       left join public.diamond_balances d on d.club_id = c.id
      order by c.created_at desc limit 500`,
  );
  const settings = await db.rows('select key, value, description, updated_at from public.platform_settings order by key');
  const audit = await db.rows(
    `select a.id, a.action, a.actor_role, a.detail, a.created_at, c.name as club_name, p.display_name as actor_name
       from public.audit_log a
       left join public.clubs c on c.id = a.club_id
       left join public.profiles p on p.id = a.actor_id
      order by a.id desc limit 40`,
  );
  return { clubs, settings, audit };
});

userRoute('POST', '/admin/clubs/:id/diamonds', async (db, _u, ctx) => {
  const b = await ctx.body();
  const amount = int(b.amount, '数量', -1_000_000_000, 1_000_000_000);
  if (amount === 0) throw new ApiError(400, 'invalid_amount');
  const balance = await db.value<number>('select public.grant_diamonds($1, $2, $3)', [uuidParam(ctx, 'id'), amount, optStr(b.memo, 'メモ', 200)]);
  return { balance };
});

userRoute('POST', '/admin/clubs/:id/status', async (db, _u, ctx) => {
  const b = await ctx.body();
  if (!['active', 'suspended', 'closed'].includes(b.status as string)) throw new ApiError(400, 'bad_request');
  await db.value('select public.set_club_status($1, $2)', [uuidParam(ctx, 'id'), b.status]);
  return { ok: true };
});

userRoute('GET', '/admin/clubs/:id/verify', async (db, user, ctx) => {
  await requireAdmin(db, user.id);
  const problems = await db.rows('select * from public.verify_ledgers($1)', [uuidParam(ctx, 'id')]);
  return { ok: problems.length === 0, problems };
});

// 設定値の変更（migrations/20261115001000 の set_platform_setting。型は既存値と同じものだけ）
userRoute('PATCH', '/admin/settings', async (db, _u, ctx) => {
  const b = await ctx.body();
  const key = str(b.key, 'キー', 1, 64);
  if (typeof b.value !== 'number' && typeof b.value !== 'boolean') throw new ApiError(400, 'invalid_setting_type');
  await db.value('select public.set_platform_setting($1, $2::jsonb)', [key, JSON.stringify(b.value)]);
  return { ok: true };
});

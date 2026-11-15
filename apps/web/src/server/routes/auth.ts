import { authProvider } from '../auth/provider';
import { asUser } from '../db';
import { ApiError } from '../errors';
import { clientIp, int, rateLimit, route, str, userRoute, uuid, dateParam } from '../http';
import { clearSession, getSession, requireSession, setSession, signWsToken } from '../session';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function credentials(b: Record<string, unknown>) {
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!EMAIL.test(email) || email.length > 254) throw new ApiError(400, 'invalid_email');
  const password = typeof b.password === 'string' ? b.password : '';
  return { email, password };
}

route('POST', '/auth/signup', async (ctx) => {
  rateLimit(`signup:${clientIp(ctx.req)}`, 10, 10 * 60_000);
  const b = await ctx.body();
  const { email, password } = credentials(b);
  if (password.length < 8 || password.length > 200) throw new ApiError(400, 'weak_password');
  const displayName = typeof b.displayName === 'string' ? b.displayName.trim() : '';
  if (displayName.length < 1 || displayName.length > 24) throw new ApiError(400, 'invalid_display_name');
  const u = await authProvider().signUp(email, password, displayName);
  await setSession({ id: u.id, name: u.displayName });
  return { user: { id: u.id, name: u.displayName } };
});

route('POST', '/auth/login', async (ctx) => {
  const b = await ctx.body();
  const { email, password } = credentials(b);
  // 総当たり対策: IP ごと・メールごと
  rateLimit(`login:ip:${clientIp(ctx.req)}`, 30, 10 * 60_000);
  rateLimit(`login:mail:${email}`, 10, 10 * 60_000);
  if (!password || password.length > 200) throw new ApiError(401, 'invalid_credentials');
  const u = await authProvider().signIn(email, password);
  await setSession({ id: u.id, name: u.displayName });
  return { user: { id: u.id, name: u.displayName } };
});

route('POST', '/auth/logout', async () => {
  await clearSession();
  return { ok: true };
});

route('GET', '/auth/me', async () => {
  const s = await getSession();
  if (!s) return { user: null };
  const row = await asUser(s.id, (db) =>
    db.one<{ display_name: string; is_admin: boolean }>(
      `select p.display_name, exists (select 1 from public.platform_admins a where a.user_id = p.id) as is_admin
         from public.profiles p where p.id = $1`,
      [s.id],
    ),
  );
  if (!row) return { user: null };
  return { user: { id: s.id, name: row.display_name, isAdmin: row.is_admin } };
});

// 対局サーバー（WebSocket の hello）に渡す短命トークン
route('GET', '/auth/ws-token', async () => {
  const s = await requireSession();
  const name = await asUser(s.id, (db) => db.value<string | null>('select display_name from public.profiles where id = $1', [s.id]));
  const user = { id: s.id, name: name ?? s.name };
  return { token: signWsToken(user), userId: user.id, name: user.name };
});

userRoute('GET', '/profile', async (db, user) => {
  const p = await db.one(
    `select p.id, p.display_name, p.created_at,
            exists (select 1 from public.platform_admins a where a.user_id = p.id) as is_admin
       from public.profiles p where p.id = $1`,
    [user.id],
  );
  if (!p) throw new ApiError(404, 'profile_not_found');
  const stats = await db.one(
    `select count(*)::int as games, coalesce(sum(point_delta), 0) as total_delta, coalesce(sum(fee), 0) as total_fee,
            round(avg(rank), 2) as avg_rank, count(*) filter (where rank = 1)::int as tops
       from public.my_game_history(null, 200, null)`,
  );
  return { profile: p, stats };
});

userRoute('PATCH', '/profile', async (db, user, ctx) => {
  const b = await ctx.body();
  const name = str(b.displayName, '表示名', 1, 24);
  await db.value('select public.update_profile($1, null)', [name]);
  await setSession({ id: user.id, name });
  return { user: { id: user.id, name } };
});

// 自分の対局履歴（clubId で絞り込み可）
userRoute('GET', '/history', async (db, _u, ctx) => {
  const clubRaw = ctx.url.searchParams.get('clubId');
  const club = clubRaw ? uuid(clubRaw, 'クラブ') : null;
  const limit = int(Number(ctx.url.searchParams.get('limit') ?? 50), '件数', 1, 200);
  const games = await db.rows(
    `select h.*, c.name as club_name, t.name as table_name
       from public.my_game_history($1, $2, $3) h
       left join public.clubs c on c.id = h.club_id
       left join public.tables t on t.id = h.table_id
      order by h.ended_at desc`,
    [club, limit, dateParam(ctx, 'before')],
  );
  return { games };
});

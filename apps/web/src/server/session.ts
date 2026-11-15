import 'server-only';
import { cookies } from 'next/headers';
import { env } from './env';
import { ApiError } from './errors';
import { signJwt, verifyJwt } from './jwt';
import { isUuid } from './db';

export const SESSION_COOKIE = 'mj_session';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30日
const WS_TTL = 60 * 60 * 12; // 12時間

export interface SessionUser {
  id: string;
  name: string;
}

export async function setSession(user: SessionUser): Promise<void> {
  const token = signJwt({ sub: user.id, name: user.name }, env.jwtSecret, SESSION_TTL);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.production,
    path: '/',
    maxAge: SESSION_TTL,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const p = verifyJwt<{ name?: string }>(raw, env.jwtSecret);
  if (!p || !isUuid(p.sub)) return null;
  return { id: p.sub, name: typeof p.name === 'string' ? p.name : '' };
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new ApiError(401, 'not_authenticated');
  return s;
}

/** 対局サーバーに渡す短命トークン。セッションと同じ秘密鍵・同じ形（{sub, name, exp}）。 */
export function signWsToken(user: SessionUser): string {
  // user_metadata.display_name は Supabase 形式の JWT を読む実装との互換のために入れている
  return signJwt({ sub: user.id, name: user.name, user_metadata: { display_name: user.name } }, env.jwtSecret, WS_TTL);
}

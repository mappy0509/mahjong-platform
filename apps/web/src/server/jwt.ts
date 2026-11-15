import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** HS256 の JWT を作る。exp は秒。 */
export function signJwt(payload: Record<string, unknown>, secret: string, ttlSec: number): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyJwt<T extends Record<string, unknown>>(token: string, secret: string): (T & { sub: string; exp: number }) | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (header.alg !== 'HS256') return null;
    const want = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const got = Buffer.from(parts[2], 'base64url');
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

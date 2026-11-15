import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// 形式: scrypt$N$r$p$salt(base64)$hash(base64) — tools/localdb/seed.mjs と同じ
const N = 16384, R = 8, P = 1, KEYLEN = 32;

function derive(pw: string, salt: Buffer, n: number, r: number, p: number, len: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pw, salt, len, { N: n, r, p }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pw, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // ユーザーがいない場合も同じだけ時間を使う（存在の有無を応答時間で漏らさない）
    await derive(pw, Buffer.alloc(16), N, R, P, KEYLEN);
    return false;
  }
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (!(n >= 1024 && n <= 1 << 20) || !(r > 0 && r <= 32) || !(p > 0 && p <= 16)) return false;
  const want = Buffer.from(parts[5], 'base64');
  const got = await derive(pw, Buffer.from(parts[4], 'base64'), n, r, p, want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

import 'server-only';

/** サーバー専用の環境変数。ブラウザには出さない。 */
export const env = {
  get databaseUrl(): string {
    const v = process.env.DATABASE_URL;
    if (!v) throw new Error('DATABASE_URL が未設定です');
    return v;
  },
  get jwtSecret(): string {
    const v = process.env.APP_JWT_SECRET ?? '';
    if (v.length < 32) throw new Error('APP_JWT_SECRET は32文字以上で設定してください');
    return v;
  },
  get tableServerUrl(): string {
    return (process.env.TABLE_SERVER_URL ?? '').replace(/\/$/, '');
  },
  get tableServerKey(): string {
    return process.env.TABLE_SERVER_KEY ?? '';
  },
  get supabaseUrl(): string {
    return (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  },
  get supabaseServiceKey(): string {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  },
  get production(): boolean {
    return process.env.NODE_ENV === 'production';
  },
};

/** DATABASE_URL がこのマシン自身を指しているか（LocalAuthProvider の安全弁）。 */
export function databaseIsLocal(): boolean {
  try {
    const h = new URL(env.databaseUrl).hostname;
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

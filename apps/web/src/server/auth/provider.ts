import 'server-only';
import { asAdmin } from '../db';
import { databaseIsLocal, env } from '../env';
import { ApiError } from '../errors';
import { hashPassword, verifyPassword } from './password';

export interface AuthUser {
  id: string;
  displayName: string;
}

/** 認証の差し替え口。ログイン後のセッション（cookie の JWT）は呼び出し側が自前で発行する。 */
export interface AuthProvider {
  signUp(email: string, password: string, displayName: string): Promise<AuthUser>;
  signIn(email: string, password: string): Promise<AuthUser>;
}

/**
 * ローカル開発用。ローカルDBの auth.users（tools/localdb/sql/01_local_auth.sql で拡張）に
 * メールと scrypt のハッシュを持つ。本物の Supabase の auth.users を壊さないよう、DB がローカルの時だけ動く。
 */
export class LocalAuthProvider implements AuthProvider {
  private guard() {
    if (!databaseIsLocal() && process.env.ALLOW_LOCAL_AUTH !== '1') {
      throw new ApiError(500, 'auth_unavailable', 'LocalAuthProvider はローカルDB専用です');
    }
  }

  async signUp(email: string, password: string, displayName: string): Promise<AuthUser> {
    this.guard();
    const hash = await hashPassword(password);
    try {
      return await asAdmin(async (db) => {
        const row = await db.one<{ id: string }>(
          `insert into auth.users (email, encrypted_password, raw_user_meta_data)
           values ($1, $2, jsonb_build_object('display_name', $3::text)) returning id`,
          [email, hash, displayName],
        );
        return { id: row!.id, displayName };
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ApiError(409, 'email_taken');
      throw e;
    }
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    this.guard();
    const row = await asAdmin((db) =>
      db.one<{ id: string; encrypted_password: string | null; display_name: string | null }>(
        `select u.id, u.encrypted_password, p.display_name
           from auth.users u left join public.profiles p on p.id = u.id
          where lower(u.email) = $1`,
        [email],
      ),
    );
    const ok = await verifyPassword(password, row?.encrypted_password ?? null);
    if (!row || !ok) throw new ApiError(401, 'invalid_credentials');
    return { id: row.id, displayName: row.display_name ?? '' };
  }
}

/**
 * 本番用（Supabase Auth / GoTrue の REST）。SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY がある時に使う。
 * ※ 2026-11-15 時点で実環境では未検証。
 */
export class SupabaseAuthProvider implements AuthProvider {
  private async call(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    let res: Response;
    try {
      res = await fetch(`${env.supabaseUrl}/auth/v1${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.supabaseServiceKey,
          authorization: `Bearer ${env.supabaseServiceKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new ApiError(502, 'auth_unavailable');
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  }

  async signUp(email: string, password: string, displayName: string): Promise<AuthUser> {
    // 管理APIで作成（メール確認は済み扱い）。確認メールを使う運用にするなら /signup に替える
    const { status, json } = await this.call('/admin/users', {
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (status === 422 || status === 409) throw new ApiError(409, 'email_taken');
    if (status >= 400 || typeof json.id !== 'string') throw new ApiError(502, 'auth_unavailable');
    return { id: json.id, displayName };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { status, json } = await this.call('/token?grant_type=password', { email, password });
    if (status === 400 || status === 401) throw new ApiError(401, 'invalid_credentials');
    const user = json.user as { id?: string; user_metadata?: { display_name?: string } } | undefined;
    if (status >= 400 || !user || typeof user.id !== 'string') throw new ApiError(502, 'auth_unavailable');
    return { id: user.id, displayName: user.user_metadata?.display_name ?? '' };
  }
}

let cached: AuthProvider | null = null;
export function authProvider(): AuthProvider {
  if (!cached) cached = env.supabaseUrl && env.supabaseServiceKey ? new SupabaseAuthProvider() : new LocalAuthProvider();
  return cached;
}

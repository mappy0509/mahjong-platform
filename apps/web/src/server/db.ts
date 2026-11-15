import 'server-only';
import pg from 'pg';
import { env } from './env';

// bigint / numeric は JS の number で扱う（上限は platform_settings で 10^9 程度に抑えている）
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));
// date は文字列のまま返す（JS の Date にすると時差で日付がずれる）
pg.types.setTypeParser(1082, (v) => v);

const g = globalThis as unknown as { __mjPool?: pg.Pool };

function pool(): pg.Pool {
  if (!g.__mjPool) {
    g.__mjPool = new pg.Pool({ connectionString: env.databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
    g.__mjPool.on('error', (e) => console.error('[db] idle client error', e.message));
  }
  return g.__mjPool;
}

export interface Db {
  /** 行の配列を返す。SQL は必ずパラメータ化する。 */
  rows<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  /** 関数の戻り値（1列1行）を返す。 */
  value<T = unknown>(sql: string, params?: unknown[]): Promise<T>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

async function run<T>(role: 'authenticated' | 'service_role' | null, claims: object | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  const db: Db = {
    async rows(sql, params) {
      return (await c.query(sql, params as unknown[])).rows;
    },
    async one(sql, params) {
      return (await c.query(sql, params as unknown[])).rows[0] ?? null;
    },
    async value(sql, params) {
      const r = await c.query({ text: sql, values: params as unknown[], rowMode: 'array' });
      return r.rows[0]?.[0];
    },
  };
  try {
    await c.query('begin');
    if (role) {
      // ロール名は固定の2値だけ（外から来た文字列は入らない）
      await c.query(role === 'authenticated' ? 'set local role authenticated' : 'set local role service_role');
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    }
    const out = await fn(db);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** ログイン中のユーザーとして実行する（RLS と RPC の権限検査がそのまま効く）。1呼び出し＝1トランザクション。 */
export function asUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  if (!isUuid(userId)) throw new Error('invalid user id');
  return run('authenticated', { sub: userId, role: 'authenticated' }, fn);
}

/** service_role として実行する。内部API（対局サーバーからの通知）だけが使う。 */
export function asService<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return run('service_role', { role: 'service_role' }, fn);
}

/** 接続ユーザーのまま実行する。LocalAuthProvider（auth.users の読み書き）だけが使う。 */
export function asAdmin<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return run(null, null, fn);
}

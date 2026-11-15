import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { asUser, isUuid, type Db } from './db';
import { env } from './env';
import { ApiError, fromPgError, MESSAGES } from './errors';
import { requireSession, type SessionUser } from './session';

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  /** JSON の本文（オブジェクト以外は拒否）。 */
  body(): Promise<Record<string, unknown>>;
}

export type Handler = (ctx: Ctx) => Promise<unknown>;

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
}

const routes: Route[] = [];

/** 例: route('POST', '/clubs/:id/tables', handler) */
export function route(method: string, path: string, handler: Handler) {
  routes.push({ method, parts: path.split('/').filter(Boolean), handler });
}

/** ログイン必須のハンドラ。1リクエスト＝1トランザクションで、そのユーザーとして DB を触る。 */
export function userRoute(method: string, path: string, fn: (db: Db, user: SessionUser, ctx: Ctx) => Promise<unknown>) {
  route(method, path, async (ctx) => {
    const user = await requireSession();
    return asUser(user.id, (db) => fn(db, user, ctx));
  });
}

function match(method: string, segs: string[]): { route: Route; params: Record<string, string> } | 'method' | null {
  let pathHit = false;
  for (const r of routes) {
    if (r.parts.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const p = r.parts[i];
      if (p.startsWith(':')) params[p.slice(1)] = segs[i];
      else if (p !== segs[i]) { ok = false; break; }
    }
    if (!ok) continue;
    pathHit = true;
    if (r.method === method) return { route: r, params };
  }
  return pathHit ? 'method' : null;
}

function errorResponse(e: ApiError): Response {
  return Response.json({ error: e.code, message: e.message }, { status: e.status, headers: { 'cache-control': 'no-store' } });
}

/** ブラウザからの書き込みは同一オリジンだけ受ける（cookie は SameSite=Lax だが念のため二重に見る）。 */
function checkOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return; // サーバー間通信・curl
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    if (new URL(origin).host === host) return;
  } catch { /* fallthrough */ }
  throw new ApiError(403, 'bad_origin');
}

export async function dispatch(req: Request, segs: string[]): Promise<Response> {
  try {
    const m = match(req.method, segs);
    if (m === null) throw new ApiError(404, 'not_found');
    if (m === 'method') throw new ApiError(405, 'bad_request', 'このメソッドは使えません');
    if (req.method !== 'GET') checkOrigin(req);
    const ctx: Ctx = {
      req,
      url: new URL(req.url),
      params: m.params,
      async body() {
        const text = await req.text();
        if (text.length > 2_000_000) throw new ApiError(413, 'bad_request', 'データが大きすぎます');
        let v: unknown;
        try {
          v = text ? JSON.parse(text) : {};
        } catch {
          throw new ApiError(400, 'invalid_json');
        }
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ApiError(400, 'invalid_json');
        return v as Record<string, unknown>;
      },
    };
    const out = await m.route.handler(ctx);
    return Response.json(out ?? { ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    const pgErr = fromPgError(e);
    if (pgErr) return errorResponse(pgErr);
    console.error('[api]', req.method, new URL(req.url).pathname, e);
    return errorResponse(new ApiError(500, 'server_error', MESSAGES.server_error));
  }
}

// ---- 入力の取り出し（型と範囲をここで確かめる） ----
export function uuidParam(ctx: Ctx, name: string): string {
  const v = ctx.params[name];
  if (!isUuid(v)) throw new ApiError(404, 'not_found');
  return v;
}

export function str(v: unknown, field: string, min: number, max: number): string {
  if (typeof v !== 'string') throw new ApiError(400, 'bad_request', `${field}を入力してください`);
  const s = v.trim();
  if (s.length < min || s.length > max) {
    throw new ApiError(400, 'bad_request', min === max ? `${field}は${min}文字で入力してください` : `${field}は${min}〜${max}文字で入力してください`);
  }
  return s;
}

export function optStr(v: unknown, field: string, max: number): string | null {
  if (v === undefined || v === null || v === '') return null;
  return str(v, field, 0, max) || null;
}

export function int(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) {
    throw new ApiError(400, 'bad_request', `${field}は${min.toLocaleString()}〜${max.toLocaleString()}の整数で入力してください`);
  }
  return v;
}

export function uuid(v: unknown, field: string): string {
  if (!isUuid(v)) throw new ApiError(400, 'bad_request', `${field}の指定が正しくありません`);
  return v;
}

/** クエリの from/to（ISO 文字列）。不正なら無視。 */
export function dateParam(ctx: Ctx, name: string): string | null {
  const v = ctx.url.searchParams.get(name);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---- 対局サーバーからの内部API ----
export function requireTableServer(req: Request) {
  const key = env.tableServerKey;
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${key}`;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  if (!key || a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, 'not_authenticated', '共有鍵が正しくありません');
}

// ---- かんたんなレート制限（プロセス内。複数台構成ではゲートウェイ側でも制限すること） ----
const gl = globalThis as unknown as { __mjRate?: Map<string, number[]> };
const hits = (gl.__mjRate ??= new Map<string, number[]>());
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new ApiError(429, 'rate_limited');
  list.push(now);
  hits.set(key, list);
  if (hits.size > 20000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
}

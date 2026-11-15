import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { normalizeRules, type ClientMsg, type Rules, type ServerMsg } from '@mj/core';
import { Table, type Conn, type TableHooks } from './table.ts';

/**
 * 対局サーバーの入口（Node 常駐）。
 *  - WS  /ws                最初のメッセージは hello{tableId, token|name}
 *  - POST /tables           卓を作る（Web のサーバー側から共有鍵つきで呼ぶ。開発モードでは鍵なしで可）
 *  - GET  /health
 * 認証: SUPABASE_JWT_SECRET があれば Supabase の JWT(HS256) を検証する。無ければ開発モード（guest:<id>）。
 */

// 開発の便宜: 環境変数が無ければ、Web 側の .env.local から共有の値を読む
try {
  const envFile = new URL('../../web/.env.local', import.meta.url);
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^(APP_JWT_SECRET|TABLE_SERVER_KEY)=(.+)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
  if (!process.env.WEB_INTERNAL_URL && process.env.TABLE_SERVER_KEY) process.env.WEB_INTERNAL_URL = 'http://127.0.0.1:3100';
} catch { /* 無ければ開発モード（ゲストのみ） */ }

const PORT = Number(process.env.PORT ?? 8787);
const JWT_SECRET = process.env.APP_JWT_SECRET ?? process.env.SUPABASE_JWT_SECRET ?? '';
const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL ?? '';
const SERVER_KEY = process.env.TABLE_SERVER_KEY ?? '';
const DEV = !JWT_SECRET;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? '*';

interface Entry {
  table: Table;
  autoFill: boolean;
  /** CPU練習卓（ゲストで入れる・保存しない） */
  practice: boolean;
  createdAt: number;
}

const tables = new Map<string, Entry>();

/** Web の内部APIへ結果を送る（保存・精算は Web 側がDBのRPCで行う）。失敗したら数回やり直す。 */
async function postInternal(path: string, body: unknown) {
  if (!WEB_INTERNAL_URL) return;
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(`${WEB_INTERNAL_URL}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVER_KEY}` },
        body: JSON.stringify(body),
      });
      if (r.ok) return;
      console.log(`internal ${path} -> ${r.status} ${await r.text().catch(() => '')}`);
      if (r.status >= 400 && r.status < 500) return;
    } catch (e) {
      console.log(`internal ${path} failed: ${e}`);
    }
    await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
  }
}

const clubHooks: TableHooks = {
  onGameStart: (t) => postInternal('/api/internal/game-start', {
    tableId: t.id, seats: t.seats.map((s) => s.userId), startDealer: t.game!.s.startDealer,
  }),
  onRoundEnd: (t, result, events) => postInternal('/api/internal/round', {
    tableId: t.id, index: t.game!.s.handsPlayed - 1, result, events,
  }),
  onGameEnd: (t, summary) => postInternal('/api/internal/game-end', {
    tableId: t.id, scores: summary.scores, standings: summary.standings,
  }),
};

const cryptoRand = () => randomInt(0, 0x100000000) / 0x100000000;

export function createTable(rules: Rules, opts: { id?: string; autoFill?: boolean; practice?: boolean; fixedDealer?: boolean } = {}): Table {
  const id = opts.id ?? randomBytes(6).toString('hex');
  const table = new Table(id, rules, {
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
    rand: cryptoRand,
    hooks: opts.practice ? undefined : clubHooks,
    log: (m) => console.log(m),
  }, { fixedDealer: opts.fixedDealer });
  tables.set(id, { table, autoFill: !!opts.autoFill, practice: !!opts.practice, createdAt: Date.now() });
  return table;
}

function b64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Supabase の JWT(HS256) を検証して sub と表示名を返す。 */
export function verifyJwt(token: string, secret: string): { sub: string; name?: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(b64url(parts[0]).toString());
    if (header.alg !== 'HS256') return null;
    const sig = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const got = b64url(parts[2]);
    if (sig.length !== got.length || !timingSafeEqual(sig, got)) return null;
    const payload = JSON.parse(b64url(parts[1]).toString());
    if (typeof payload.sub !== 'string') return null;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;
    return { sub: payload.sub, name: payload.name ?? payload.user_metadata?.display_name };
  } catch {
    return null;
  }
}

function identify(msg: Extract<ClientMsg, { type: 'hello' }>, practice: boolean): { userId: string; name: string } | null {
  const token = msg.token ?? '';
  if (JWT_SECRET && token.includes('.')) {
    const v = verifyJwt(token, JWT_SECRET);
    if (v) return { userId: v.sub, name: (v.name ?? msg.name ?? 'プレイヤー').slice(0, 16) };
  }
  // ゲストは練習卓だけ（開発モードではどの卓でも可）
  if (!practice && !DEV) return null;
  const m = /^guest:([A-Za-z0-9_-]{6,64})$/.exec(token);
  if (!m) return null;
  return { userId: `guest:${m[1]}`, name: (msg.name ?? 'ゲスト').slice(0, 16) || 'ゲスト' };
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new Error('too large');
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
}

const http = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/health') return json(res, 200, { ok: true, tables: tables.size, dev: DEV });
    if (url.pathname === '/practice' && req.method === 'POST') {
      // CPU練習卓: 誰でも作れる。作りすぎを防ぐ
      if (tables.size > 2000) return json(res, 503, { error: 'busy' });
      const body = await readBody(req);
      const rules = normalizeRules({ players: body.players === 3 ? 3 : 4, length: body.length === 'east' ? 'east' : 'south' });
      const t = createTable(rules, { autoFill: true, practice: true });
      return json(res, 200, { id: t.id });
    }
    if (url.pathname === '/tables' && req.method === 'POST') {
      if (!SERVER_KEY || req.headers.authorization !== `Bearer ${SERVER_KEY}`) {
        if (!DEV) return json(res, 401, { error: 'unauthorized' });
      }
      const body = await readBody(req);
      const id = typeof body.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.id) ? body.id : undefined;
      const existing = id ? tables.get(id) : undefined;
      if (existing) return json(res, 200, { id, existing: true });
      const rules = normalizeRules(body.rules);
      const t = createTable(rules, { id, autoFill: !!body.autoFill, fixedDealer: Array.isArray(body.seats) });
      if (Array.isArray(body.seats)) {
        // クラブ卓: 席は Web 側（DB）で確定済み。その順に座らせる
        body.seats.slice(0, rules.players).forEach((s: any, i: number) => {
          if (s && typeof s.userId === 'string') t.sit(s.userId, String(s.name ?? 'プレイヤー').slice(0, 16), i);
        });
        // 来ない人がいても 45 秒で始める（来ない席は自動でツモ切り）
        setTimeout(() => t.forceStart(), 45000).unref();
      }
      return json(res, 200, { id: t.id });
    }
    const m = /^\/tables\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (m && req.method === 'GET') {
      const e = tables.get(m[1]);
      if (!e) return json(res, 404, { error: 'not found' });
      return json(res, 200, e.table.info());
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 400, { error: String(e) });
  }
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  let table: Table | null = null;
  let entry: Entry | null = null;
  let userId = '';
  const conn: Conn = {
    send(msg: ServerMsg) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  let count = 0;
  let windowStart = Date.now();
  ws.on('message', (raw) => {
    // 連打対策: 1秒に30通まで
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > 30) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (!table) {
      if (msg.type !== 'hello') return;
      const e = tables.get(msg.tableId);
      if (!e) { conn.send({ type: 'error', code: 'no_table', message: '卓が見つかりません' }); ws.close(); return; }
      const who = identify(msg, e.practice);
      if (!who) { conn.send({ type: 'error', code: 'auth', message: '認証に失敗しました' }); ws.close(); return; }
      entry = e;
      table = e.table;
      userId = who.userId;
      // 練習卓は来た順に座る。クラブ卓は Web 側で着席済みの人だけが席を持つ（それ以外は観戦）。
      if (e.practice) table.sit(userId, who.name);
      table.connect(userId, conn);
      return;
    }
    table.onMessage(userId, msg, conn);
    if (msg.type === 'ready' && entry?.autoFill) table.fillBots();
  });
  ws.on('close', () => {
    if (table) table.disconnect(userId, conn);
  });
});

// 終わった卓・放置された卓の掃除
setInterval(() => {
  const now = Date.now();
  for (const [id, e] of tables) {
    const idle = e.table.seats.every((s) => s.conns.size === 0);
    const old = now - e.createdAt > 6 * 3600 * 1000;
    if ((e.table.state === 'finished' && idle) || (e.table.state === 'waiting' && idle && now - e.createdAt > 600 * 1000) || old) {
      e.table.dispose();
      tables.delete(id);
    }
  }
}, 60 * 1000).unref();

if (process.env.NO_LISTEN !== '1') {
  http.listen(PORT, () => console.log(`table-server listening on :${PORT} (${DEV ? 'dev mode' : 'auth mode'})`));
}

export { http, tables };

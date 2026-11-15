// API の通し確認。Web（既定 http://127.0.0.1:3111）とローカルDB（seed 済み）が動いている前提。
//   BASE=http://127.0.0.1:3111 MOCK_PORT=8799 TABLE_SERVER_KEY=dev-only-table-server-key node tools/localdb/smoke.mjs
// Web 側は TABLE_SERVER_URL=http://127.0.0.1:8799 で起動しておく（この中で対局サーバーの受け口を模擬する）。
import { createServer } from 'node:http';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3111';
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 8799);
const KEY = process.env.TABLE_SERVER_KEY ?? 'dev-only-table-server-key';
const DEV_PASSWORD = 'mahjong-dev-1234';

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

// ---- 対局サーバーの模擬（POST /tables を受けて本文を覚える） ----
const received = [];
let mockFail = false;
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/tables') {
      if (mockFail) { res.writeHead(500); res.end('{}'); return; }
      received.push({ auth: req.headers.authorization, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: JSON.parse(body).id }));
    } else { res.writeHead(404); res.end('{}'); }
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

// ---- cookie を持つ簡易クライアント ----
function client() {
  let cookie = '';
  return async (method, path, body, headers = {}) => {
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith('mj_session=')) cookie = c.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null), setCookie: set.join('\n') };
  };
}
const internal = (path, body, key = KEY) =>
  fetch(`${BASE}/api/internal${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

const stamp = Date.now().toString(36);
const mail = (n) => `smoke-${stamp}-${n}@example.test`;

try {
  console.log('認証');
  const anon = client();
  ok((await anon('GET', '/auth/ws-token')).status === 401, '未ログインの ws-token は 401');
  ok((await anon('GET', '/clubs')).status === 401, '未ログインの /clubs は 401');
  ok((await anon('POST', '/auth/signup', { email: 'x', password: 'abcdefgh', displayName: 'a' })).status === 400, '不正なメールは 400');
  ok((await anon('POST', '/auth/signup', { email: mail('w'), password: 'short', displayName: 'a' })).status === 400, '短いパスワードは 400');

  const owner = client();
  let r = await owner('POST', '/auth/signup', { email: mail('owner'), password: 'smoke-pass-1', displayName: '試験オーナー' });
  ok(r.status === 200 && r.json.user?.id, 'サインアップ', JSON.stringify(r.json));
  ok(/HttpOnly/i.test(r.setCookie) && /SameSite=lax/i.test(r.setCookie), 'cookie は HttpOnly・SameSite=Lax', r.setCookie);
  const ownerId = r.json.user.id;
  ok((await anon('POST', '/auth/signup', { email: mail('owner'), password: 'smoke-pass-1', displayName: 'x' })).status === 409, '同じメールは 409');
  ok((await client()('POST', '/auth/login', { email: mail('owner'), password: 'wrong-pass' })).status === 401, '誤ったパスワードは 401');
  const owner2 = client();
  ok((await owner2('POST', '/auth/login', { email: mail('owner'), password: 'smoke-pass-1' })).status === 200, 'ログイン');
  r = await owner('GET', '/auth/ws-token');
  const payload = JSON.parse(Buffer.from(r.json.token.split('.')[1], 'base64url').toString());
  ok(r.status === 200 && r.json.userId === ownerId && payload.sub === ownerId && payload.name === '試験オーナー' && payload.exp - payload.iat === 43200, 'ws-token（sub/name/12時間）', JSON.stringify(payload));
  r = await owner('POST', '/clubs', { name: 'x' }, { origin: 'https://evil.example' });
  ok(r.status === 403 && r.json.error === 'bad_origin', '別オリジンからの書き込みは 403');
  r = await fetch(`${BASE}/api/clubs`, { headers: { cookie: 'mj_session=aaa.bbb.ccc' } });
  ok(r.status === 401, '偽の cookie は 401');

  console.log('クラブ');
  r = await owner('POST', '/clubs', { name: `試験倶楽部${stamp}`, description: 'smoke' });
  ok(r.status === 200 && r.json.club_id && /^\d{7}$/.test(r.json.club_code), 'クラブ作成', JSON.stringify(r.json));
  const { club_id: club, club_code: code, invite_code: invite } = r.json;

  const players = [];
  for (let i = 1; i <= 3; i++) {
    const c = client();
    const s = await c('POST', '/auth/signup', { email: mail(`p${i}`), password: 'smoke-pass-1', displayName: `試験P${i}` });
    players.push({ c, id: s.json.user.id });
  }
  const outsider = client();
  await outsider('POST', '/auth/signup', { email: mail('out'), password: 'smoke-pass-1', displayName: '部外者' });

  r = await players[0].c('POST', '/clubs/join', { clubCode: code, inviteCode: 'ZZZZZZZZ' });
  ok(r.status === 404 && r.json.error === 'invalid_club_or_code', '誤った招待コードは 404');
  for (const p of players) r = await p.c('POST', '/clubs/join', { clubCode: code, inviteCode: invite });
  ok(r.status === 200 && r.json.status === 'pending', '参加申請 → 承認待ち');
  ok((await players[0].c('GET', `/clubs/${club}/tables`)).status === 403, '承認前は卓一覧 403');
  ok((await players[0].c('POST', `/clubs/${club}/members/${players[1].id}/approve`, { approve: true })).status === 403, 'プレイヤーは承認できない（403）');
  for (const p of players) r = await owner('POST', `/clubs/${club}/members/${p.id}/approve`, { approve: true });
  ok(r.status === 200, 'オーナーが承認');
  r = await owner('GET', `/clubs/${club}/members`);
  ok(r.json.members.filter((m) => m.status === 'active').length === 4, 'メンバー4人');
  ok((await outsider('GET', `/clubs/${club}`)).status === 404, '部外者にはクラブが見えない（404）');
  ok((await outsider('GET', `/clubs/${club}/members`)).status === 403, '部外者はメンバー一覧 403');
  ok((await outsider('GET', `/clubs/${club}/points?account=treasury`)).status === 403, '部外者は台帳 403');

  console.log('ダイヤ・ポイント');
  const plat = client();
  ok((await plat('POST', '/auth/login', { email: 'platform@example.test', password: DEV_PASSWORD })).status === 200, 'プラットフォーマーでログイン');
  ok((await owner('POST', `/admin/clubs/${club}/diamonds`, { amount: 10 })).status === 403, 'オーナーはダイヤを付与できない（403）');
  ok((await owner('GET', '/admin/overview')).status === 403, 'オーナーは管理画面API 403');
  r = await plat('POST', `/admin/clubs/${club}/diamonds`, { amount: 5, memo: 'smoke' });
  ok(r.status === 200 && r.json.balance === 5, 'ダイヤ付与 → 5', JSON.stringify(r.json));
  r = await plat('GET', '/admin/overview');
  ok(r.status === 200 && r.json.clubs.some((c) => c.id === club && c.diamonds === 5) && r.json.settings.length >= 9, '管理: 一覧と設定');
  ok((await owner('PATCH', '/admin/settings', { key: 'max_clubs_per_owner', value: 9 })).status === 403, 'オーナーは設定変更できない（403）');
  ok((await plat('PATCH', '/admin/settings', { key: 'max_clubs_per_owner', value: true })).status === 400, '設定の型違いは 400');
  ok((await plat('PATCH', '/admin/settings', { key: 'max_clubs_per_owner', value: 3 })).status === 200, '設定変更（同値）');

  ok((await players[0].c('POST', `/clubs/${club}/points/issue`, { amount: 1000 })).status === 403, 'プレイヤーは発行できない（403）');
  ok((await players[0].c('POST', `/clubs/${club}/points/transfer`, { toUser: players[1].id, amount: 100 })).status === 403, 'プレイヤーは配布できない（403）');
  r = await owner('POST', `/clubs/${club}/points/issue`, { amount: 100000, memo: 'smoke' });
  ok(r.status === 200 && r.json.treasury === 100000, '発行 → 金庫 100,000');
  for (const uid of [ownerId, ...players.map((p) => p.id)]) r = await owner('POST', `/clubs/${club}/points/transfer`, { toUser: uid, amount: 20000 });
  ok(r.status === 200 && r.json.from_balance === 20000, '配布 ×4 → 金庫 20,000', JSON.stringify(r.json));
  r = await owner('POST', `/clubs/${club}/points/transfer`, { toUser: players[0].id, amount: 999999 });
  ok(r.status === 400, '金庫を超える配布は 400', JSON.stringify(r.json));
  r = await players[0].c('GET', `/clubs/${club}/points`);
  ok(r.json.balance === 20000 && r.json.treasury === null && r.json.ledger.length === 1, 'プレイヤーの残高と台帳（金庫は見えない）');
  r = await players[0].c('GET', `/clubs/${club}/points?account=treasury`);
  ok(r.status === 200 && r.json.ledger.length === 0, 'プレイヤーが金庫の台帳を指定しても0行（RLS）');

  console.log('卓');
  ok((await players[0].c('POST', `/clubs/${club}/tables`, { name: 'x', players: 4, length: 'east', rate: 100 })).status === 403, 'プレイヤーは卓を開けない（403）');
  r = await owner('POST', `/clubs/${club}/tables`, { name: '試験卓', players: 4, length: 'east', rate: 100, minBuyin: 1000, rules: { aka: true, kuitan: false, timeBase: 10, evil: 1 } });
  ok(r.status === 200 && r.json.tableId, '卓を開く', JSON.stringify(r.json));
  const table = r.json.tableId;
  r = await owner('GET', `/clubs/${club}`);
  ok(r.json.diamonds === 4, 'ダイヤ 5 → 4');
  ok((await outsider('GET', `/tables/${table}`)).status === 404, '部外者には卓が見えない（404）');
  ok((await outsider('POST', `/tables/${table}/join`, {})).status === 404, '部外者は着席できない');

  r = await owner('POST', `/tables/${table}/join`, { seat: 0 });
  ok(r.status === 200 && r.json.seat === 0 && r.json.full === false, 'オーナー着席（席0）');
  ok(received.length === 0, '1人目では対局サーバーへ送らない');
  ok((await owner('POST', `/clubs/${club}/points/transfer`, { toUser: ownerId, amount: -100 })).status === 400, '着席中は回収できない');
  r = await players[0].c('POST', `/tables/${table}/join`, { seat: 0 });
  ok(r.status === 400 && r.json.error === 'seat_taken', '埋まった席は 400');
  await players[0].c('POST', `/tables/${table}/join`, {});
  await players[1].c('POST', `/tables/${table}/join`, {});
  ok((await players[1].c('POST', `/tables/${table}/leave`, {})).status === 200, '離席');
  await players[1].c('POST', `/tables/${table}/join`, { seat: 2 });
  mockFail = true;
  r = await players[2].c('POST', `/tables/${table}/join`, {});
  ok(r.status === 200 && r.json.full === true && r.json.remote === 'failed', '4人目: 満席。対局サーバーが落ちていても着席は成功', JSON.stringify({ full: r.json.full, remote: r.json.remote }));
  mockFail = false;
  r = await players[2].c('GET', `/tables/${table}`);
  ok(r.status === 200 && r.json.remote === 'sent' && received.length === 1, '卓の詳細を見ると再送される');
  const sent = received[0];
  ok(sent?.auth === `Bearer ${KEY}`, '再送に共有鍵が付く');
  ok(sent?.body.id === table && sent.body.seats.length === 4 && sent.body.seats[0].userId === ownerId && sent.body.seats[0].name === '試験オーナー', 'POST /tables の本文（id・席順・名前）', JSON.stringify(sent?.body.seats));
  const rules = sent?.body.rules ?? {};
  ok(rules.players === 4 && rules.length === 'east' && rules.startPoints === 25000 && rules.returnPoints === 30000 && rules.kuitan === false && rules.aka === true && rules.timeBase === 10 && rules.evil === undefined && Array.isArray(rules.uma) && rules.uma.length === 4, 'ルールJSONは core の Rules 形式', JSON.stringify(rules));

  console.log('内部API・精算');
  const seatsInOrder = [ownerId, players[0].id, players[1].id, players[2].id];
  ok((await internal('/game-start', { tableId: table, seats: seatsInOrder, startDealer: 0 }, 'wrong')).status === 401, '共有鍵が違うと 401');
  ok((await internal('/game-start', { tableId: table, seats: seatsInOrder, startDealer: 0 }, '')).status === 401, '共有鍵なしは 401');
  ok((await owner('POST', '/internal/game-end', { tableId: table, scores: [100000, 0, 0, 0] })).status === 401, 'ログイン中のユーザーでも内部APIは 401');
  ok((await internal('/game-start', { tableId: table, seats: [...seatsInOrder].reverse(), startDealer: 0 })).status === 409, '席順が違うと 409');
  r = await internal('/game-start', { tableId: table, seats: seatsInOrder, startDealer: 0 });
  ok(r.status === 200 && r.json.alreadyStarted === false, 'game-start', JSON.stringify(r.json));
  r = await internal('/game-start', { tableId: table, seats: seatsInOrder, startDealer: 0 });
  ok(r.status === 200 && r.json.alreadyStarted === true, 'game-start 2回目は冪等');
  r = await owner('GET', `/tables/${table}`);
  ok(r.json.table.status === 'playing' && r.json.game?.status === 'playing', '卓が playing になる');
  ok((await players[0].c('POST', `/tables/${table}/leave`, {})).status === 400, '対局中は離席できない');
  r = await internal('/round', { tableId: table, index: 0, result: { type: 'ron', winner: 0 }, events: [{ t: 'x' }] });
  ok(r.status === 200 && r.json.inserted === true, 'round を記録');
  r = await internal('/round', { tableId: table, index: 0, result: { type: 'ron' }, events: [] });
  ok(r.status === 200 && r.json.inserted === false, '同じ round は無視');
  r = await internal('/game-end', { tableId: table, scores: [40000, 30000, 20000, 9900], standings: [] });
  ok(r.status === 400, '合計が合わない精算は 400', JSON.stringify(r.json));

  const standings = [{ seat: 0, rank: 1 }, { seat: 1, rank: 2 }, { seat: 2, rank: 3 }, { seat: 3, rank: 4 }];
  r = await internal('/game-end', { tableId: table, scores: [40000, 30000, 20000, 10000], standings });
  const ps = r.json?.players ?? [];
  // 25000持ち30000返し ウマ15/5/-5/-15 → +45.0 / +5.0 / -15.0 / -35.0、レート100 → +4500 / +500 / -1500 / -3500
  ok(r.status === 200 && r.json.already_settled === false, 'game-end → 精算', JSON.stringify(r.json));
  ok(JSON.stringify(ps.map((p) => p.point_delta)) === '[4500,500,-1500,-3500]', 'ポイント増減 +4500/+500/-1500/-3500', JSON.stringify(ps.map((p) => p.point_delta)));
  ok(JSON.stringify(ps.map((p) => p.fee)) === '[225,25,0,0]' && r.json.fee_total === 250, 'Fee（勝ち分の5%）225/25', JSON.stringify(ps.map((p) => p.fee)));
  ok(r.json.rankMismatchSeats.length === 0, '順位は対局サーバーと一致');
  r = await internal('/game-end', { tableId: table, scores: [40000, 30000, 20000, 10000], standings });
  ok(r.status === 200 && r.json.already_settled === true, '2回目の game-end は already_settled');
  r = await internal('/game-end', { tableId: table, scores: [10000, 20000, 30000, 40000], standings: [] });
  ok(r.status === 200 && r.json.already_settled === true && r.json.players[0].point_delta === 4500, '点数を変えて送り直しても結果は変わらない');

  r = await owner('GET', `/clubs/${club}/points`);
  ok(r.json.balance === 20000 + 4500 - 225 && r.json.treasury === 20000 + 250, 'オーナー残高 24,275・金庫 20,250（二重精算なし）', JSON.stringify({ b: r.json.balance, t: r.json.treasury }));
  r = await players[2].c('GET', `/clubs/${club}/points`);
  ok(r.json.balance === 16500, '4着の残高 16,500');
  r = await players[2].c('GET', `/history?clubId=${club}`);
  ok(r.json.games.length === 1 && r.json.games[0].rank === 4 && r.json.games[0].point_delta === -3500, '戦績に反映');
  r = await players[0].c('GET', `/clubs/${club}/ranking?period=today`);
  ok(r.json.ranking.length === 4 && r.json.ranking[0].user_id === ownerId, 'ランキングに反映');
  r = await owner('GET', `/clubs/${club}/income`);
  ok(r.json.role === 'owner' && r.json.totals.fee_total === 250 && r.json.fee[0].fee_total === 250, '収支（Fee 収入 250）', JSON.stringify(r.json.totals));
  ok((await players[0].c('GET', `/clubs/${club}/income`)).status === 403, 'プレイヤーは収支 403');
  r = await owner('GET', `/clubs/${club}/verify`);
  ok(r.status === 200 && r.json.ok === true, '台帳の検証 OK', JSON.stringify(r.json));
  ok((await players[0].c('GET', `/clubs/${club}/verify`)).status === 403, 'プレイヤーは台帳検証 403');
  r = await owner('GET', `/clubs/${club}/tables`);
  ok(r.json.tables.find((t) => t.id === table)?.status === 'finished', '卓は finished');

  console.log('メンバー管理・設定');
  r = await owner('PATCH', `/clubs/${club}/members/${players[0].id}`, { role: 'agent' });
  ok(r.status === 200 && r.json.role?.invite_code, 'エージェントに昇格（招待コード発行）');
  ok((await owner('PATCH', `/clubs/${club}/members/${players[1].id}`, { agentId: players[0].id, alias: 'みなみ' })).status === 200, '配下の付け替え＋呼び名');
  r = await players[0].c('POST', `/clubs/${club}/points/transfer`, { toUser: players[1].id, amount: 500 });
  ok(r.status === 200, 'エージェントが配下へ配布');
  ok((await players[0].c('POST', `/clubs/${club}/points/transfer`, { toUser: players[2].id, amount: 500 })).status === 403, 'エージェントは配下以外へ配布できない（403）');
  r = await players[0].c('GET', `/clubs/${club}/income`);
  ok(r.json.role === 'agent' && r.json.downline.length === 1 && r.json.downline[0].received === 20500, 'エージェントの配下集計', JSON.stringify(r.json.downline));
  ok((await players[1].c('PATCH', `/clubs/${club}`, { fee_rate_bp: 0 })).status === 403, 'プレイヤーは設定変更できない（403）');
  ok((await owner('PATCH', `/clubs/${club}`, { fee_mode: 'fixed', fee_target: 'all', fee_fixed: 100, fee_cap: null })).status === 200, 'Fee 設定の変更');
  r = await owner('POST', `/clubs/${club}/invite-code`, {});
  ok(r.status === 200 && r.json.inviteCode !== invite, '招待コード再発行');
  ok((await outsider('POST', '/clubs/join', { clubCode: code, inviteCode: invite })).status === 404, '旧コードは使えない');
  ok((await owner('DELETE', `/clubs/${club}/members/${players[2].id}`)).status === 400, '残高ありの除名は 400');
  r = await owner('PATCH', '/profile', { displayName: '改名オーナー' });
  ok(r.status === 200 && (await owner('GET', '/auth/me')).json.user.name === '改名オーナー', '表示名の変更');
  ok((await owner('POST', '/auth/logout', {})).status === 200 && (await owner('GET', '/clubs')).status === 401, 'ログアウト');
} catch (e) {
  fail++;
  console.log('  例外:', e);
} finally {
  mock.close();
}
console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);

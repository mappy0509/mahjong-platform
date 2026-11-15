import { Round, defaultRules, tilesFromString, allTiles, type Rules, type Action, type Tile } from '../src/index.ts';

export interface Setup {
  hands: string[];
  /** ツモ順の牌（'' は任意の牌） */
  draws?: string[];
  /** 嶺上牌（引く順） */
  rinshan?: string;
  dora?: string;
  ura?: string;
  dealer?: number;
  rules?: Rules;
  honba?: number;
  kyotaku?: number;
  scores?: number[];
}

/** 配牌・ツモ順・王牌を指定して局を作る。 */
export function mk(o: Setup): Round {
  const rules = o.rules ?? defaultRules(o.hands.length as 3 | 4);
  const n = rules.players;
  const all = allTiles(n);
  const N = all.length;
  const wall = new Array<Tile>(N).fill(-1);
  const used = new Set<Tile>();
  o.hands.forEach((h, i) => {
    const t = tilesFromString(h, used);
    if (t.length !== 13) throw new Error(`hand ${i} has ${t.length} tiles`);
    t.forEach((x, j) => (wall[i * 13 + j] = x));
  });
  (o.draws ?? []).forEach((d, i) => {
    if (d) wall[13 * n + i] = tilesFromString(d, used)[0];
  });
  if (o.rinshan) tilesFromString(o.rinshan, used).forEach((t, i) => (wall[N - 1 - i] = t));
  if (o.dora) tilesFromString(o.dora, used).forEach((t, i) => (wall[N - 5 - 2 * i] = t));
  if (o.ura) tilesFromString(o.ura, used).forEach((t, i) => (wall[N - 6 - 2 * i] = t));
  const rest = all.filter((t) => !used.has(t));
  let r = 0;
  for (let i = 0; i < N; i++) if (wall[i] === -1) wall[i] = rest[r++];
  return new Round({
    rules, dealer: o.dealer ?? 0, roundWind: 0, kyoku: 0, honba: o.honba ?? 0, kyotaku: o.kyotaku ?? 0,
    scores: o.scores ?? new Array(n).fill(rules.startPoints), wall,
  });
}

export function ok(round: Round, seat: number, a: Action) {
  const r = round.act(seat, a);
  if (!r.ok) throw new Error(`seat ${seat} ${JSON.stringify(a)} rejected: ${r.error}`);
  return r.events;
}

/** 手の内から、表記に合う牌を1枚探す */
export function find(round: Round, seat: number, s: string): Tile {
  const p = round.s.players[seat];
  const want = tilesFromString(s)[0] >> 2;
  const aka = s[0] === '0';
  const tiles = p.drawn === null ? p.hand : [...p.hand, p.drawn];
  const t = tiles.find((x) => x >> 2 === want && (!aka || x % 4 === 0));
  if (t === undefined) throw new Error(`seat ${seat} has no ${s}`);
  return t;
}

export function discard(round: Round, seat: number, s: string, riichi = false) {
  return ok(round, seat, { type: 'discard', tile: find(round, seat, s), riichi });
}

/** ツモ切り */
export function tsumogiri(round: Round, seat: number) {
  return ok(round, seat, { type: 'discard', tile: round.s.players[seat].drawn! });
}

/** 受付待ちの全員がパスする */
export function passAll(round: Round) {
  while (round.s.phase === 'claim') {
    const a = round.actors();
    ok(round, a[0], { type: 'pass' });
  }
}

/** 全員ツモ切り・全パスで局の最後まで進める */
export function runOut(round: Round) {
  let guard = 0;
  while (round.s.phase !== 'end') {
    if (++guard > 1000) throw new Error('stuck');
    if (round.s.phase === 'claim') passAll(round);
    else tsumogiri(round, round.s.turn);
  }
}

export const yakuIds = (round: Round, i = 0): string[] => {
  const e = round.events.find((x) => x.t === 'agari');
  if (!e || e.t !== 'agari') throw new Error('no agari');
  return e.wins[i].result.yaku.map((y) => y.id);
};

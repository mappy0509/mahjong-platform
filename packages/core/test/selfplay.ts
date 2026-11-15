import { Game, botAction, defaultRules, seededRandom, allTiles, type Round, type RoundEvent } from '../src/index.ts';

export interface Stats { [k: string]: number }

export function checkInvariants(round: Round, startTotal: number) {
  const s = round.s;
  const seen = new Set<number>();
  const add = (t: number, where: string) => {
    if (seen.has(t)) throw new Error(`duplicate tile ${t} at ${where}`);
    seen.add(t);
  };
  s.players.forEach((p, i) => {
    p.hand.forEach((t) => add(t, `hand${i}`));
    if (p.drawn !== null) add(p.drawn, `drawn${i}`);
    p.melds.forEach((m) => m.tiles.forEach((t) => add(t, `meld${i}`)));
    p.river.forEach((r) => { if (r.calledBy === undefined) add(r.tile, `river${i}`); });
    p.nuki.forEach((t) => add(t, `nuki${i}`));
    const concealed = p.hand.length + (p.drawn !== null ? 1 : 0);
    const expect = 13 - 3 * p.melds.length;
    if (s.phase !== 'end' && concealed !== expect && concealed !== expect + 1) throw new Error(`seat ${i} has ${concealed} tiles with ${p.melds.length} melds`);
  });
  const total = allTiles(s.rules.players).length;
  // 山に残っている牌（ツモ山 + 王牌の未使用分）
  const inWall = total - seen.size;
  if (inWall < 0) throw new Error('too many tiles');
  const sum = s.scores.reduce((a, b) => a + b, 0) + s.kyotaku * 1000;
  if (sum !== startTotal) throw new Error(`score sum ${sum} != ${startTotal}`);
}

export function playGame(seed: number, players: 3 | 4, stats: Stats, length: 'east' | 'south' = 'south') {
  const rules = defaultRules(players, length);
  const rand = seededRandom(seed);
  const game = new Game(rules, 0);
  const startTotal = rules.startPoints * players;
  let guardRounds = 0;
  for (;;) {
    if (++guardRounds > 60) throw new Error('too many rounds');
    const round = game.startRound(rand);
    let steps = 0;
    while (round.s.phase !== 'end') {
      if (++steps > 2000) throw new Error('round does not end');
      const actors = round.actors();
      if (actors.length === 0) throw new Error('no actor but round not over');
      const seat = actors[Math.floor(rand() * actors.length)];
      const a = botAction(round, seat);
      if (!a) throw new Error('bot has no action');
      const r = round.act(seat, a);
      if (!r.ok) throw new Error(`bot action rejected: ${r.error} ${JSON.stringify(a)}`);
      checkInvariants(round, startTotal);
    }
    tally(round.events, round, stats);
    stats.rounds = (stats.rounds ?? 0) + 1;
    if (game.finishRound()) break;
  }
  stats.games = (stats.games ?? 0) + 1;
  const sum = game.summary();
  const pts = sum.standings.reduce((a, b) => a + b.points, 0);
  if (Math.abs(pts) > 0.11) throw new Error(`final points do not sum to 0: ${pts}`);
  return game;
}

function inc(stats: Stats, k: string, n = 1) { stats[k] = (stats[k] ?? 0) + n; }

function tally(events: RoundEvent[], round: Round, stats: Stats) {
  for (const e of events) {
    if (e.t === 'agari') {
      inc(stats, e.wins.length > 1 ? 'multiRon' : 'agari');
      for (const w of e.wins) {
        inc(stats, w.from === null ? 'tsumo' : 'ron');
        if (w.melds.some((m) => m.type !== 'ankan')) inc(stats, 'openWin');
        for (const y of w.result.yaku) inc(stats, `yaku:${y.id}`);
        if (w.result.yakuman) inc(stats, 'yakuman');
      }
    } else if (e.t === 'ryuukyoku') {
      inc(stats, `draw:${e.reason}`);
      if (e.nagashi.length) inc(stats, 'nagashi');
    } else if (e.t === 'call') inc(stats, `call:${e.meld.type}`);
    else if (e.t === 'kan') inc(stats, `kan:${e.kanType}`);
    else if (e.t === 'nuki') inc(stats, 'nuki');
    else if (e.t === 'riichi') inc(stats, e.double ? 'doubleRiichiDecl' : 'riichiDecl');
  }
  void round;
}

if (process.argv[1]?.endsWith('selfplay.ts')) {
  const n = Number(process.argv[2] ?? 200);
  const players = (Number(process.argv[3] ?? 4) as 3 | 4);
  const stats: Stats = {};
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    try { playGame(1000 + i, players, stats); }
    catch (e) { console.error('seed', 1000 + i, e); process.exit(1); }
  }
  console.log(`${n} games ${players}p in ${Date.now() - t0}ms`);
  console.log(Object.entries(stats).sort().map(([k, v]) => `${k}=${v}`).join('  '));
}

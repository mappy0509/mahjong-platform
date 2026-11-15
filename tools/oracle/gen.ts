/**
 * 点数計算の検算用: ランダムな和了手を作り、@mj/core の結果と一緒に JSON に書き出す。
 * 使い方: npx tsx tools/oracle/gen.ts <件数> <seed> > cases.json
 */
import { evaluateWin, calcPayments, type Meld, type WinInput } from '../../packages/core/src/score.ts';
import { defaultRules } from '../../packages/core/src/rules.ts';
import { YAOCHU_KINDS } from '../../packages/core/src/tiles.ts';

let seed = Number(process.argv[3] ?? 1);
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const ri = (n: number) => Math.floor(rnd() * n);
const N = Number(process.argv[2] ?? 1000);
const rules = defaultRules(4);

type SetSpec = { kind: number; chi: boolean };

function pickKindPool(): number[] {
  const mode = ri(10);
  const all = Array.from({ length: 34 }, (_, i) => i);
  if (mode <= 3) return all;
  if (mode === 4) return all.filter((k) => k >= 27); // 字牌
  if (mode === 5) return all.filter((k) => k >= 27 || k % 9 === 0 || k % 9 === 8 || k % 9 === 1 || k % 9 === 6 || k % 9 === 7); // 端寄り
  if (mode === 6) { const s = ri(3) * 9; return all.filter((k) => k >= s && k < s + 9); } // 清一色
  if (mode === 7) { const s = ri(3) * 9; return all.filter((k) => (k >= s && k < s + 9) || k >= 27); } // 混一色
  if (mode === 8) return all.filter((k) => k < 27 && k % 9 >= 1 && k % 9 <= 7); // 断幺
  return [19, 20, 21, 23, 25, 32, 31, 33, 27, 28, 29, 30]; // 緑・三元・風
}

function genCase(): any | null {
  const cnt = new Array(34).fill(0);
  const pool = pickKindPool();
  const form = ri(40);
  let concealedKinds: number[] = [];
  const melds: { type: Meld['type']; kinds: number[] }[] = [];

  if (form === 0) {
    // 国士
    concealedKinds = [...YAOCHU_KINDS, YAOCHU_KINDS[ri(13)]];
  } else if (form <= 3) {
    // 七対子
    const ks = [...pool].sort(() => rnd() - 0.5).slice(0, 7);
    if (ks.length < 7) return null;
    for (const k of ks) concealedKinds.push(k, k);
  } else {
    const sets: SetSpec[] = [];
    const ponBias = rnd();
    // 順子系の役（三色・一通・純チャン・九蓮・清老頭）が出やすい雛形を先に入れる
    const tpl = ri(12);
    const pre = (k: number, chi: boolean) => { if (chi) { cnt[k]++; cnt[k + 1]++; cnt[k + 2]++; } else cnt[k] += 3; sets.push({ kind: k, chi }); };
    if (tpl === 0) { const n = ri(7); pre(n, true); pre(9 + n, true); pre(18 + n, true); }
    else if (tpl === 1) { const s9 = ri(3) * 9; pre(s9, true); pre(s9 + 3, true); pre(s9 + 6, true); }
    else if (tpl === 2) { for (let i = 0; i < 3; i++) { const s9 = ri(3) * 9; const k = s9 + (rnd() < 0.5 ? 0 : 6); if (cnt[k] < 4 && cnt[k + 1] < 4 && cnt[k + 2] < 4) pre(k, true); } pool.length = 0; pool.push(0, 8, 9, 17, 18, 26); }
    else if (tpl === 3) { pool.length = 0; pool.push(0, 8, 9, 17, 18, 26); }
    else if (tpl === 4) { const s9 = ri(3) * 9; pre(s9, false); pre(s9 + 8, false); pre(s9 + 1, true); pre(s9 + 4, true); pool.length = 0; for (let i = 0; i < 9; i++) pool.push(s9 + i); }
    else if (tpl === 5) { const n = ri(9); pre(n, false); pre(9 + n, false); pre(18 + n, false); }
    for (let i = sets.length; i < 4; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const k = pool[ri(pool.length)];
        const chi = k < 27 && k % 9 <= 6 && rnd() > ponBias && pool.includes(k + 1) && pool.includes(k + 2);
        if (chi) {
          if (cnt[k] < 4 && cnt[k + 1] < 4 && cnt[k + 2] < 4) { cnt[k]++; cnt[k + 1]++; cnt[k + 2]++; sets.push({ kind: k, chi }); break; }
        } else if (cnt[k] <= 1) { cnt[k] += 3; sets.push({ kind: k, chi }); break; }
      }
    }
    if (sets.length < 4) return null;
    let pair = -1;
    for (let tries = 0; tries < 30; tries++) {
      const k = pool[ri(pool.length)];
      if (cnt[k] <= 2) { cnt[k] += 2; pair = k; break; }
    }
    if (pair < 0) return null;
    const openRate = rnd() < 0.45 ? 0 : rnd() * 0.6;
    concealedKinds.push(pair, pair);
    for (const s of sets) {
      const open = rnd() < openRate;
      if (s.chi) {
        if (open) melds.push({ type: 'chi', kinds: [s.kind, s.kind + 1, s.kind + 2] });
        else concealedKinds.push(s.kind, s.kind + 1, s.kind + 2);
      } else {
        const r = rnd();
        if (cnt[s.kind] === 3 && r < 0.12) { cnt[s.kind]++; melds.push({ type: 'ankan', kinds: [s.kind, s.kind, s.kind, s.kind] }); }
        else if (open && cnt[s.kind] === 3 && r < 0.3) { cnt[s.kind]++; melds.push({ type: rnd() < 0.5 ? 'minkan' : 'kakan', kinds: [s.kind, s.kind, s.kind, s.kind] }); }
        else if (open) melds.push({ type: 'pon', kinds: [s.kind, s.kind, s.kind] });
        else concealedKinds.push(s.kind, s.kind, s.kind);
      }
    }
  }

  // 具体的な牌 id を割り当てる
  const used = new Set<number>();
  const take = (k: number): number => {
    const order = [0, 1, 2, 3].sort(() => rnd() - 0.5);
    for (const i of order) { const t = k * 4 + i; if (!used.has(t)) { used.add(t); return t; } }
    throw new Error('exhausted');
  };
  let hand: number[], meldObjs: Meld[];
  try {
    hand = concealedKinds.map(take);
    meldObjs = melds.map((m) => {
      const tiles = m.kinds.map(take);
      const o: Meld = { type: m.type, tiles };
      if (m.type !== 'ankan') { o.called = tiles[0]; o.from = 1; }
      return o;
    });
  } catch { return null; }
  const winTile = hand[ri(hand.length)];
  const menzen = meldObjs.every((m) => m.type === 'ankan');
  const tsumo = rnd() < 0.4;
  const riichi = (menzen && rnd() < 0.5 ? (rnd() < 0.1 ? 2 : 1) : 0) as 0 | 1 | 2;
  const hasKan = meldObjs.some((m) => m.type !== 'chi' && m.type !== 'pon');
  const rinshan = tsumo && hasKan && rnd() < 0.3;
  const chankan = !tsumo && rnd() < 0.05;
  const lastTile = !rinshan && !chankan && rnd() < 0.05;
  const seatWind = 27 + ri(4);
  const roundWind = 27 + ri(2);
  const first = meldObjs.length === 0 && tsumo && !riichi && !lastTile && rnd() < 0.03;
  const freeTile = (): number => { for (;;) { const t = ri(136); if (!used.has(t)) { used.add(t); return t; } } };
  const nd = 1 + (hasKan ? ri(3) : 0);
  const doraIndicators = Array.from({ length: nd }, freeTile);
  const uraIndicators = Array.from({ length: nd }, freeTile);

  const inp: WinInput = {
    hand, melds: meldObjs, winTile, tsumo, riichi,
    ippatsu: riichi > 0 && rnd() < 0.3,
    rinshan, chankan, lastTile,
    tenhou: first && seatWind === 27,
    chiihou: first && seatWind !== 27,
    seatWind, roundWind, doraIndicators, uraIndicators, nuki: 0, rules,
  };
  const res = evaluateWin(inp);
  const dealer = seatWind === 27;
  let pay: any = null;
  if (res) {
    const winner = 0;
    const dealerSeat = dealer ? 0 : 1;
    const d = calcPayments({ base: res.base, n: 4, winner, dealer: dealerSeat, loser: tsumo ? null : 2, honba: 0, rules });
    pay = tsumo ? { main: -d[dealer ? 1 : dealerSeat], additional: dealer ? -d[1] : -d[2] === 0 ? -d[3] : -d[2] } : { main: -d[2], additional: 0 };
  }
  return { inp: { ...inp, rules: undefined }, dealer, res, pay };
}

const out: any[] = [];
while (out.length < N) {
  const c = genCase();
  if (c) out.push(c);
}
process.stdout.write(JSON.stringify(out));

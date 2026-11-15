import { shanten } from './agari.ts';
import type { Action, Round } from './round.ts';
import { countsOf, isDragon, isHonor, isTerminal, type Tile } from './tiles.ts';

/**
 * 簡易AI。空席の穴埋め・切断時の代打ち・動作確認に使う。自分の席から見える情報だけで判断する。
 * 方針: 和了れるなら和了る／聴牌なら立直／向聴数が下がる牌を切る／役牌だけポン。
 */
export function botAction(round: Round, seat: number): Action | null {
  const o = round.options(seat);
  if (!o) return null;
  const p = round.s.players[seat];
  if (o.kind === 'claim') {
    if (o.ron) return { type: 'ron' };
    if (o.pon.length) {
      const k = o.tile >> 2;
      const yakuhai = isDragon(k) || k === round.seatWind(seat) || k === 27 + round.s.roundWind;
      const open = p.melds.some((m) => m.type !== 'ankan');
      if (yakuhai || open) {
        const before = shanten(countsOf(p.hand), p.melds.length);
        const c = countsOf(p.hand);
        c[k] -= 2;
        const after = shantenAfterBestDiscard(c, p.melds.length + 1);
        if (after < before || (yakuhai && after <= before)) return { type: 'pon', tiles: o.pon[0] };
      }
    }
    return { type: 'pass' };
  }
  if (o.tsumo) return { type: 'tsumo' };
  if (o.nuki) return { type: 'nuki' };
  if (o.ankan.length && p.riichi > 0) return { type: 'ankan', kind: o.ankan[0] };
  const tiles = p.drawn === null ? p.hand : [...p.hand, p.drawn];
  const c = countsOf(tiles);
  let best: Tile | null = null;
  let bestScore = Infinity;
  const tried = new Set<number>();
  for (const t of o.discard) {
    const k = t >> 2;
    if (tried.has(k)) continue;
    tried.add(k);
    c[k]--;
    const sh = shanten(c, p.melds.length);
    c[k]++;
    // 同じ向聴数なら、孤立した字牌・端牌から切る
    let iso = 0;
    if (isHonor(k)) iso = c[k] === 1 ? -3 : 2;
    else {
      const n = k % 9;
      const near = (n > 0 ? c[k - 1] : 0) + (n < 8 ? c[k + 1] : 0) + (n > 1 ? c[k - 2] : 0) + (n < 7 ? c[k + 2] : 0) + (c[k] - 1) * 2;
      iso = near - (isTerminal(k) ? 1.5 : 0) - (n === 1 || n === 7 ? 0.5 : 0);
    }
    const score = sh * 100 + iso;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best === null) return round.defaultAction(seat);
  // 同じ牌種なら赤でない方を切る
  const same = o.discard.filter((t) => t >> 2 === best! >> 2).sort((a, b) => b - a);
  best = same[0];
  if (o.riichi.some((t) => t >> 2 === best! >> 2)) return { type: 'discard', tile: best, riichi: true };
  return { type: 'discard', tile: best };
}

function shantenAfterBestDiscard(c: number[], melds: number): number {
  let best = 99;
  for (let k = 0; k < 34; k++) {
    if (!c[k]) continue;
    c[k]--;
    const s = shanten(c, melds);
    c[k]++;
    if (s < best) best = s;
  }
  return best;
}

import { decompose, isChiitoi, isKokushi } from './agari.ts';
import type { Rules } from './rules.ts';
import {
  CHUN, HAKU, HATSU, KINDS, NORTH,
  countsOf, doraFromIndicator, isAkaTile, isDragon, isGreen, isHonor, isTerminal, isWind, isYaochu, suitOf,
  type Kind, type Tile,
} from './tiles.ts';

export type MeldType = 'chi' | 'pon' | 'minkan' | 'ankan' | 'kakan';

export interface Meld {
  type: MeldType;
  /** 構成牌すべて（鳴いた牌・加槓した牌を含む） */
  tiles: Tile[];
  /** 鳴いた牌（暗槓にはない） */
  called?: Tile;
  /** 鳴いた相手の席（暗槓にはない） */
  from?: number;
  /** 加槓で足した牌 */
  added?: Tile;
}

export interface WinInput {
  /** 手の内の牌（和了牌を含む、副露を除く） */
  hand: Tile[];
  melds: Meld[];
  winTile: Tile;
  tsumo: boolean;
  /** 0=なし 1=立直 2=ダブル立直 */
  riichi: 0 | 1 | 2;
  ippatsu: boolean;
  rinshan: boolean;
  chankan: boolean;
  /** 最後の牌での和了（ツモなら海底、ロンなら河底） */
  lastTile: boolean;
  tenhou: boolean;
  chiihou: boolean;
  seatWind: Kind;
  roundWind: Kind;
  doraIndicators: Tile[];
  uraIndicators: Tile[];
  /** 抜いた北の枚数（3人麻雀） */
  nuki: number;
  rules: Rules;
}

export interface YakuEntry {
  id: string;
  name: string;
  /** 翻数。役満は 13（ダブルは 26） */
  han: number;
}

export interface WinResult {
  yaku: YakuEntry[];
  han: number;
  fu: number;
  /** 役満の倍数（0 = 役満ではない。数え役満は 1） */
  yakuman: number;
  /** 基本点（子のロンなら ×4、親のロンなら ×6） */
  base: number;
  /** 満貫・跳満などの名前（なければ空） */
  limit: string;
  dora: { dora: number; ura: number; aka: number; nuki: number };
  /** 責任払いの対象になりうる役満の id（大三元 / 大四喜） */
  paoYaku: string[];
}

interface Mentsu {
  kind: Kind;
  chi: boolean;
  open: boolean;
  kan: boolean;
}

type Wait = 'ryanmen' | 'kanchan' | 'penchan' | 'tanki' | 'shanpon';

interface ShapeResult {
  yaku: YakuEntry[];
  yakuman: YakuEntry[];
  fu: number;
}

const Y = (id: string, name: string, han: number): YakuEntry => ({ id, name, han });

function meldToMentsu(m: Meld): Mentsu {
  const kinds = m.tiles.map((t) => t >> 2).sort((a, b) => a - b);
  return {
    kind: kinds[0],
    chi: m.type === 'chi',
    open: m.type !== 'ankan',
    kan: m.type === 'minkan' || m.type === 'ankan' || m.type === 'kakan',
  };
}

export function isMenzen(melds: Meld[]): boolean {
  return melds.every((m) => m.type === 'ankan');
}

function flushInfo(all: number[]): { suits: number; honors: boolean } {
  let mask = 0;
  let honors = false;
  for (let k = 0; k < KINDS; k++) {
    if (!all[k]) continue;
    if (k >= 27) honors = true;
    else mask |= 1 << suitOf(k);
  }
  const suits = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
  return { suits, honors };
}

function evalRegular(
  inp: WinInput,
  all: number[],
  sets: Mentsu[],
  pair: Kind,
  wait: Wait,
  menzen: boolean,
): ShapeResult {
  const { rules } = inp;
  const yaku: YakuEntry[] = [];
  const yakuman: YakuEntry[] = [];
  const chis = sets.filter((s) => s.chi);
  const pons = sets.filter((s) => !s.chi);
  const has = (chi: boolean, kind: Kind) => sets.some((s) => s.chi === chi && s.kind === kind);
  const { suits, honors } = flushInfo(all);
  const dbl = rules.doubleYakuman;

  // ---- 役満 ----
  const dragonPons = pons.filter((p) => isDragon(p.kind)).length;
  const windPons = pons.filter((p) => isWind(p.kind)).length;
  const concealedPons = pons.filter((p) => !p.open).length;
  const kans = sets.filter((s) => s.kan).length;

  if (dragonPons === 3) yakuman.push(Y('daisangen', '大三元', 13));
  if (windPons === 4) yakuman.push(Y('daisuushi', '大四喜', dbl ? 26 : 13));
  else if (windPons === 3 && isWind(pair)) yakuman.push(Y('shousuushi', '小四喜', 13));
  if (suits === 0) yakuman.push(Y('tsuuiisou', '字一色', 13));
  if (!honors && all.every((n, k) => n === 0 || isTerminal(k))) yakuman.push(Y('chinroutou', '清老頭', 13));
  if (all.every((n, k) => n === 0 || isGreen(k))) yakuman.push(Y('ryuuiisou', '緑一色', 13));
  if (concealedPons === 4) {
    if (wait === 'tanki') yakuman.push(Y('suuankou_tanki', '四暗刻単騎', dbl ? 26 : 13));
    else yakuman.push(Y('suuankou', '四暗刻', 13));
  }
  if (kans === 4) yakuman.push(Y('suukantsu', '四槓子', 13));
  if (inp.melds.length === 0 && suits === 1 && !honors) {
    const s = suitOf(inp.winTile >> 2) * 9;
    let ok = all[s] >= 3 && all[s + 8] >= 3;
    for (let i = 1; i <= 7 && ok; i++) if (all[s + i] < 1) ok = false;
    if (ok) {
      const w = inp.winTile >> 2;
      const junsei = all[w] === (w === s || w === s + 8 ? 4 : 2);
      yakuman.push(junsei ? Y('junsei_chuuren', '純正九蓮宝燈', dbl ? 26 : 13) : Y('chuuren', '九蓮宝燈', 13));
    }
  }

  // ---- 通常役 ----
  const valuePairFu =
    (isDragon(pair) ? 2 : 0) + (pair === inp.seatWind ? 2 : 0) + (pair === inp.roundWind ? 2 : 0);
  const pinfu = inp.melds.length === 0 && chis.length === 4 && valuePairFu === 0 && wait === 'ryanmen';
  if (pinfu) yaku.push(Y('pinfu', '平和', 1));

  let noYaochu = true;
  for (let k = 0; k < KINDS; k++) if (all[k] && isYaochu(k)) noYaochu = false;
  if (noYaochu && (menzen || rules.kuitan)) yaku.push(Y('tanyao', '断幺九', 1));

  if (menzen) {
    const cnt = new Map<Kind, number>();
    for (const c of chis) cnt.set(c.kind, (cnt.get(c.kind) ?? 0) + 1);
    let pairs = 0;
    for (const n of cnt.values()) pairs += Math.floor(n / 2);
    if (pairs >= 2) yaku.push(Y('ryanpeikou', '二盃口', 3));
    else if (pairs === 1) yaku.push(Y('iipeikou', '一盃口', 1));
  }

  for (const p of pons) {
    if (p.kind === HAKU) yaku.push(Y('haku', '役牌 白', 1));
    if (p.kind === HATSU) yaku.push(Y('hatsu', '役牌 發', 1));
    if (p.kind === CHUN) yaku.push(Y('chun', '役牌 中', 1));
    if (p.kind === inp.seatWind) yaku.push(Y('jikaze', '自風牌', 1));
    if (p.kind === inp.roundWind) yaku.push(Y('bakaze', '場風牌', 1));
  }

  for (let n = 0; n <= 6; n++) {
    if (has(true, n) && has(true, 9 + n) && has(true, 18 + n)) {
      yaku.push(Y('sanshoku', '三色同順', menzen ? 2 : 1));
      break;
    }
  }
  for (let s = 0; s < 27; s += 9) {
    if (has(true, s) && has(true, s + 3) && has(true, s + 6)) {
      yaku.push(Y('ittsu', '一気通貫', menzen ? 2 : 1));
      break;
    }
  }
  for (let n = 0; n <= 8; n++) {
    if (has(false, n) && has(false, 9 + n) && has(false, 18 + n)) {
      yaku.push(Y('sanshoku_doukou', '三色同刻', 2));
      break;
    }
  }

  const allSetsYaochu =
    isYaochu(pair) && sets.every((s) => (s.chi ? s.kind % 9 === 0 || s.kind % 9 === 6 : isYaochu(s.kind)));
  if (allSetsYaochu) {
    if (chis.length > 0) {
      if (honors) yaku.push(Y('chanta', '混全帯幺九', menzen ? 2 : 1));
      else yaku.push(Y('junchan', '純全帯幺九', menzen ? 3 : 2));
    } else if (honors && suits > 0) {
      yaku.push(Y('honroutou', '混老頭', 2));
    }
  }

  if (pons.length === 4) yaku.push(Y('toitoi', '対々和', 2));
  if (concealedPons === 3) yaku.push(Y('sanankou', '三暗刻', 2));
  if (kans === 3) yaku.push(Y('sankantsu', '三槓子', 2));
  if (dragonPons === 2 && isDragon(pair)) yaku.push(Y('shousangen', '小三元', 2));

  if (suits === 1) {
    if (honors) yaku.push(Y('honitsu', '混一色', menzen ? 3 : 2));
    else yaku.push(Y('chinitsu', '清一色', menzen ? 6 : 5));
  }

  // ---- 符 ----
  let fu: number;
  if (pinfu) {
    fu = inp.tsumo ? 20 : 30;
  } else {
    fu = 20;
    for (const s of sets) {
      if (s.chi) continue;
      let f = 2;
      if (!s.open) f *= 2;
      if (isYaochu(s.kind)) f *= 2;
      if (s.kan) f *= 4;
      fu += f;
    }
    fu += valuePairFu;
    if (wait === 'kanchan' || wait === 'penchan' || wait === 'tanki') fu += 2;
    if (inp.tsumo) fu += 2;
    if (menzen && !inp.tsumo) fu += 10;
    if (fu === 20) fu = 30;
    fu = Math.ceil(fu / 10) * 10;
  }
  return { yaku, yakuman, fu };
}

function evalChiitoi(inp: WinInput, all: number[]): ShapeResult {
  const yaku: YakuEntry[] = [Y('chiitoi', '七対子', 2)];
  const yakuman: YakuEntry[] = [];
  const { suits, honors } = flushInfo(all);
  if (suits === 0) yakuman.push(Y('tsuuiisou', '字一色', 13));
  let noYaochu = true;
  let allYaochu = true;
  for (let k = 0; k < KINDS; k++) {
    if (!all[k]) continue;
    if (isYaochu(k)) noYaochu = false;
    else allYaochu = false;
  }
  if (noYaochu) yaku.push(Y('tanyao', '断幺九', 1));
  if (allYaochu && honors && suits > 0) yaku.push(Y('honroutou', '混老頭', 2));
  if (suits === 1) {
    if (honors) yaku.push(Y('honitsu', '混一色', 3));
    else yaku.push(Y('chinitsu', '清一色', 6));
  }
  return { yaku, yakuman, fu: 25 };
}

export function baseFromHanFu(han: number, fu: number, rules: Rules): { base: number; limit: string; yakuman: number } {
  if (han >= 13) {
    if (rules.kazoeYakuman) return { base: 8000, limit: '数え役満', yakuman: 1 };
    return { base: 6000, limit: '三倍満', yakuman: 0 };
  }
  if (han >= 11) return { base: 6000, limit: '三倍満', yakuman: 0 };
  if (han >= 8) return { base: 4000, limit: '倍満', yakuman: 0 };
  if (han >= 6) return { base: 3000, limit: '跳満', yakuman: 0 };
  if (han >= 5) return { base: 2000, limit: '満貫', yakuman: 0 };
  const b = fu * Math.pow(2, han + 2);
  if (b >= 2000) return { base: 2000, limit: '満貫', yakuman: 0 };
  if (rules.kiriageMangan && ((han === 4 && fu === 30) || (han === 3 && fu === 60))) {
    return { base: 2000, limit: '満貫', yakuman: 0 };
  }
  return { base: b, limit: '', yakuman: 0 };
}

const YAKUMAN_NAMES = ['', '役満', 'ダブル役満', 'トリプル役満', '四倍役満', '五倍役満', '六倍役満'];

/** 和了の役・符・点数を求める。役が無ければ null。和了形でなければ null。 */
export function evaluateWin(inp: WinInput): WinResult | null {
  const { rules } = inp;
  const counts = countsOf(inp.hand);
  const menzen = isMenzen(inp.melds);
  const winKind = inp.winTile >> 2;
  const sanma = rules.players === 3;

  const all = counts.slice();
  for (const m of inp.melds) for (const t of m.tiles) all[t >> 2]++;

  const shapes: ShapeResult[] = [];

  if (inp.melds.length === 0 && isKokushi(counts)) {
    const thirteen = counts[winKind] === 2;
    shapes.push({
      yaku: [],
      yakuman: [thirteen && rules.doubleYakuman ? Y('kokushi13', '国士無双十三面', 26) : Y('kokushi', '国士無双', 13)],
      fu: 30,
    });
  }
  if (inp.melds.length === 0 && isChiitoi(counts)) shapes.push(evalChiitoi(inp, all));

  const meldSets = inp.melds.map(meldToMentsu);
  for (const d of decompose(counts)) {
    const seen = new Set<string>();
    // 和了牌を雀頭に置く
    if (d.pair === winKind) {
      seen.add('pair');
      const sets = [...d.sets.map((s) => ({ ...s, open: false, kan: false })), ...meldSets];
      shapes.push(evalRegular(inp, all, sets, d.pair, 'tanki', menzen));
    }
    // 和了牌を面子に置く
    for (let i = 0; i < d.sets.length; i++) {
      const s = d.sets[i];
      let wait: Wait | null = null;
      if (s.chi) {
        if (winKind === s.kind + 1) wait = 'kanchan';
        else if (winKind === s.kind) wait = s.kind % 9 === 6 ? 'penchan' : 'ryanmen';
        else if (winKind === s.kind + 2) wait = s.kind % 9 === 0 ? 'penchan' : 'ryanmen';
      } else if (s.kind === winKind) {
        wait = 'shanpon';
      }
      if (!wait) continue;
      const key = `${s.chi ? 'c' : 'p'}${s.kind}${wait}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sets = [
        ...d.sets.map((x, j) => ({ ...x, open: j === i && wait === 'shanpon' && !inp.tsumo, kan: false })),
        ...meldSets,
      ];
      shapes.push(evalRegular(inp, all, sets, d.pair, wait, menzen));
    }
  }
  if (shapes.length === 0) return null;

  // ---- 状況役 ----
  const common: YakuEntry[] = [];
  const commonYakuman: YakuEntry[] = [];
  if (inp.riichi === 2) common.push(Y('double_riichi', 'ダブル立直', 2));
  else if (inp.riichi === 1) common.push(Y('riichi', '立直', 1));
  if (inp.riichi && inp.ippatsu && rules.ippatsu) common.push(Y('ippatsu', '一発', 1));
  if (menzen && inp.tsumo) common.push(Y('tsumo', '門前清自摸和', 1));
  if (inp.rinshan) common.push(Y('rinshan', '嶺上開花', 1));
  if (inp.chankan) common.push(Y('chankan', '槍槓', 1));
  if (inp.lastTile && !inp.rinshan) {
    common.push(inp.tsumo ? Y('haitei', '海底摸月', 1) : Y('houtei', '河底撈魚', 1));
  }
  if (inp.tenhou) commonYakuman.push(Y('tenhou', '天和', 13));
  if (inp.chiihou) commonYakuman.push(Y('chiihou', '地和', 13));

  // ---- ドラ ----
  const allTiles: Tile[] = [...inp.hand];
  for (const m of inp.melds) allTiles.push(...m.tiles);
  const countDora = (indicators: Tile[]) => {
    let n = 0;
    for (const ind of indicators) {
      const dk = doraFromIndicator(ind >> 2, sanma);
      n += all[dk];
      if (dk === NORTH) n += inp.nuki;
    }
    return n;
  };
  const dora = {
    dora: countDora(inp.doraIndicators),
    ura: inp.riichi && rules.uraDora ? countDora(inp.uraIndicators) : 0,
    aka: rules.aka ? allTiles.filter(isAkaTile).length : 0,
    nuki: inp.nuki,
  };
  const doraTotal = dora.dora + dora.ura + dora.aka + dora.nuki;

  let best: WinResult | null = null;
  for (const sh of shapes) {
    const ym = [...sh.yakuman, ...commonYakuman];
    let res: WinResult;
    if (ym.length > 0) {
      const mult = ym.reduce((a, y) => a + y.han / 13, 0);
      res = {
        yaku: ym,
        han: mult * 13,
        fu: sh.fu,
        yakuman: mult,
        base: 8000 * mult,
        limit: YAKUMAN_NAMES[mult] ?? `${mult}倍役満`,
        dora: { dora: 0, ura: 0, aka: 0, nuki: 0 },
        paoYaku: ym.filter((y) => y.id === 'daisangen' || y.id === 'daisuushi').map((y) => y.id),
      };
    } else {
      const yaku = [...common, ...sh.yaku];
      const yakuHan = yaku.reduce((a, y) => a + y.han, 0);
      if (yakuHan === 0) continue;
      const han = yakuHan + doraTotal;
      const b = baseFromHanFu(han, sh.fu, rules);
      const withDora = [...yaku];
      if (dora.dora) withDora.push(Y('dora', 'ドラ', dora.dora));
      if (dora.aka) withDora.push(Y('aka', '赤ドラ', dora.aka));
      if (dora.nuki) withDora.push(Y('nuki', '抜きドラ', dora.nuki));
      if (dora.ura) withDora.push(Y('ura', '裏ドラ', dora.ura));
      res = { yaku: withDora, han, fu: sh.fu, yakuman: b.yakuman, base: b.base, limit: b.limit, dora, paoYaku: [] };
    }
    if (
      !best ||
      res.base > best.base ||
      (res.base === best.base && (res.han > best.han || (res.han === best.han && res.fu > best.fu)))
    ) {
      best = res;
    }
  }
  return best;
}

const ceil100 = (x: number) => Math.ceil(x / 100) * 100;

export interface PaymentInput {
  base: number;
  n: number;
  winner: number;
  dealer: number;
  /** ロンなら放銃者、ツモなら null */
  loser: number | null;
  honba: number;
  rules: Rules;
  /** 責任払い: 対象の席と、責任払いになる基本点（役満部分） */
  pao?: { seat: number; base: number } | null;
}

/** 和了1件の点数移動（供託は含まない）。返り値は席ごとの増減。 */
export function calcPayments(o: PaymentInput): number[] {
  const { n, winner, dealer, loser, rules } = o;
  const d = new Array<number>(n).fill(0);
  const pay = (from: number, amount: number) => {
    d[from] -= amount;
    d[winner] += amount;
  };
  const ronMult = winner === dealer ? 6 : 4;
  const honbaRon = o.honba * rules.honbaValue;
  const honbaEach = o.honba * Math.round(rules.honbaValue / 3);
  const pao = o.pao && o.pao.seat !== winner ? o.pao : null;
  const paoBase = pao ? Math.min(pao.base, o.base) : 0;
  const restBase = o.base - paoBase;

  if (loser !== null) {
    if (pao && pao.seat !== loser) {
      const paoAmount = ceil100(paoBase * ronMult);
      const half = paoAmount / 2;
      pay(pao.seat, half);
      pay(loser, half + ceil100(restBase * ronMult) + honbaRon);
    } else {
      pay(loser, ceil100(o.base * ronMult) + honbaRon);
    }
    return d;
  }

  // ツモ
  if (pao) {
    pay(pao.seat, ceil100(paoBase * ronMult) + honbaEach * (n - 1));
  }
  const tsumoBase = pao ? restBase : o.base;
  if (tsumoBase > 0) {
    for (let s = 0; s < n; s++) {
      if (s === winner) continue;
      let amount = ceil100(tsumoBase * (winner === dealer || s === dealer ? 2 : 1));
      if (n === 3 && !rules.tsumoLoss) amount += ceil100(tsumoBase / 2);
      pay(s, amount + (pao ? 0 : honbaEach));
    }
  }
  return d;
}

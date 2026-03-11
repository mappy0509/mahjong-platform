import type { YakuContext, YakuResult, YakuChecker } from "./yaku-types";
import type { Mentsu } from "../../hand";
import {
  tileKind,
  tileSuit,
  tileNumber,
  isNumberTile,
  isHonorTile,
  isTerminal,
  isTerminalOrHonor,
  isSimple,
  isGreenTile,
  isWindTile,
  isDragonTile,
} from "../../tile";
import { TileSuit, MeldType, Wind } from "@mahjong/shared";
import {
  EAST_WIND,
  SOUTH_WIND,
  WEST_WIND,
  NORTH_WIND,
  HAKU,
  HATSU,
  CHUN,
  TILE_KINDS,
} from "@mahjong/shared";

// ===== Helper functions =====

function allMentsu(ctx: YakuContext): Mentsu[] {
  if (!ctx.decomposition) return [];
  return ctx.decomposition.mentsu;
}

function allKindsFlat(ctx: YakuContext): number[] {
  const kinds = [...ctx.handKinds];
  for (const m of ctx.melds) {
    for (const t of m.tiles) {
      kinds.push(tileKind(t));
    }
  }
  return kinds;
}

function countAllKinds(ctx: YakuContext): number[] {
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of allKindsFlat(ctx)) counts[k]++;
  return counts;
}

function hasOpenMeld(ctx: YakuContext): boolean {
  return ctx.melds.some(
    (m) => m.type !== MeldType.KAN_CLOSED
  );
}

function allKoutsu(ctx: YakuContext): number[] {
  const result: number[] = [];
  for (const m of allMentsu(ctx)) {
    if (m.type === "koutsu") result.push(m.tiles[0]);
  }
  for (const m of ctx.melds) {
    if (
      m.type === MeldType.PON ||
      m.type === MeldType.KAN_OPEN ||
      m.type === MeldType.KAN_CLOSED ||
      m.type === MeldType.KAN_ADDED
    ) {
      result.push(tileKind(m.tiles[0]));
    }
  }
  return result;
}

function allShuntsu(ctx: YakuContext): number[][] {
  const result: number[][] = [];
  for (const m of allMentsu(ctx)) {
    if (m.type === "shuntsu") result.push(m.tiles);
  }
  for (const m of ctx.melds) {
    if (m.type === MeldType.CHI) {
      result.push(m.tiles.map(tileKind).sort((a, b) => a - b));
    }
  }
  return result;
}

function kanCount(ctx: YakuContext): number {
  return ctx.melds.filter(
    (m) =>
      m.type === MeldType.KAN_OPEN ||
      m.type === MeldType.KAN_CLOSED ||
      m.type === MeldType.KAN_ADDED
  ).length;
}

// ===== 1翻 =====

export const menzenTsumo: YakuChecker = (ctx) => {
  if (!ctx.isMenzen || !ctx.isTsumo) return null;
  return { name: "門前清自摸和", han: 1 };
};

export const riichi: YakuChecker = (ctx) => {
  if (!ctx.isRiichi || ctx.isDoubleRiichi) return null;
  return { name: "立直", han: 1 };
};

export const ippatsu: YakuChecker = (ctx) => {
  if (!ctx.isIppatsu) return null;
  return { name: "一発", han: 1 };
};

export const pinfu: YakuChecker = (ctx) => {
  if (!ctx.isMenzen || !ctx.decomposition) return null;
  const dec = ctx.decomposition;

  // All mentsu must be shuntsu
  if (dec.mentsu.some((m) => m.type !== "shuntsu")) return null;

  // Pair must not be yakuhai
  const pair = dec.pair;
  if (isDragonTile(pair)) return null;
  if (pair === EAST_WIND + ctx.roundWind) return null;
  if (pair === EAST_WIND + ctx.seatWind) return null;

  // Win must be a two-sided wait (ryanmen)
  const winKind = ctx.winTileKind;
  const winMentsu = dec.mentsu.find(
    (m) => m.type === "shuntsu" && m.tiles.includes(winKind)
  );
  if (!winMentsu) return null;
  // Check if the win tile is on either end (not middle/kanchan or penchan)
  const sorted = [...winMentsu.tiles].sort((a, b) => a - b);
  if (winKind === sorted[1]) return null; // kanchan (middle wait)
  // Check penchan: [1,2,3] wait on 3 or [7,8,9] wait on 7
  if (winKind === sorted[2] && tileNumber(sorted[0]) === 1) return null;
  if (winKind === sorted[0] && tileNumber(sorted[2]) === 9) return null;

  return { name: "平和", han: 1 };
};

export const iipeikou: YakuChecker = (ctx) => {
  if (!ctx.isMenzen || !ctx.decomposition) return null;
  const shuntsu = ctx.decomposition.mentsu.filter(
    (m) => m.type === "shuntsu"
  );
  // Find duplicate shuntsu
  let count = 0;
  const seen = new Set<string>();
  for (const s of shuntsu) {
    const key = s.tiles.join(",");
    if (seen.has(key)) {
      count++;
    } else {
      seen.add(key);
    }
  }
  // If 2 pairs of identical shuntsu, it's ryanpeikou (handled separately)
  if (count === 2) return null;
  if (count !== 1) return null;
  return { name: "一盃口", han: 1 };
};

export const tanyao: YakuChecker = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (allKinds.every(isSimple)) {
    return { name: "断么九", han: 1 };
  }
  return null;
};

export const yakuhaiHaku: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  if (koutsuList.includes(HAKU)) return { name: "役牌 白", han: 1 };
  return null;
};

export const yakuhaiHatsu: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  if (koutsuList.includes(HATSU)) return { name: "役牌 發", han: 1 };
  return null;
};

export const yakuhaiChun: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  if (koutsuList.includes(CHUN)) return { name: "役牌 中", han: 1 };
  return null;
};

export const yakuhaiRoundWind: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  const windKind = EAST_WIND + ctx.roundWind;
  if (koutsuList.includes(windKind)) return { name: "役牌 場風牌", han: 1 };
  return null;
};

export const yakuhaiSeatWind: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  const windKind = EAST_WIND + ctx.seatWind;
  if (koutsuList.includes(windKind)) return { name: "役牌 自風牌", han: 1 };
  return null;
};

export const haitei: YakuChecker = (ctx) => {
  if (!ctx.isLastTileDraw || !ctx.isTsumo) return null;
  return { name: "海底摸月", han: 1 };
};

export const houtei: YakuChecker = (ctx) => {
  if (!ctx.isLastDiscard || !ctx.isTsumo) return null;
  return { name: "河底撈魚", han: 1 };
};

export const rinshan: YakuChecker = (ctx) => {
  if (!ctx.isRinshan) return null;
  return { name: "嶺上開花", han: 1 };
};

export const chankan: YakuChecker = (ctx) => {
  if (!ctx.isChankan) return null;
  return { name: "搶槓", han: 1 };
};

// ===== 2翻 =====

export const doubleRiichi: YakuChecker = (ctx) => {
  if (!ctx.isDoubleRiichi) return null;
  return { name: "ダブル立直", han: 2 };
};

export const chanta: YakuChecker = (ctx) => {
  if (!ctx.decomposition) return null;
  const dec = ctx.decomposition;
  // Every mentsu and pair must contain a terminal or honor
  if (!isTerminalOrHonor(dec.pair)) return null;
  for (const m of dec.mentsu) {
    if (!m.tiles.some(isTerminalOrHonor)) return null;
  }
  for (const m of ctx.melds) {
    if (!m.tiles.some((t) => isTerminalOrHonor(tileKind(t)))) return null;
  }
  // Must have at least one shuntsu (otherwise it's toitoi/honroutou)
  const hasShuntsu =
    allShuntsu(ctx).length > 0;
  if (!hasShuntsu) return null;
  // Must have at least one honor (otherwise it's junchan)
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.some(isHonorTile)) return null;
  return { name: "混全帯么九", han: ctx.isMenzen ? 2 : 1 };
};

export const sanshokuDoujun: YakuChecker = (ctx) => {
  const shuntsu = allShuntsu(ctx);
  // Check if there's a sequence with same number in all 3 suits
  for (const s of shuntsu) {
    const num = s[0] % 9;
    const hasSuits = [false, false, false]; // man, pin, sou
    for (const s2 of shuntsu) {
      if (s2[0] % 9 === num) {
        const suitIdx = Math.floor(s2[0] / 9);
        if (suitIdx < 3) hasSuits[suitIdx] = true;
      }
    }
    if (hasSuits[0] && hasSuits[1] && hasSuits[2]) {
      return { name: "三色同順", han: ctx.isMenzen ? 2 : 1 };
    }
  }
  return null;
};

export const ikkitsuukan: YakuChecker = (ctx) => {
  const shuntsu = allShuntsu(ctx);
  // Check 123, 456, 789 in same suit
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    const has123 = shuntsu.some((s) => s[0] === base);
    const has456 = shuntsu.some((s) => s[0] === base + 3);
    const has789 = shuntsu.some((s) => s[0] === base + 6);
    if (has123 && has456 && has789) {
      return { name: "一気通貫", han: ctx.isMenzen ? 2 : 1 };
    }
  }
  return null;
};

export const toitoi: YakuChecker = (ctx) => {
  if (!ctx.decomposition) return null;
  // All mentsu must be koutsu
  const totalMentsu = allMentsu(ctx).length + ctx.melds.length;
  const totalKoutsu = allKoutsu(ctx).length;
  if (totalKoutsu !== 4) return null;
  return { name: "対々和", han: 2 };
};

export const sanankou: YakuChecker = (ctx) => {
  if (!ctx.decomposition) return null;
  // Count closed koutsu
  let closedKoutsu = 0;
  for (const m of allMentsu(ctx)) {
    if (m.type === "koutsu") closedKoutsu++;
  }
  for (const m of ctx.melds) {
    if (m.type === MeldType.KAN_CLOSED) closedKoutsu++;
  }
  // If ron and the win tile completed a koutsu, that koutsu is open
  if (!ctx.isTsumo && ctx.decomposition) {
    for (const m of ctx.decomposition.mentsu) {
      if (m.type === "koutsu" && m.tiles[0] === ctx.winTileKind) {
        closedKoutsu--;
        break;
      }
    }
  }
  if (closedKoutsu !== 3) return null;
  return { name: "三暗刻", han: 2 };
};

export const sanshokuDoukou: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  for (const k of koutsuList) {
    if (!isNumberTile(k)) continue;
    const num = k % 9;
    const hasSuits = [false, false, false];
    for (const k2 of koutsuList) {
      if (isNumberTile(k2) && k2 % 9 === num) {
        hasSuits[Math.floor(k2 / 9)] = true;
      }
    }
    if (hasSuits[0] && hasSuits[1] && hasSuits[2]) {
      return { name: "三色同刻", han: 2 };
    }
  }
  return null;
};

export const sankantsu: YakuChecker = (ctx) => {
  if (kanCount(ctx) !== 3) return null;
  return { name: "三槓子", han: 2 };
};

export const chiitoitsu: YakuChecker = (ctx) => {
  if (!ctx.isChiitoi) return null;
  return { name: "七対子", han: 2 };
};

export const honroutou: YakuChecker = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.every(isTerminalOrHonor)) return null;
  // Must have both terminals and honors
  if (!allKinds.some(isTerminal)) return null;
  if (!allKinds.some(isHonorTile)) return null;
  return { name: "混老頭", han: 2 };
};

export const shousangen: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  let dragonKoutsu = 0;
  for (const k of koutsuList) {
    if (isDragonTile(k)) dragonKoutsu++;
  }
  // Pair must also be a dragon
  if (!ctx.decomposition) return null;
  if (!isDragonTile(ctx.decomposition.pair)) return null;
  if (dragonKoutsu !== 2) return null;
  return { name: "小三元", han: 2 };
};

// ===== 3翻 =====

export const honitsu: YakuChecker = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  const suits = new Set<TileSuit>();
  let hasHonor = false;
  for (const k of allKinds) {
    if (isHonorTile(k)) {
      hasHonor = true;
    } else {
      suits.add(tileSuit(k));
    }
  }
  if (suits.size !== 1 || !hasHonor) return null;
  return { name: "混一色", han: ctx.isMenzen ? 3 : 2 };
};

export const junchan: YakuChecker = (ctx) => {
  if (!ctx.decomposition) return null;
  const dec = ctx.decomposition;
  const allKinds = allKindsFlat(ctx);
  // No honors
  if (allKinds.some(isHonorTile)) return null;
  // Pair must be terminal
  if (!isTerminal(dec.pair)) return null;
  // All mentsu must contain terminal
  for (const m of dec.mentsu) {
    if (!m.tiles.some(isTerminal)) return null;
  }
  for (const m of ctx.melds) {
    if (!m.tiles.some((t) => isTerminal(tileKind(t)))) return null;
  }
  // Must have at least one shuntsu
  if (allShuntsu(ctx).length === 0) return null;
  return { name: "純全帯么九", han: ctx.isMenzen ? 3 : 2 };
};

export const ryanpeikou: YakuChecker = (ctx) => {
  if (!ctx.isMenzen || !ctx.decomposition) return null;
  const shuntsu = ctx.decomposition.mentsu.filter(
    (m) => m.type === "shuntsu"
  );
  if (shuntsu.length !== 4) return null;
  // Must form 2 pairs of identical shuntsu
  const keys = shuntsu.map((s) => s.tiles.join(",")).sort();
  if (keys[0] === keys[1] && keys[2] === keys[3]) {
    return { name: "二盃口", han: 3 };
  }
  return null;
};

// ===== 6翻 =====

export const chinitsu: YakuChecker = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (allKinds.some(isHonorTile)) return null;
  const suits = new Set(allKinds.map(tileSuit));
  if (suits.size !== 1) return null;
  return { name: "清一色", han: ctx.isMenzen ? 6 : 5 };
};

// ===== 役満 =====

export const kokushiMusou: YakuChecker = (ctx) => {
  if (!ctx.isKokushi) return null;
  return { name: "国士無双", han: 13, isYakuman: true };
};

export const suuankou: YakuChecker = (ctx) => {
  if (!ctx.decomposition) return null;
  let closedKoutsu = 0;
  for (const m of ctx.decomposition.mentsu) {
    if (m.type === "koutsu") closedKoutsu++;
  }
  for (const m of ctx.melds) {
    if (m.type === MeldType.KAN_CLOSED) closedKoutsu++;
  }
  // For tsumo: all 4 koutsu are closed
  // For ron: the koutsu completed by the ron tile is considered open
  if (ctx.isTsumo) {
    if (closedKoutsu !== 4) return null;
  } else {
    // Ron: must have 4 closed koutsu and win on the pair
    if (closedKoutsu !== 4) return null;
    // Check win is on pair
    if (ctx.decomposition.pair !== ctx.winTileKind) return null;
  }
  return { name: "四暗刻", han: 13, isYakuman: true };
};

export const daisangen: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  let count = 0;
  if (koutsuList.includes(HAKU)) count++;
  if (koutsuList.includes(HATSU)) count++;
  if (koutsuList.includes(CHUN)) count++;
  if (count !== 3) return null;
  return { name: "大三元", han: 13, isYakuman: true };
};

export const shousuushii: YakuChecker = (ctx) => {
  if (!ctx.decomposition) return null;
  const koutsuList = allKoutsu(ctx);
  let windKoutsu = 0;
  for (const k of koutsuList) {
    if (isWindTile(k)) windKoutsu++;
  }
  if (windKoutsu !== 3) return null;
  if (!isWindTile(ctx.decomposition.pair)) return null;
  return { name: "小四喜", han: 13, isYakuman: true };
};

export const daisuushii: YakuChecker = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  let windKoutsu = 0;
  for (const k of koutsuList) {
    if (isWindTile(k)) windKoutsu++;
  }
  if (windKoutsu !== 4) return null;
  return { name: "大四喜", han: 13, isYakuman: true };
};

export const tsuuiisou: YakuChecker = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.every(isHonorTile)) return null;
  return { name: "字一色", han: 13, isYakuman: true };
};

export const chinroutou: YakuChecker = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.every(isTerminal)) return null;
  return { name: "清老頭", han: 13, isYakuman: true };
};

export const ryuuiisou: YakuChecker = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.every(isGreenTile)) return null;
  return { name: "緑一色", han: 13, isYakuman: true };
};

export const chuurenPoutou: YakuChecker = (ctx) => {
  if (!ctx.isMenzen) return null;
  const allKinds = allKindsFlat(ctx);
  if (allKinds.some(isHonorTile)) return null;
  const suits = new Set(allKinds.map(tileSuit));
  if (suits.size !== 1) return null;

  // Must have: 1112345678999 + any tile in same suit
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of allKinds) counts[k]++;

  const suit = tileSuit(allKinds[0]);
  const base =
    suit === TileSuit.MAN ? 0 : suit === TileSuit.PIN ? 9 : 18;
  // Required: [3,1,1,1,1,1,1,1,3] (14th tile can be anything in suit)
  const required = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  for (let i = 0; i < 9; i++) {
    if (counts[base + i] < required[i]) return null;
  }
  return { name: "九蓮宝燈", han: 13, isYakuman: true };
};

export const suukantsu: YakuChecker = (ctx) => {
  if (kanCount(ctx) !== 4) return null;
  return { name: "四槓子", han: 13, isYakuman: true };
};

export const tenhou: YakuChecker = (ctx) => {
  if (!ctx.isFirstDraw || !ctx.isTsumo || ctx.seatWind !== Wind.EAST)
    return null;
  return { name: "天和", han: 13, isYakuman: true };
};

export const chiihou: YakuChecker = (ctx) => {
  if (!ctx.isFirstDraw || !ctx.isTsumo || ctx.seatWind === Wind.EAST)
    return null;
  return { name: "地和", han: 13, isYakuman: true };
};

// ===== All Checkers =====

export const ALL_YAKU_CHECKERS: YakuChecker[] = [
  // Yakuman (check first)
  tenhou,
  chiihou,
  kokushiMusou,
  suuankou,
  daisangen,
  daisuushii,
  shousuushii,
  tsuuiisou,
  chinroutou,
  ryuuiisou,
  chuurenPoutou,
  suukantsu,
  // Regular yaku
  menzenTsumo,
  riichi,
  doubleRiichi,
  ippatsu,
  pinfu,
  iipeikou,
  tanyao,
  yakuhaiHaku,
  yakuhaiHatsu,
  yakuhaiChun,
  yakuhaiRoundWind,
  yakuhaiSeatWind,
  haitei,
  houtei,
  rinshan,
  chankan,
  chanta,
  sanshokuDoujun,
  ikkitsuukan,
  toitoi,
  sanankou,
  sanshokuDoukou,
  sankantsu,
  chiitoitsu,
  honroutou,
  shousangen,
  honitsu,
  junchan,
  ryanpeikou,
  chinitsu,
];

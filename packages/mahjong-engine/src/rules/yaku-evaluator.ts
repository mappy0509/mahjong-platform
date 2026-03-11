import type { TileId, Meld } from "@mahjong/shared";
import { Wind, MeldType } from "@mahjong/shared";
import { tileKind } from "../tile";
import type { HandDecomposition } from "../hand";
import {
  decomposeHand,
  isSevenPairs,
  isThirteenOrphans,
} from "../hand";
import type { YakuContext, YakuResult } from "./yaku/yaku-types";
import { ALL_YAKU_CHECKERS } from "./yaku/yaku-checkers";

export interface WinContext {
  handTileIds: TileId[];
  melds: Meld[];
  winTileId: TileId;
  isTsumo: boolean;
  isRiichi: boolean;
  isDoubleRiichi: boolean;
  isIppatsu: boolean;
  roundWind: Wind;
  seatWind: Wind;
  isFirstDraw: boolean;
  isLastTileDraw: boolean;
  isLastDiscard: boolean;
  isRinshan: boolean;
  isChankan: boolean;
}

export interface EvaluationResult {
  yaku: YakuResult[];
  totalHan: number;
  isYakuman: boolean;
  /** The winning decomposition (null for special forms like chiitoi/kokushi) */
  decomposition: HandDecomposition | null;
  /** Whether the hand is seven pairs */
  isChiitoi: boolean;
}

/**
 * Evaluate all yaku for a winning hand.
 * Tries all possible decompositions and returns the one with highest value.
 */
export function evaluateYaku(win: WinContext): EvaluationResult {
  const handKinds = win.handTileIds.map(tileKind);
  const winKind = tileKind(win.winTileId);

  const isMenzen = !win.melds.some(
    (m) => m.type !== MeldType.KAN_CLOSED
  );

  const isChiitoi = isSevenPairs(handKinds);
  const isKokushi = isThirteenOrphans(handKinds);

  let bestResult: EvaluationResult = { yaku: [], totalHan: 0, isYakuman: false, decomposition: null, isChiitoi: false };

  // Try special forms
  if (isChiitoi || isKokushi) {
    const ctx: YakuContext = {
      decomposition: null,
      handKinds,
      handTileIds: win.handTileIds,
      melds: win.melds,
      winTileKind: winKind,
      winTileId: win.winTileId,
      isTsumo: win.isTsumo,
      isMenzen: isMenzen,
      isRiichi: win.isRiichi,
      isDoubleRiichi: win.isDoubleRiichi,
      isIppatsu: win.isIppatsu,
      roundWind: win.roundWind,
      seatWind: win.seatWind,
      isFirstDraw: win.isFirstDraw,
      isLastTileDraw: win.isLastTileDraw,
      isLastDiscard: win.isLastDiscard,
      isRinshan: win.isRinshan,
      isChankan: win.isChankan,
      isChiitoi,
      isKokushi,
    };
    const result = checkAllYaku(ctx, null, isChiitoi);
    if (result.totalHan > bestResult.totalHan) {
      bestResult = result;
    }
  }

  // Try standard decompositions
  const decompositions = decomposeHand(handKinds);
  for (const dec of decompositions) {
    const ctx: YakuContext = {
      decomposition: dec,
      handKinds,
      handTileIds: win.handTileIds,
      melds: win.melds,
      winTileKind: winKind,
      winTileId: win.winTileId,
      isTsumo: win.isTsumo,
      isMenzen: isMenzen,
      isRiichi: win.isRiichi,
      isDoubleRiichi: win.isDoubleRiichi,
      isIppatsu: win.isIppatsu,
      roundWind: win.roundWind,
      seatWind: win.seatWind,
      isFirstDraw: win.isFirstDraw,
      isLastTileDraw: win.isLastTileDraw,
      isLastDiscard: win.isLastDiscard,
      isRinshan: win.isRinshan,
      isChankan: win.isChankan,
      isChiitoi: false,
      isKokushi: false,
    };
    const result = checkAllYaku(ctx, dec, false);
    if (result.totalHan > bestResult.totalHan) {
      bestResult = result;
    }
  }

  return bestResult;
}

function checkAllYaku(ctx: YakuContext, decomposition: HandDecomposition | null, isChiitoi: boolean): EvaluationResult {
  const yaku: YakuResult[] = [];

  for (const checker of ALL_YAKU_CHECKERS) {
    const result = checker(ctx);
    if (result) yaku.push(result);
  }

  // If there are yakuman, only count yakuman
  const yakumanList = yaku.filter((y) => y.isYakuman);
  if (yakumanList.length > 0) {
    return {
      yaku: yakumanList,
      totalHan: yakumanList.reduce((sum, y) => sum + y.han, 0),
      isYakuman: true,
      decomposition,
      isChiitoi,
    };
  }

  // Filter out superseded yaku
  const filtered = filterSupersededYaku(yaku);
  return {
    yaku: filtered,
    totalHan: filtered.reduce((sum, y) => sum + y.han, 0),
    isYakuman: false,
    decomposition,
    isChiitoi,
  };
}

function filterSupersededYaku(yaku: YakuResult[]): YakuResult[] {
  const names = new Set(yaku.map((y) => y.name));
  return yaku.filter((y) => {
    // 二盃口 supersedes 一盃口 and 七対子
    if (y.name === "一盃口" && names.has("二盃口")) return false;
    if (y.name === "七対子" && names.has("二盃口")) return false;
    // 混老頭 supersedes チャンタ
    if (y.name === "混全帯么九" && names.has("混老頭")) return false;
    // 純チャン supersedes チャンタ
    if (y.name === "混全帯么九" && names.has("純全帯么九")) return false;
    // 清一色 supersedes 混一色
    if (y.name === "混一色" && names.has("清一色")) return false;
    // ダブリー supersedes リーチ
    if (y.name === "立直" && names.has("ダブル立直")) return false;
    return true;
  });
}

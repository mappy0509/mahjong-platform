import type { TileKind, TileId, Meld, SeatIndex } from "@mahjong/shared";
import { Wind, TILE_KINDS } from "@mahjong/shared";
import { tileKind } from "./tile";
import { decomposeHand, calculateShanten, isSevenPairs } from "./hand";
import { evaluateYaku, type WinContext, type EvaluationResult } from "./rules/yaku-evaluator";
import type { RoundState } from "./game-state";

export interface WaitInfo {
  tileKind: TileKind;
  yaku: { name: string; han: number }[];
  totalHan: number;
}

export interface DiscardOption {
  tileId: TileId;
  shantenAfter: number;
  waits: WaitInfo[];
}

/**
 * Find waiting tiles for a hand of any valid size (3n+1 tiles).
 * Works with hands that have melds (10, 7, 4 tiles) as well as full hands (13).
 */
function findWaitsGeneral(handKinds: TileKind[]): TileKind[] {
  const size = handKinds.length;
  // Must be 3n+1 to be tenpai (need 1 more tile to complete 3n+2 = pair + n*mentsu)
  if (size % 3 !== 1) return [];

  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of handKinds) counts[k]++;

  const waits: TileKind[] = [];
  for (let k = 0; k < TILE_KINDS; k++) {
    if (counts[k] >= 4) continue;
    // Test if adding this tile completes the hand
    const testKinds = [...handKinds, k];
    // Check standard decomposition (pair + mentsu)
    if (decomposeHand(testKinds).length > 0) {
      waits.push(k);
      continue;
    }
    // Check seven pairs (only for 13+1=14 tiles)
    if (testKinds.length === 14 && isSevenPairs(testKinds)) {
      waits.push(k);
    }
  }
  return waits;
}

/**
 * Analyze all discard options for the current hand.
 * Returns only discards that result in tenpai, sorted by best options first.
 */
export function analyzeDiscards(
  hand: TileId[],
  melds: Meld[],
  roundWind: Wind,
  seatWind: Wind,
  isRiichi: boolean,
): DiscardOption[] {
  const results: DiscardOption[] = [];
  const seen = new Set<TileKind>(); // avoid duplicate analysis for same kind

  for (const tileId of hand) {
    const kind = tileKind(tileId);
    if (seen.has(kind)) continue;
    seen.add(kind);

    // Hand after discarding this tile
    const remaining = hand.filter((t) => t !== tileId);
    const remainingKinds = remaining.map(tileKind);
    const shanten = calculateShanten(remainingKinds);

    if (shanten > 0) continue; // only show tenpai discards

    const waits = findWaitsGeneral(remainingKinds);
    if (waits.length === 0) continue;

    // Evaluate yaku for each waiting tile
    const waitInfos: WaitInfo[] = waits.map((waitKind) => {
      const winTileId = waitKind * 4; // dummy tileId for evaluation
      const fullHand = [...remaining, winTileId];

      const ctx: WinContext = {
        handTileIds: fullHand,
        melds,
        winTileId,
        isTsumo: true, // assume tsumo for yaku check
        isRiichi,
        isDoubleRiichi: false,
        isIppatsu: false,
        roundWind,
        seatWind,
        isFirstDraw: false,
        isLastTileDraw: false,
        isLastDiscard: false,
        isRinshan: false,
        isChankan: false,
      };

      const result = evaluateYaku(ctx);
      return {
        tileKind: waitKind,
        yaku: result.yaku.map((y) => ({ name: y.name, han: y.han })),
        totalHan: result.totalHan,
      };
    });

    results.push({
      tileId,
      shantenAfter: shanten,
      waits: waitInfos,
    });
  }

  // Sort: most waits first, then highest han
  results.sort((a, b) => {
    if (b.waits.length !== a.waits.length) return b.waits.length - a.waits.length;
    const maxHanA = Math.max(...a.waits.map((w) => w.totalHan), 0);
    const maxHanB = Math.max(...b.waits.map((w) => w.totalHan), 0);
    return maxHanB - maxHanA;
  });

  return results;
}

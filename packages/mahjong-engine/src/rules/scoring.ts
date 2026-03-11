import type { TileKind, TileId, Meld, SeatIndex } from "@mahjong/shared";
import { Wind, MeldType } from "@mahjong/shared";
import { RIICHI_DEPOSIT } from "@mahjong/shared";
import { tileKind, isTerminalOrHonor, isSimple, isDragonTile, isWindTile } from "../tile";
import type { HandDecomposition, Mentsu } from "../hand";
import { isSevenPairs } from "../hand";

export interface FuContext {
  decomposition: HandDecomposition | null;
  melds: Meld[];
  winTileKind: TileKind;
  isTsumo: boolean;
  isMenzen: boolean;
  isPinfu: boolean;
  roundWind: Wind;
  seatWind: Wind;
  isChiitoi: boolean;
}

/**
 * Calculate fu (符) for a winning hand.
 */
export function calculateFu(ctx: FuContext): number {
  // Seven pairs is always 25 fu
  if (ctx.isChiitoi) return 25;

  if (!ctx.decomposition) return 30;

  let fu = 30; // base fu (fuu-tei)

  // Menzen ron bonus
  if (ctx.isMenzen && !ctx.isTsumo) {
    fu += 10;
  }

  // Tsumo bonus (except pinfu)
  if (ctx.isTsumo && !ctx.isPinfu) {
    fu += 2;
  }

  // Pair fu
  const pair = ctx.decomposition.pair;
  if (isDragonTile(pair)) fu += 2;
  if (pair === 27 + ctx.roundWind) fu += 2; // round wind
  if (pair === 27 + ctx.seatWind) fu += 2; // seat wind (can stack)

  // Mentsu fu (closed hand groups)
  for (const m of ctx.decomposition.mentsu) {
    fu += mentsuFu(m, true);
  }

  // Open melds fu
  for (const m of ctx.melds) {
    fu += meldFu(m);
  }

  // Wait fu
  fu += waitFu(ctx.decomposition, ctx.winTileKind);

  // Pinfu tsumo is exactly 20
  if (ctx.isPinfu && ctx.isTsumo) return 20;

  // Open hand with no fu: minimum 30 (nashi-nashi)
  // Round up to nearest 10
  return Math.ceil(fu / 10) * 10;
}

function mentsuFu(m: Mentsu, isClosed: boolean): number {
  if (m.type === "shuntsu") return 0;
  // Koutsu
  const base = isTerminalOrHonor(m.tiles[0]) ? 8 : 4;
  return isClosed ? base : base / 2;
}

function meldFu(m: Meld): number {
  const kind = tileKind(m.tiles[0]);
  const isYaochu = isTerminalOrHonor(kind);

  switch (m.type) {
    case MeldType.CHI:
      return 0;
    case MeldType.PON:
      return isYaochu ? 4 : 2;
    case MeldType.KAN_OPEN:
    case MeldType.KAN_ADDED:
      return isYaochu ? 16 : 8;
    case MeldType.KAN_CLOSED:
      return isYaochu ? 32 : 16;
    default:
      return 0;
  }
}

function waitFu(dec: HandDecomposition, winTileKind: TileKind): number {
  // Check if the wait is a "bad" wait (kanchan, penchan, tanki) -> 2 fu
  // Good waits (ryanmen, shanpon) -> 0 fu

  // Tanki (pair wait)
  if (dec.pair === winTileKind) return 2;

  for (const m of dec.mentsu) {
    if (!m.tiles.includes(winTileKind)) continue;
    if (m.type === "koutsu") return 0; // shanpon wait

    if (m.type === "shuntsu") {
      const sorted = [...m.tiles].sort((a, b) => a - b);
      const pos = sorted.indexOf(winTileKind);
      // Kanchan (middle)
      if (pos === 1) return 2;
      // Penchan (edge)
      if (pos === 0 && sorted[2] % 9 === 8) return 2; // 789 wait on 7
      if (pos === 2 && sorted[0] % 9 === 0) return 2; // 123 wait on 3
      // Otherwise ryanmen
      return 0;
    }
  }
  return 0;
}

// ===== Point Calculation =====

export interface ScoreResult {
  /** Base points (basic score before multiplier) */
  basePoints: number;
  /** Points the loser(s) pay */
  payment: PaymentResult;
  /** Total han */
  han: number;
  /** Total fu */
  fu: number;
}

export interface PaymentResult {
  /** For ron: single player pays this */
  ron?: number;
  /** For tsumo (dealer): each non-dealer pays this */
  tsumoAll?: number;
  /** For tsumo (non-dealer): dealer pays this */
  tsumoDealer?: number;
  /** For tsumo (non-dealer): each non-dealer pays this */
  tsumoNonDealer?: number;
}

/**
 * Calculate the base points from han and fu.
 */
export function calculateBasePoints(han: number, fu: number): number {
  if (han >= 13) return 8000; // yakuman
  if (han >= 11) return 6000; // sanbaiman
  if (han >= 8) return 4000; // baiman
  if (han >= 6) return 3000; // haneman
  if (han >= 5) return 2000; // mangan

  // Regular calculation: fu * 2^(han+2)
  const base = fu * Math.pow(2, han + 2);
  return Math.min(base, 2000); // cap at mangan
}

/**
 * Calculate payment for a win.
 */
export function calculatePayment(
  basePoints: number,
  isDealer: boolean,
  isTsumo: boolean,
  honba: number,
  riichiSticks: number
): PaymentResult {
  const honbaBonus = honba * 100;

  if (isTsumo) {
    if (isDealer) {
      // Dealer tsumo: everyone pays 2x base
      const each = roundUpTo100(basePoints * 2) + honbaBonus;
      return { tsumoAll: each };
    } else {
      // Non-dealer tsumo: dealer pays 2x, others pay 1x
      const fromDealer = roundUpTo100(basePoints * 2) + honbaBonus;
      const fromOthers = roundUpTo100(basePoints) + honbaBonus;
      return { tsumoDealer: fromDealer, tsumoNonDealer: fromOthers };
    }
  } else {
    // Ron
    const multiplier = isDealer ? 6 : 4;
    const total = roundUpTo100(basePoints * multiplier) + honbaBonus * 3;
    return { ron: total };
  }
}

/**
 * Calculate total payment including riichi sticks
 */
export function calculateTotalWinnings(
  payment: PaymentResult,
  riichiSticks: number
): number {
  const riichiBonus = riichiSticks * RIICHI_DEPOSIT;
  if (payment.ron !== undefined) {
    return payment.ron + riichiBonus;
  }
  if (payment.tsumoAll !== undefined) {
    return payment.tsumoAll * 3 + riichiBonus;
  }
  if (payment.tsumoDealer !== undefined && payment.tsumoNonDealer !== undefined) {
    return payment.tsumoDealer + payment.tsumoNonDealer * 2 + riichiBonus;
  }
  return 0;
}

/**
 * Calculate score changes for all players after a round win.
 */
export function calculateScoreChanges(
  winnerSeat: SeatIndex,
  loserSeat: SeatIndex | null,
  payment: PaymentResult,
  riichiSticks: number,
  riichiPlayers: SeatIndex[],
  dealerSeat: SeatIndex
): Record<number, number> {
  const changes: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const riichiBonus = riichiSticks * RIICHI_DEPOSIT;

  if (payment.ron !== undefined && loserSeat !== null) {
    changes[loserSeat] -= payment.ron;
    changes[winnerSeat] += payment.ron + riichiBonus;
  } else if (payment.tsumoAll !== undefined) {
    // Dealer tsumo
    for (let i = 0; i < 4; i++) {
      if (i !== winnerSeat) {
        changes[i] -= payment.tsumoAll;
        changes[winnerSeat] += payment.tsumoAll;
      }
    }
    changes[winnerSeat] += riichiBonus;
  } else if (
    payment.tsumoDealer !== undefined &&
    payment.tsumoNonDealer !== undefined
  ) {
    // Non-dealer tsumo
    for (let i = 0; i < 4; i++) {
      if (i === winnerSeat) continue;
      const amount = i === dealerSeat
        ? payment.tsumoDealer
        : payment.tsumoNonDealer;
      changes[i] -= amount;
      changes[winnerSeat] += amount;
    }
    changes[winnerSeat] += riichiBonus;
  }

  // Deduct riichi deposits from players who declared riichi
  for (const seat of riichiPlayers) {
    changes[seat] -= RIICHI_DEPOSIT;
  }

  return changes;
}

/**
 * Calculate uma + oka for final game scores.
 */
export function calculateUmaOka(
  scores: number[],
  returnPoints: number,
  uma: [number, number, number, number]
): { finalScores: number[]; umaScores: number[] } {
  // Create indexed array for sorting
  const indexed = scores.map((score, i) => ({ score, index: i }));
  indexed.sort((a, b) => b.score - a.score);

  const umaScores = new Array(4).fill(0);
  const finalScores = new Array(4).fill(0);

  for (let rank = 0; rank < 4; rank++) {
    const player = indexed[rank];
    // Oka: difference from return points, divided by 1000
    const okaScore = (player.score - returnPoints) / 1000;
    umaScores[player.index] = okaScore + uma[rank];
    finalScores[player.index] = okaScore + uma[rank];
  }

  return { finalScores, umaScores };
}

function roundUpTo100(n: number): number {
  return Math.ceil(n / 100) * 100;
}

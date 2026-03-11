/**
 * 三人麻雀 (Sanma / 3-player mahjong) type definitions.
 *
 * Key differences from 4-player:
 * - 3 players only (seats 0, 1, 2 = East, South, West)
 * - Man tiles 2-8 removed (keep 1m and 9m only)
 * - 108 tiles total (27 kinds × 4 copies)
 * - No chi (calling sequences)
 * - North wind (北) acts as nukidora (bonus dora tile)
 * - Tsumo payment split between 2 players
 */

import type { TileId, TileKind, Meld, GameRuleConfig } from "@mahjong/shared";
import { Wind, RoundPhase, GamePhase } from "@mahjong/shared";
import type { Wall } from "../wall";

/** Seat index for 3-player: 0=East, 1=South, 2=West */
export type SeatIndex3 = 0 | 1 | 2;

/** 3-player game rule config */
export interface SanmaRuleConfig {
  playerCount: 3;
  roundType: "east" | "south";
  startPoints: number;
  returnPoints: number;
  uma: [number, number, number]; // 3-element uma
  hasRedDora: boolean;
  hasOpenTanyao: boolean;
  hasNukidora: boolean; // 北抜きドラ
}

/** Full game state for 3-player */
export interface SanmaGameState {
  rules: SanmaRuleConfig;
  gamePhase: GamePhase;
  scores: [number, number, number];
  round: SanmaRoundState | null;
  roundWind: Wind;
  roundNumber: number;
  honba: number;
  riichiSticks: number;
  dealerSeat: SeatIndex3;
  seed: number;
  eventSequence: number;
}

/** Round state for 3-player */
export interface SanmaRoundState {
  phase: RoundPhase;
  wall: Wall;
  hands: [TileId[], TileId[], TileId[]];
  melds: [Meld[], Meld[], Meld[]];
  discards: [TileId[], TileId[], TileId[]];
  currentTurn: SeatIndex3;
  drawnTile: TileId | null;
  lastDiscard: { seat: SeatIndex3; tileId: TileId } | null;
  riichi: [boolean, boolean, boolean];
  ippatsu: [boolean, boolean, boolean];
  isFirstTurn: boolean;
  isAfterKan: boolean;
  pendingClaims: SanmaPendingClaim[];
  turnStartTime: number;
  kanCount: number;
  riichiDeclaredThisRound: SeatIndex3[];
  /** 北抜きドラ collected per player */
  nukidora: [TileId[], TileId[], TileId[]];
}

export interface SanmaPendingClaim {
  seat: SeatIndex3;
  action: string;
  tiles?: TileId[];
}

/** Tile kinds excluded in sanma: Man 2-8 (kinds 1-7) */
export const EXCLUDED_MAN_KINDS: TileKind[] = [1, 2, 3, 4, 5, 6, 7];

/** Valid tile kinds in sanma (27 kinds) */
export const SANMA_TILE_KINDS = 27;

/** Total tiles in sanma: 27 kinds × 4 = 108 */
export const SANMA_TOTAL_TILES = 108;

/** North wind tile kind (used as nukidora) */
export const NORTH_WIND_KIND: TileKind = 30;

/** Default rules for 3-player */
export const SANMA_DEFAULT_RULES: SanmaRuleConfig = {
  playerCount: 3,
  roundType: "south",
  startPoints: 35000,
  returnPoints: 40000,
  uma: [20, 0, -20],
  hasRedDora: true,
  hasOpenTanyao: true,
  hasNukidora: true,
};

/** Game events for 3-player (extends base events with nukidora) */
export type SanmaGameEvent =
  | { type: "GAME_START"; seed: number; rules: SanmaRuleConfig }
  | { type: "ROUND_START"; seed: number; dealerSeat: SeatIndex3 }
  | { type: "DRAW_TILE"; seat: SeatIndex3; tileId: TileId }
  | { type: "DISCARD"; seat: SeatIndex3; tileId: TileId }
  | { type: "PON"; seat: SeatIndex3; tiles: TileId[]; calledTile: TileId; fromSeat: SeatIndex3 }
  | { type: "KAN_OPEN"; seat: SeatIndex3; tiles: TileId[]; calledTile: TileId; fromSeat: SeatIndex3 }
  | { type: "KAN_CLOSED"; seat: SeatIndex3; tiles: TileId[] }
  | { type: "KAN_ADDED"; seat: SeatIndex3; tileId: TileId }
  | { type: "RIICHI"; seat: SeatIndex3; tileId: TileId }
  | { type: "NUKIDORA"; seat: SeatIndex3; tileId: TileId } // 北抜き
  | {
      type: "TSUMO";
      seat: SeatIndex3;
      yaku: { name: string; han: number }[];
      han: number;
      fu: number;
      score: number;
      scoreChanges: Record<number, number>;
    }
  | {
      type: "RON";
      winners: {
        seat: SeatIndex3;
        yaku: { name: string; han: number }[];
        han: number;
        fu: number;
        score: number;
      }[];
      loserSeat: SeatIndex3;
      scoreChanges: Record<number, number>;
    }
  | { type: "DRAW_ROUND"; reason: string; tenpaiPlayers: SeatIndex3[]; scoreChanges: Record<number, number> }
  | { type: "SKIP_CLAIM"; seat: SeatIndex3 }
  | { type: "AUTO_DISCARD"; seat: SeatIndex3; tileId: TileId }
  | { type: "GAME_END"; finalScores: number[] };

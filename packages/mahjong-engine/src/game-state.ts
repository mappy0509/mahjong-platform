import type { TileId, TileKind, SeatIndex, Meld, GameRuleConfig } from "@mahjong/shared";
import { Wind, RoundPhase, ActionType, MeldType, RoundEndReason, GamePhase } from "@mahjong/shared";
import type { Wall } from "./wall";

/**
 * Full game state (server-only, never sent directly to clients).
 */
export interface GameState {
  /** Game configuration */
  rules: GameRuleConfig;

  /** Current game phase */
  gamePhase: GamePhase;

  /** Scores for each player */
  scores: [number, number, number, number];

  /** Current round state (null when between rounds) */
  round: RoundState | null;

  /** Round wind: East=0, South=1 */
  roundWind: Wind;

  /** Round number within the wind (0-3) */
  roundNumber: number;

  /** Honba counter (consecutive dealer wins/draws) */
  honba: number;

  /** Riichi stick pool */
  riichiSticks: number;

  /** Dealer seat index */
  dealerSeat: SeatIndex;

  /** Seed for deterministic replay */
  seed: number;

  /** Sequence counter for events */
  eventSequence: number;

  /** Seat assignment (shuffled wind order). seatWinds[seatIndex] = Wind */
  seatWinds: [Wind, Wind, Wind, Wind];

  /** Last dice roll result */
  diceResult: [number, number];

  /** Wall break position calculated from dice */
  wallBreakPosition: number;
}

export interface RoundState {
  /** Round phase */
  phase: RoundPhase;

  /** The tile wall */
  wall: Wall;

  /** Player hands (tile IDs) */
  hands: [TileId[], TileId[], TileId[], TileId[]];

  /** Open melds per player */
  melds: [Meld[], Meld[], Meld[], Meld[]];

  /** Discards per player (in order) */
  discards: [TileId[], TileId[], TileId[], TileId[]];

  /** Current turn (seat index) */
  currentTurn: SeatIndex;

  /** The tile just drawn (null if none) */
  drawnTile: TileId | null;

  /** Last discarded tile info */
  lastDiscard: { seat: SeatIndex; tileId: TileId } | null;

  /** Riichi state per player */
  riichi: [boolean, boolean, boolean, boolean];

  /** Ippatsu eligibility per player */
  ippatsu: [boolean, boolean, boolean, boolean];

  /** First turn flags per player (for tenhou/chiihou) */
  isFirstTurn: boolean;

  /** Whether the last action was a kan (for rinshan) */
  isAfterKan: boolean;

  /** Pending claims from other players */
  pendingClaims: PendingClaim[];

  /** Turn timer start timestamp */
  turnStartTime: number;

  /** Number of consecutive kans in this round */
  kanCount: number;

  /** Players who declared riichi this round (for stick tracking) */
  /** Players who declared riichi this round (for stick tracking) */
  riichiDeclaredThisRound: SeatIndex[];

  /** Players who have skipped their claim window for the current discard */
  skippedClaims: SeatIndex[];
}

export interface PendingClaim {
  seat: SeatIndex;
  action: ActionType;
  tiles?: TileId[];
}

// ===== Game Events =====

export type GameEvent =
  | { type: "GAME_START"; seed: number; rules: GameRuleConfig; seatWinds: [Wind, Wind, Wind, Wind] }
  | { type: "ROUND_START"; seed: number; dealerSeat: SeatIndex; diceResult: [number, number]; wallBreakPosition: number }
  | { type: "DRAW_TILE"; seat: SeatIndex; tileId: TileId }
  | { type: "DISCARD"; seat: SeatIndex; tileId: TileId }
  | { type: "CHI"; seat: SeatIndex; tiles: TileId[]; calledTile: TileId; fromSeat: SeatIndex }
  | { type: "PON"; seat: SeatIndex; tiles: TileId[]; calledTile: TileId; fromSeat: SeatIndex }
  | { type: "KAN_OPEN"; seat: SeatIndex; tiles: TileId[]; calledTile: TileId; fromSeat: SeatIndex }
  | { type: "KAN_CLOSED"; seat: SeatIndex; tiles: TileId[] }
  | { type: "KAN_ADDED"; seat: SeatIndex; tileId: TileId }
  | { type: "RIICHI"; seat: SeatIndex; tileId: TileId }
  | {
    type: "TSUMO";
    seat: SeatIndex;
    yaku: { name: string; han: number }[];
    han: number;
    fu: number;
    score: number;
    scoreChanges: Record<number, number>;
  }
  | {
    type: "RON";
    winners: {
      seat: SeatIndex;
      yaku: { name: string; han: number }[];
      han: number;
      fu: number;
      score: number;
    }[];
    loserSeat: SeatIndex;
    scoreChanges: Record<number, number>;
  }
  | { type: "DRAW_ROUND"; reason: RoundEndReason; tenpaiPlayers: SeatIndex[]; scoreChanges: Record<number, number> }
  | { type: "SKIP_CLAIM"; seat: SeatIndex }
  | { type: "AUTO_DISCARD"; seat: SeatIndex; tileId: TileId }
  | { type: "GAME_END"; finalScores: number[] };

/**
 * 三人麻雀 game reducer.
 * Pure function: (state, event) => newState
 * Adapted for 3 players with nukidora support.
 */

import type { TileId, Meld } from "@mahjong/shared";
import { Wind, RoundPhase, MeldType, GamePhase } from "@mahjong/shared";
import { HAND_SIZE, RIICHI_DEPOSIT } from "@mahjong/shared";
import { drawTile } from "../wall";
import { tileKind, sortTileIds } from "../tile";
import type {
  SeatIndex3,
  SanmaGameState,
  SanmaRoundState,
  SanmaGameEvent,
  SanmaRuleConfig,
} from "./types";
import { SANMA_DEFAULT_RULES, NORTH_WIND_KIND } from "./types";
import { createSanmaWall } from "./wall";

const PLAYER_COUNT = 3;

export function sanmaReducer(
  state: SanmaGameState,
  event: SanmaGameEvent
): SanmaGameState {
  const newState = { ...state, eventSequence: state.eventSequence + 1 };

  switch (event.type) {
    case "GAME_START":
      return {
        ...newState,
        gamePhase: GamePhase.PLAYING,
        rules: event.rules,
        scores: [
          event.rules.startPoints,
          event.rules.startPoints,
          event.rules.startPoints,
        ],
        seed: event.seed,
        roundWind: Wind.EAST,
        roundNumber: 0,
        honba: 0,
        riichiSticks: 0,
        dealerSeat: 0 as SeatIndex3,
      };

    case "ROUND_START":
      return handleRoundStart(newState, event);

    case "DRAW_TILE":
      return handleDrawTile(newState, event);

    case "DISCARD":
    case "AUTO_DISCARD":
      return handleDiscard(newState, {
        seat: event.seat,
        tileId: event.tileId,
      });

    case "RIICHI":
      return handleRiichi(newState, event);

    case "PON":
      return handlePon(newState, event);

    case "KAN_OPEN":
      return handleKanOpen(newState, event);

    case "KAN_CLOSED":
      return handleKanClosed(newState, event);

    case "KAN_ADDED":
      return handleKanAdded(newState, event);

    case "NUKIDORA":
      return handleNukidora(newState, event);

    case "TSUMO":
      return handleTsumo(newState, event);

    case "RON":
      return handleRon(newState, event);

    case "DRAW_ROUND":
      return handleDrawRound(newState, event);

    case "SKIP_CLAIM":
      return handleSkipClaim(newState, event);

    case "GAME_END":
      return { ...newState, gamePhase: GamePhase.FINISHED };

    default:
      return newState;
  }
}

function handleRoundStart(
  state: SanmaGameState,
  event: { seed: number; dealerSeat: SeatIndex3 }
): SanmaGameState {
  const wall = createSanmaWall(event.seed);

  // Deal 13 tiles to each of 3 players
  const hands: [TileId[], TileId[], TileId[]] = [[], [], []];
  let currentWall = wall;

  // 3 rounds of 4 tiles each
  for (let round = 0; round < 3; round++) {
    for (let seat = 0; seat < PLAYER_COUNT; seat++) {
      const dealSeat = ((event.dealerSeat + seat) % PLAYER_COUNT) as SeatIndex3;
      for (let i = 0; i < 4; i++) {
        const result = drawTile(currentWall);
        if (result) {
          hands[dealSeat].push(result.tile);
          currentWall = result.wall;
        }
      }
    }
  }
  // Last tile for each player
  for (let seat = 0; seat < PLAYER_COUNT; seat++) {
    const dealSeat = ((event.dealerSeat + seat) % PLAYER_COUNT) as SeatIndex3;
    const result = drawTile(currentWall);
    if (result) {
      hands[dealSeat].push(result.tile);
      currentWall = result.wall;
    }
  }

  // Sort each hand
  for (let i = 0; i < PLAYER_COUNT; i++) {
    hands[i] = sortTileIds(hands[i]);
  }

  const roundState: SanmaRoundState = {
    phase: RoundPhase.DRAW,
    wall: currentWall,
    hands,
    melds: [[], [], []],
    discards: [[], [], []],
    currentTurn: event.dealerSeat,
    drawnTile: null,
    lastDiscard: null,
    riichi: [false, false, false],
    ippatsu: [false, false, false],
    isFirstTurn: true,
    isAfterKan: false,
    pendingClaims: [],
    turnStartTime: Date.now(),
    kanCount: 0,
    riichiDeclaredThisRound: [],
    nukidora: [[], [], []],
  };

  return {
    ...state,
    gamePhase: GamePhase.PLAYING,
    round: roundState,
    dealerSeat: event.dealerSeat,
  };
}

function handleDrawTile(
  state: SanmaGameState,
  event: { seat: SeatIndex3; tileId: TileId }
): SanmaGameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as SanmaRoundState["hands"];
  hands[event.seat] = [...hands[event.seat], event.tileId];

  return {
    ...state,
    round: {
      ...round,
      hands,
      currentTurn: event.seat,
      drawnTile: event.tileId,
      phase: RoundPhase.DISCARD,
      turnStartTime: Date.now(),
    },
  };
}

function handleDiscard(
  state: SanmaGameState,
  event: { seat: SeatIndex3; tileId: TileId }
): SanmaGameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as SanmaRoundState["hands"];
  const discards = [...round.discards] as SanmaRoundState["discards"];

  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx === -1) return state;
  handCopy.splice(idx, 1);
  hands[event.seat] = sortTileIds(handCopy);

  discards[event.seat] = [...discards[event.seat], event.tileId];

  const ippatsu = [...round.ippatsu] as SanmaRoundState["ippatsu"];

  return {
    ...state,
    round: {
      ...round,
      hands,
      discards,
      drawnTile: null,
      lastDiscard: { seat: event.seat, tileId: event.tileId },
      phase: RoundPhase.CLAIM,
      ippatsu,
      isFirstTurn: false,
      isAfterKan: false,
      pendingClaims: [],
      turnStartTime: Date.now(),
    },
  };
}

function handleRiichi(
  state: SanmaGameState,
  event: { seat: SeatIndex3; tileId: TileId }
): SanmaGameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const riichi = [...round.riichi] as SanmaRoundState["riichi"];
  const ippatsu = [...round.ippatsu] as SanmaRoundState["ippatsu"];
  const riichiDeclared = [...round.riichiDeclaredThisRound];

  riichi[event.seat] = true;
  ippatsu[event.seat] = true;
  riichiDeclared.push(event.seat);

  return handleDiscard(
    {
      ...state,
      round: {
        ...round,
        riichi,
        ippatsu,
        riichiDeclaredThisRound: riichiDeclared,
      },
    },
    { seat: event.seat, tileId: event.tileId }
  );
}

function handleNukidora(
  state: SanmaGameState,
  event: { seat: SeatIndex3; tileId: TileId }
): SanmaGameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as SanmaRoundState["hands"];
  const nukidora = [...round.nukidora] as SanmaRoundState["nukidora"];

  // Remove north tile from hand
  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx === -1) return state;
  handCopy.splice(idx, 1);
  hands[event.seat] = handCopy;

  // Add to nukidora pile
  nukidora[event.seat] = [...nukidora[event.seat], event.tileId];

  return {
    ...state,
    round: {
      ...round,
      hands,
      nukidora,
      // After nukidora, player needs to draw a replacement tile
      phase: RoundPhase.KAN, // reuse KAN phase for replacement draw
      isAfterKan: false,
      turnStartTime: Date.now(),
    },
  };
}

function handlePon(
  state: SanmaGameState,
  event: {
    seat: SeatIndex3;
    tiles: TileId[];
    calledTile: TileId;
    fromSeat: SeatIndex3;
  }
): SanmaGameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as SanmaRoundState["hands"];
  const melds = [...round.melds] as SanmaRoundState["melds"];

  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    if (t === event.calledTile) continue;
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;

  const meld: Meld = {
    type: MeldType.PON,
    tiles: event.tiles,
    fromPlayer: event.fromSeat,
    calledTile: event.calledTile,
  };
  melds[event.seat] = [...melds[event.seat], meld];

  const discards = [...round.discards] as SanmaRoundState["discards"];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;

  const ippatsu: SanmaRoundState["ippatsu"] = [false, false, false];

  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      discards,
      currentTurn: event.seat,
      phase: RoundPhase.DISCARD,
      drawnTile: null,
      lastDiscard: null,
      ippatsu,
      isFirstTurn: false,
      isAfterKan: false,
      pendingClaims: [],
      turnStartTime: Date.now(),
    },
  };
}

function handleKanOpen(
  state: SanmaGameState,
  event: {
    seat: SeatIndex3;
    tiles: TileId[];
    calledTile: TileId;
    fromSeat: SeatIndex3;
  }
): SanmaGameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as SanmaRoundState["hands"];
  const melds = [...round.melds] as SanmaRoundState["melds"];

  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    if (t === event.calledTile) continue;
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;

  const meld: Meld = {
    type: MeldType.KAN_OPEN,
    tiles: event.tiles,
    fromPlayer: event.fromSeat,
    calledTile: event.calledTile,
  };
  melds[event.seat] = [...melds[event.seat], meld];

  const discards = [...round.discards] as SanmaRoundState["discards"];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;

  const ippatsu: SanmaRoundState["ippatsu"] = [false, false, false];

  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      discards,
      currentTurn: event.seat,
      phase: RoundPhase.KAN,
      drawnTile: null,
      lastDiscard: null,
      ippatsu,
      isFirstTurn: false,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      pendingClaims: [],
      turnStartTime: Date.now(),
    },
  };
}

function handleKanClosed(
  state: SanmaGameState,
  event: { seat: SeatIndex3; tiles: TileId[] }
): SanmaGameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as SanmaRoundState["hands"];
  const melds = [...round.melds] as SanmaRoundState["melds"];

  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;

  const meld: Meld = {
    type: MeldType.KAN_CLOSED,
    tiles: event.tiles,
  };
  melds[event.seat] = [...melds[event.seat], meld];

  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      currentTurn: event.seat,
      phase: RoundPhase.KAN,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      turnStartTime: Date.now(),
    },
  };
}

function handleKanAdded(
  state: SanmaGameState,
  event: { seat: SeatIndex3; tileId: TileId }
): SanmaGameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as SanmaRoundState["hands"];
  const melds = [...round.melds] as SanmaRoundState["melds"];

  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx !== -1) handCopy.splice(idx, 1);
  hands[event.seat] = handCopy;

  const meldsCopy = [...melds[event.seat]];
  const kind = tileKind(event.tileId);
  const ponIdx = meldsCopy.findIndex(
    (m) => m.type === MeldType.PON && tileKind(m.tiles[0]) === kind
  );
  if (ponIdx !== -1) {
    meldsCopy[ponIdx] = {
      ...meldsCopy[ponIdx],
      type: MeldType.KAN_ADDED,
      tiles: [...meldsCopy[ponIdx].tiles, event.tileId],
    };
  }
  melds[event.seat] = meldsCopy;

  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      currentTurn: event.seat,
      phase: RoundPhase.KAN,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      turnStartTime: Date.now(),
    },
  };
}

function handleTsumo(
  state: SanmaGameState,
  event: { seat: SeatIndex3; scoreChanges: Record<number, number> }
): SanmaGameState {
  const scores = [...state.scores] as SanmaGameState["scores"];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }

  return {
    ...state,
    scores,
    gamePhase: GamePhase.ROUND_RESULT,
    riichiSticks: 0,
    round: state.round
      ? { ...state.round, phase: RoundPhase.ROUND_END }
      : null,
  };
}

function handleRon(
  state: SanmaGameState,
  event: { scoreChanges: Record<number, number> }
): SanmaGameState {
  const scores = [...state.scores] as SanmaGameState["scores"];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }

  return {
    ...state,
    scores,
    gamePhase: GamePhase.ROUND_RESULT,
    riichiSticks: 0,
    round: state.round
      ? { ...state.round, phase: RoundPhase.ROUND_END }
      : null,
  };
}

function handleDrawRound(
  state: SanmaGameState,
  event: {
    reason: string;
    tenpaiPlayers: SeatIndex3[];
    scoreChanges: Record<number, number>;
  }
): SanmaGameState {
  const scores = [...state.scores] as SanmaGameState["scores"];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }

  return {
    ...state,
    scores,
    gamePhase: GamePhase.ROUND_RESULT,
    round: state.round
      ? { ...state.round, phase: RoundPhase.ROUND_END }
      : null,
  };
}

function handleSkipClaim(
  state: SanmaGameState,
  event: { seat: SeatIndex3 }
): SanmaGameState {
  if (!state.round) return state;

  const pendingClaims = state.round.pendingClaims.filter(
    (c) => c.seat !== event.seat
  );

  return {
    ...state,
    round: {
      ...state.round,
      pendingClaims,
    },
  };
}

/** Create the initial game state for 3-player. */
export function createSanmaInitialState(): SanmaGameState {
  return {
    rules: { ...SANMA_DEFAULT_RULES },
    gamePhase: GamePhase.WAITING,
    scores: [
      SANMA_DEFAULT_RULES.startPoints,
      SANMA_DEFAULT_RULES.startPoints,
      SANMA_DEFAULT_RULES.startPoints,
    ],
    round: null,
    roundWind: Wind.EAST,
    roundNumber: 0,
    honba: 0,
    riichiSticks: 0,
    dealerSeat: 0 as SeatIndex3,
    seed: 0,
    eventSequence: 0,
  };
}

/** Advance to next round after round result. */
export function advanceSanmaRound(
  state: SanmaGameState,
  dealerWon: boolean
): SanmaGameState {
  let { roundWind, roundNumber, honba, dealerSeat } = state;

  if (dealerWon) {
    honba++;
  } else {
    dealerSeat = ((dealerSeat + 1) % PLAYER_COUNT) as SeatIndex3;
    if (dealerSeat === 0) {
      roundNumber++;
      if (roundNumber >= PLAYER_COUNT) {
        roundNumber = 0;
        roundWind = (roundWind + 1) as Wind;
      }
    }
    honba++;
  }

  // Check if game should end
  const maxWind = state.rules.roundType === "east" ? Wind.SOUTH : Wind.WEST;
  if (roundWind >= maxWind) {
    return { ...state, gamePhase: GamePhase.GAME_RESULT };
  }

  return {
    ...state,
    roundWind,
    roundNumber,
    honba,
    dealerSeat,
    gamePhase: GamePhase.PLAYING,
    round: null,
  };
}

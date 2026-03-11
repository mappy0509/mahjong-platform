import type { TileId, SeatIndex, Meld } from "@mahjong/shared";
import {
  Wind,
  RoundPhase,
  ActionType,
  MeldType,
  RoundEndReason,
  GamePhase,
} from "@mahjong/shared";
import { INITIAL_POINTS, HAND_SIZE, RIICHI_DEPOSIT } from "@mahjong/shared";
import type { GameState, RoundState, GameEvent } from "./game-state";
import { createWall, drawTile, drawFromDeadWall, tilesRemaining, rollDice, calculateWallBreakPosition } from "./wall";
import { tileKind, sortTileIds } from "./tile";

/**
 * Pure function: (state, event) => newState
 * The game reducer processes events to produce new state.
 */
export function gameReducer(state: GameState, event: GameEvent): GameState {
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
          event.rules.startPoints,
        ],
        seed: event.seed,
        roundWind: Wind.EAST,
        roundNumber: 0,
        honba: 0,
        riichiSticks: 0,
        dealerSeat: 0 as SeatIndex,
        seatWinds: event.seatWinds,
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

    case "CHI":
      return handleChi(newState, event);

    case "PON":
      return handlePon(newState, event);

    case "KAN_OPEN":
      return handleKanOpen(newState, event);

    case "KAN_CLOSED":
      return handleKanClosed(newState, event);

    case "KAN_ADDED":
      return handleKanAdded(newState, event);

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
  state: GameState,
  event: { seed: number; dealerSeat: SeatIndex; diceResult: [number, number]; wallBreakPosition: number }
): GameState {
  const wall = createWall(event.seed, event.wallBreakPosition);

  // Deal 13 tiles to each player
  const hands: [TileId[], TileId[], TileId[], TileId[]] = [[], [], [], []];
  let currentWall = wall;

  for (let round = 0; round < 3; round++) {
    for (let seat = 0; seat < 4; seat++) {
      const dealSeat = ((event.dealerSeat + seat) % 4) as SeatIndex;
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
  for (let seat = 0; seat < 4; seat++) {
    const dealSeat = ((event.dealerSeat + seat) % 4) as SeatIndex;
    const result = drawTile(currentWall);
    if (result) {
      hands[dealSeat].push(result.tile);
      currentWall = result.wall;
    }
  }

  // Sort each hand
  for (let i = 0; i < 4; i++) {
    hands[i] = sortTileIds(hands[i]);
  }

  const round: RoundState = {
    phase: RoundPhase.DRAW,
    wall: currentWall,
    hands,
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    currentTurn: event.dealerSeat,
    drawnTile: null,
    lastDiscard: null,
    riichi: [false, false, false, false],
    ippatsu: [false, false, false, false],
    isFirstTurn: true,
    isAfterKan: false,
    pendingClaims: [],
    turnStartTime: Date.now(),
    kanCount: 0,
    riichiDeclaredThisRound: [],
    skippedClaims: [],
  };

  return {
    ...state,
    gamePhase: GamePhase.PLAYING,
    round,
    dealerSeat: event.dealerSeat,
    diceResult: event.diceResult,
    wallBreakPosition: event.wallBreakPosition,
  };
}

function handleDrawTile(
  state: GameState,
  event: { seat: SeatIndex; tileId: TileId }
): GameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as RoundState["hands"];
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
  state: GameState,
  event: { seat: SeatIndex; tileId: TileId }
): GameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as RoundState["hands"];
  const discards = [...round.discards] as RoundState["discards"];

  // Remove tile from hand
  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx === -1) return state;
  handCopy.splice(idx, 1);
  hands[event.seat] = sortTileIds(handCopy);

  // Add to discards
  discards[event.seat] = [...discards[event.seat], event.tileId];

  // Clear ippatsu for this player if they discard after riichi
  const ippatsu = [...round.ippatsu] as RoundState["ippatsu"];

  // After first discard by any player, first turn is over
  const isFirstTurn = round.isFirstTurn && event.seat === state.dealerSeat && round.discards[event.seat].length === 0;

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
      skippedClaims: [],
      turnStartTime: Date.now(),
    },
  };
}

function handleRiichi(
  state: GameState,
  event: { seat: SeatIndex; tileId: TileId }
): GameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const riichi = [...round.riichi] as RoundState["riichi"];
  const ippatsu = [...round.ippatsu] as RoundState["ippatsu"];
  const riichiDeclared = [...round.riichiDeclaredThisRound];

  riichi[event.seat] = true;
  ippatsu[event.seat] = true;
  riichiDeclared.push(event.seat);

  // Deduct 1000 points from declaring player and add to riichi stick pool
  const scores = [...state.scores] as GameState["scores"];
  scores[event.seat] -= RIICHI_DEPOSIT;

  // Then discard the tile
  const afterDiscard = handleDiscard(
    {
      ...state,
      scores,
      riichiSticks: state.riichiSticks + 1,
      round: { ...round, riichi, ippatsu, riichiDeclaredThisRound: riichiDeclared },
    },
    { seat: event.seat, tileId: event.tileId }
  );

  return afterDiscard;
}

function handleChi(
  state: GameState,
  event: { seat: SeatIndex; tiles: TileId[]; calledTile: TileId; fromSeat: SeatIndex }
): GameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as RoundState["hands"];
  const melds = [...round.melds] as RoundState["melds"];

  // Remove tiles from hand (excluding the called tile which comes from discard)
  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    if (t === event.calledTile) continue;
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;

  // Add meld
  const meld: Meld = {
    type: MeldType.CHI,
    tiles: event.tiles,
    fromPlayer: event.fromSeat,
    calledTile: event.calledTile,
  };
  melds[event.seat] = [...melds[event.seat], meld];

  // Remove called tile from discards
  const discards = [...round.discards] as RoundState["discards"];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;

  // Break ippatsu for all players
  const ippatsu: RoundState["ippatsu"] = [false, false, false, false];

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

function handlePon(
  state: GameState,
  event: { seat: SeatIndex; tiles: TileId[]; calledTile: TileId; fromSeat: SeatIndex }
): GameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as RoundState["hands"];
  const melds = [...round.melds] as RoundState["melds"];

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

  const discards = [...round.discards] as RoundState["discards"];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;

  const ippatsu: RoundState["ippatsu"] = [false, false, false, false];

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
  state: GameState,
  event: { seat: SeatIndex; tiles: TileId[]; calledTile: TileId; fromSeat: SeatIndex }
): GameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as RoundState["hands"];
  const melds = [...round.melds] as RoundState["melds"];

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

  const discards = [...round.discards] as RoundState["discards"];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;

  const ippatsu: RoundState["ippatsu"] = [false, false, false, false];

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
  state: GameState,
  event: { seat: SeatIndex; tiles: TileId[] }
): GameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as RoundState["hands"];
  const melds = [...round.melds] as RoundState["melds"];

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
  state: GameState,
  event: { seat: SeatIndex; tileId: TileId }
): GameState {
  if (!state.round) return state;

  const round = { ...state.round };
  const hands = [...round.hands] as RoundState["hands"];
  const melds = [...round.melds] as RoundState["melds"];

  // Remove tile from hand
  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx !== -1) handCopy.splice(idx, 1);
  hands[event.seat] = handCopy;

  // Find the matching pon and upgrade to kan
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
  state: GameState,
  event: {
    seat: SeatIndex;
    scoreChanges: Record<number, number>;
  }
): GameState {
  const scores = [...state.scores] as GameState["scores"];
  for (let i = 0; i < 4; i++) {
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
  state: GameState,
  event: {
    scoreChanges: Record<number, number>;
  }
): GameState {
  const scores = [...state.scores] as GameState["scores"];
  for (let i = 0; i < 4; i++) {
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
  state: GameState,
  event: {
    reason: RoundEndReason;
    tenpaiPlayers: SeatIndex[];
    scoreChanges: Record<number, number>;
  }
): GameState {
  const scores = [...state.scores] as GameState["scores"];
  for (let i = 0; i < 4; i++) {
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
  state: GameState,
  event: { seat: SeatIndex }
): GameState {
  if (!state.round) return state;

  const pendingClaims = state.round.pendingClaims.filter(
    (c) => c.seat !== event.seat
  );

  const skippedClaims = [...(state.round.skippedClaims || []), event.seat];

  return {
    ...state,
    round: {
      ...state.round,
      pendingClaims,
      skippedClaims,
    },
  };
}

/**
 * Create the initial game state.
 */
export function createInitialState(): GameState {
  return {
    rules: {
      playerCount: 4,
      roundType: "south",
      startPoints: INITIAL_POINTS,
      returnPoints: 30000,
      uma: [30, 10, -10, -30],
      hasRedDora: true,
      hasOpenTanyao: true,
    },
    gamePhase: GamePhase.WAITING,
    scores: [INITIAL_POINTS, INITIAL_POINTS, INITIAL_POINTS, INITIAL_POINTS],
    round: null,
    roundWind: Wind.EAST,
    roundNumber: 0,
    honba: 0,
    riichiSticks: 0,
    dealerSeat: 0 as SeatIndex,
    seed: 0,
    eventSequence: 0,
    seatWinds: [Wind.EAST, Wind.SOUTH, Wind.WEST, Wind.NORTH],
    diceResult: [1, 1],
    wallBreakPosition: 0,
  };
}

/**
 * Advance to next round (called after round result).
 * @param dealerWon - true if the dealer won or was tenpai on a draw
 * @param isDraw - true if the round ended in a draw (流局)
 */
export function advanceRound(state: GameState, dealerWon: boolean, isDraw: boolean = false): GameState {
  let { roundWind, roundNumber, honba, dealerSeat } = state;

  // Check トビ (bust) - any player below 0 ends the game immediately
  if (state.scores.some(s => s < 0)) {
    return { ...state, gamePhase: GamePhase.GAME_RESULT, round: null };
  }

  if (dealerWon) {
    // 連荘: Dealer stays, honba increases
    honba++;
  } else {
    // 親流れ: Dealer rotates, advance round number
    dealerSeat = ((dealerSeat + 1) % 4) as SeatIndex;
    roundNumber++;
    if (roundNumber >= 4) {
      // Wind rotation complete (東4局 → 南1局, or 南4局 → game end)
      roundNumber = 0;
      roundWind = (roundWind + 1) as Wind;
    }
    // On draw: honba carries over and increments
    // On win (non-dealer): honba resets to 0
    honba = isDraw ? honba + 1 : 0;
  }

  // Check if game should end (advanced past the last wind)
  const maxWind = state.rules.roundType === "east" ? Wind.SOUTH : Wind.WEST;
  if (roundWind >= maxWind) {
    return { ...state, gamePhase: GamePhase.GAME_RESULT, round: null };
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

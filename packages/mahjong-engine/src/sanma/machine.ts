/**
 * 三人麻雀 GameMachine.
 * Orchestrates the 3-player game flow.
 *
 * Key differences from 4-player:
 * - No chi (sequences from previous player's discard)
 * - North wind (北) acts as nukidora (bonus dora)
 * - Tsumo payment split between 2 non-winners
 * - 3 player rotation (% 3)
 */

import type { TileId, TileKind, Meld, PlayerGameView, PlayerView, SeatIndex } from "@mahjong/shared";
import {
  Wind,
  RoundPhase,
  ActionType,
  MeldType,
  GamePhase,
  RoundEndReason,
} from "@mahjong/shared";
import { drawTile, drawFromDeadWall, tilesRemaining, getDoraIndicators } from "../wall";
import { tileKind, sortTileIds, countByKind, isRedDora, doraFromIndicator } from "../tile";
import { isWinningHand, isTenpai } from "../hand";
import { evaluateYaku, type WinContext } from "../rules/yaku-evaluator";
import {
  calculateFu,
  calculateBasePoints,
  calculatePayment,
  calculateTotalWinnings,
} from "../rules/scoring";
import type {
  SeatIndex3,
  SanmaGameState,
  SanmaRoundState,
  SanmaGameEvent,
  SanmaRuleConfig,
} from "./types";
import { NORTH_WIND_KIND } from "./types";
import { sanmaReducer, createSanmaInitialState, advanceSanmaRound } from "./reducer";

const PLAYER_COUNT = 3;

export interface SanmaGameAction {
  seat: SeatIndex3;
  action: ActionType;
  tileId?: TileId;
  tiles?: TileId[];
}

/**
 * SanmaGameMachine orchestrates the 3-player game flow.
 */
export class SanmaGameMachine {
  private state: SanmaGameState;
  private eventLog: SanmaGameEvent[] = [];

  constructor(state?: SanmaGameState) {
    this.state = state ?? createSanmaInitialState();
  }

  getState(): SanmaGameState {
    return this.state;
  }

  getEventLog(): SanmaGameEvent[] {
    return this.eventLog;
  }

  /** Start a new game. */
  startGame(seed: number, rules?: Partial<SanmaRuleConfig>): SanmaGameEvent[] {
    const fullRules: SanmaRuleConfig = {
      ...this.state.rules,
      ...rules,
    };
    const events: SanmaGameEvent[] = [];

    const startEvent: SanmaGameEvent = {
      type: "GAME_START",
      seed,
      rules: fullRules,
    };
    this.applyEvent(startEvent);
    events.push(startEvent);

    const roundEvents = this.startNewRound();
    events.push(...roundEvents);

    return events;
  }

  /** Start a new round. */
  startNewRound(): SanmaGameEvent[] {
    const events: SanmaGameEvent[] = [];
    const roundSeed = this.state.seed + this.state.eventSequence;

    const roundStart: SanmaGameEvent = {
      type: "ROUND_START",
      seed: roundSeed,
      dealerSeat: this.state.dealerSeat,
    };
    this.applyEvent(roundStart);
    events.push(roundStart);

    // Dealer draws first tile
    const drawEvents = this.doDraw(this.state.dealerSeat);
    events.push(...drawEvents);

    return events;
  }

  /** Process a player action. */
  processAction(action: SanmaGameAction): SanmaGameEvent[] {
    const available = this.getAvailableActions(action.seat);
    if (!available.includes(action.action)) {
      return [];
    }

    switch (action.action) {
      case ActionType.NUKIDORA:
        return this.handleNukidora(action.seat, action.tileId!);
      case ActionType.DISCARD:
        return this.handleDiscard(action.seat, action.tileId!);
      case ActionType.TSUMO:
        return this.handleTsumo(action.seat);
      case ActionType.RON:
        return this.handleRon(action.seat);
      case ActionType.RIICHI:
        return this.handleRiichi(action.seat, action.tileId!);
      case ActionType.PON:
        return this.handlePon(action.seat, action.tiles!);
      case ActionType.KAN_OPEN:
        return this.handleKanOpen(action.seat, action.tiles!);
      case ActionType.KAN_CLOSED:
        return this.handleKanClosed(action.seat, action.tiles!);
      case ActionType.KAN_ADDED:
        return this.handleKanAdded(action.seat, action.tileId!);
      case ActionType.SKIP:
        return this.handleSkip(action.seat);
      default:
        return [];
    }
  }

  /** Get available actions for a player (no chi in sanma). */
  getAvailableActions(seat: SeatIndex3): ActionType[] {
    const round = this.state.round;
    if (!round || this.state.gamePhase !== GamePhase.PLAYING) return [];

    const actions: ActionType[] = [];
    const hand = round.hands[seat];
    const handKinds = hand.map(tileKind);

    if (round.phase === RoundPhase.DISCARD && round.currentTurn === seat) {
      actions.push(ActionType.DISCARD);

      // Tsumo check
      if (round.drawnTile !== null) {
        if (isWinningHand(handKinds)) {
          actions.push(ActionType.TSUMO);
        }
      }

      // Nukidora check (can declare 北 as bonus dora)
      if (this.state.rules.hasNukidora && !round.riichi[seat]) {
        if (hand.some((t) => tileKind(t) === NORTH_WIND_KIND)) {
          actions.push(ActionType.NUKIDORA);
        }
      }

      // Riichi check
      if (
        !round.riichi[seat] &&
        isMenzen(round, seat) &&
        this.state.scores[seat] >= 1000
      ) {
        for (const tile of hand) {
          const remaining = hand.filter((t) => t !== tile).map(tileKind);
          if (isTenpai(remaining)) {
            actions.push(ActionType.RIICHI);
            break;
          }
        }
      }

      // Closed kan check
      const kanGroups = findClosedKanGroups(hand);
      if (kanGroups.length > 0 && !round.riichi[seat]) {
        actions.push(ActionType.KAN_CLOSED);
      }

      // Added kan check
      if (!round.riichi[seat]) {
        for (const meld of round.melds[seat]) {
          if (meld.type === MeldType.PON) {
            const ponKind = tileKind(meld.tiles[0]);
            if (hand.some((t) => tileKind(t) === ponKind)) {
              actions.push(ActionType.KAN_ADDED);
              break;
            }
          }
        }
      }
    }

    if (round.phase === RoundPhase.CLAIM && round.lastDiscard) {
      const discard = round.lastDiscard;
      if (discard.seat === seat) return actions;

      const discardKind = tileKind(discard.tileId);

      // Ron check
      const testHand = [...handKinds, discardKind];
      if (isWinningHand(testHand)) {
        actions.push(ActionType.RON);
      }

      // Pon check
      const kindCount = handKinds.filter((k) => k === discardKind).length;
      if (kindCount >= 2 && !round.riichi[seat]) {
        actions.push(ActionType.PON);
      }

      // Open kan check
      if (kindCount >= 3 && !round.riichi[seat]) {
        actions.push(ActionType.KAN_OPEN);
      }

      // NO CHI in sanma

      if (actions.length > 0) {
        actions.push(ActionType.SKIP);
      }
    }

    return actions;
  }

  /** Auto-discard for timeout/disconnect. */
  autoDiscard(seat: SeatIndex3): SanmaGameEvent[] {
    const round = this.state.round;
    if (
      !round ||
      round.currentTurn !== seat ||
      round.phase !== RoundPhase.DISCARD
    ) {
      return [];
    }

    const tileId =
      round.drawnTile ?? round.hands[seat][round.hands[seat].length - 1];
    if (tileId === undefined) return [];

    const event: SanmaGameEvent = { type: "AUTO_DISCARD", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }

  /** Auto-skip all pending claims. */
  autoSkipAllClaims(): SanmaGameEvent[] {
    const round = this.state.round;
    if (
      !round ||
      round.phase !== RoundPhase.CLAIM ||
      !round.lastDiscard
    ) {
      return [];
    }

    const events: SanmaGameEvent[] = [];
    for (let iter = 0; iter < PLAYER_COUNT; iter++) {
      const currentRound = this.state.round;
      if (
        !currentRound ||
        currentRound.phase !== RoundPhase.CLAIM ||
        !currentRound.lastDiscard
      )
        break;

      let skipped = false;
      for (let i = 1; i < PLAYER_COUNT; i++) {
        const s = ((currentRound.lastDiscard.seat + i) %
          PLAYER_COUNT) as SeatIndex3;
        const available = this.getAvailableActions(s);
        if (available.includes(ActionType.SKIP)) {
          const skipEvents = this.handleSkip(s);
          events.push(...skipEvents);
          skipped = true;
          break;
        }
      }
      if (!skipped) break;
    }
    return events;
  }

  /** Advance to next round. */
  advanceToNextRound(dealerWon: boolean): SanmaGameEvent[] {
    if (this.state.gamePhase !== GamePhase.ROUND_RESULT) {
      return [];
    }

    this.state = advanceSanmaRound(this.state, dealerWon);

    if (this.state.gamePhase === GamePhase.GAME_RESULT) {
      const event: SanmaGameEvent = {
        type: "GAME_END",
        finalScores: [...this.state.scores],
      };
      this.applyEvent(event);
      return [event];
    }

    return this.startNewRound();
  }

  isRoundOver(): boolean {
    return this.state.gamePhase === GamePhase.ROUND_RESULT;
  }

  isGameOver(): boolean {
    return (
      this.state.gamePhase === GamePhase.FINISHED ||
      this.state.gamePhase === GamePhase.GAME_RESULT
    );
  }

  /**
   * Generate a PlayerGameView (filtered view for a specific player).
   * Reuses the 4p PlayerGameView shape: players array has 3 entries,
   * mySeat / currentTurn use the SeatIndex (0-3) but only 0..2 are valid.
   */
  getPlayerView(seat: SeatIndex3, playerNames: string[]): PlayerGameView {
    const round = this.state.round;

    if (!round) {
      return {
        gamePhase: this.state.gamePhase,
        roundPhase: RoundPhase.DRAW,
        roundWind: this.state.roundWind,
        roundNumber: this.state.roundNumber,
        honba: this.state.honba,
        riichiSticks: this.state.riichiSticks,
        tilesRemaining: 0,
        doraIndicators: [],
        myHand: [],
        mySeat: seat as SeatIndex,
        myScore: this.state.scores[seat],
        players: playerNames.map((name, i) => ({
          seat: i as SeatIndex,
          name,
          score: this.state.scores[i] ?? 0,
          discards: [],
          melds: [],
          isRiichi: false,
          isConnected: true,
          handCount: 0,
        })),
        currentTurn: 0 as SeatIndex,
        availableActions: [],
        seatWinds: [Wind.EAST, Wind.SOUTH, Wind.WEST],
        dealerSeat: this.state.dealerSeat as SeatIndex,
      };
    }

    const players: PlayerView[] = playerNames.map((name, i) => ({
      seat: i as SeatIndex,
      name,
      score: this.state.scores[i] ?? 0,
      discards: round.discards[i] ?? [],
      melds: round.melds[i] ?? [],
      isRiichi: round.riichi[i] ?? false,
      isConnected: true,
      handCount: round.hands[i]?.length ?? 0,
    }));

    return {
      gamePhase: this.state.gamePhase,
      roundPhase: round.phase,
      roundWind: this.state.roundWind,
      roundNumber: this.state.roundNumber,
      honba: this.state.honba,
      riichiSticks: this.state.riichiSticks,
      tilesRemaining: tilesRemaining(round.wall),
      doraIndicators: getDoraIndicators(round.wall),
      myHand: sortTileIds(round.hands[seat]),
      mySeat: seat as SeatIndex,
      myScore: this.state.scores[seat],
      players,
      currentTurn: round.currentTurn as SeatIndex,
      lastDiscard: round.lastDiscard
        ? { seat: round.lastDiscard.seat as SeatIndex, tileId: round.lastDiscard.tileId }
        : undefined,
      availableActions: this.getAvailableActions(seat),
      seatWinds: [Wind.EAST, Wind.SOUTH, Wind.WEST],
      dealerSeat: this.state.dealerSeat as SeatIndex,
    };
  }

  // ===== Private handlers =====

  private applyEvent(event: SanmaGameEvent): void {
    this.state = sanmaReducer(this.state, event);
    this.eventLog.push(event);
  }

  private doDraw(seat: SeatIndex3): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    const result = drawTile(round.wall);
    if (!result) {
      return this.handleExhaustiveDraw();
    }

    this.state = {
      ...this.state,
      round: { ...round, wall: result.wall },
    };

    const event: SanmaGameEvent = {
      type: "DRAW_TILE",
      seat,
      tileId: result.tile,
    };
    this.applyEvent(event);
    return [event];
  }

  private doDrawFromDeadWall(seat: SeatIndex3): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    const result = drawFromDeadWall(round.wall);
    if (!result) return [];

    this.state = {
      ...this.state,
      round: { ...round, wall: result.wall },
    };

    const event: SanmaGameEvent = {
      type: "DRAW_TILE",
      seat,
      tileId: result.tile,
    };
    this.applyEvent(event);
    return [event];
  }

  private handleDiscard(
    seat: SeatIndex3,
    tileId: TileId
  ): SanmaGameEvent[] {
    const event: SanmaGameEvent = { type: "DISCARD", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }

  private handleRiichi(
    seat: SeatIndex3,
    tileId: TileId
  ): SanmaGameEvent[] {
    const event: SanmaGameEvent = { type: "RIICHI", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }

  private handleNukidora(
    seat: SeatIndex3,
    tileId: TileId
  ): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    // Verify tile is north wind
    if (tileKind(tileId) !== NORTH_WIND_KIND) return [];

    const events: SanmaGameEvent[] = [];
    const event: SanmaGameEvent = { type: "NUKIDORA", seat, tileId };
    this.applyEvent(event);
    events.push(event);

    // Draw replacement tile from dead wall
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);

    return events;
  }

  private afterDiscard(
    discardSeat: SeatIndex3,
    events: SanmaGameEvent[]
  ): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round) return events;

    let anyClaims = false;
    for (let i = 1; i < PLAYER_COUNT; i++) {
      const seat = ((discardSeat + i) % PLAYER_COUNT) as SeatIndex3;
      const available = this.getAvailableActions(seat);
      if (available.length > 0) {
        anyClaims = true;
      }
    }

    if (!anyClaims) {
      const nextSeat = ((discardSeat + 1) % PLAYER_COUNT) as SeatIndex3;
      const drawEvents = this.doDraw(nextSeat);
      events.push(...drawEvents);
    }

    return events;
  }

  private handleTsumo(seat: SeatIndex3): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    const hand = round.hands[seat];
    const winTile = round.drawnTile!;

    const winCtx: WinContext = {
      handTileIds: hand,
      melds: round.melds[seat],
      winTileId: winTile,
      isTsumo: true,
      isRiichi: round.riichi[seat],
      isDoubleRiichi: false,
      isIppatsu: round.ippatsu[seat],
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isFirstDraw: round.isFirstTurn,
      isLastTileDraw: tilesRemaining(round.wall) === 0,
      isLastDiscard: false,
      isRinshan: round.isAfterKan,
      isChankan: false,
    };

    const yakuResult = evaluateYaku(winCtx);
    if (yakuResult.yaku.length === 0) return [];

    const doraHan = countDora(
      hand,
      round.melds[seat],
      round,
      this.state.rules.hasRedDora,
      round.riichi[seat]
    );
    // Add nukidora bonus
    const nukidoraCount = round.nukidora[seat].length;
    const totalHan = yakuResult.totalHan + doraHan.total + nukidoraCount;

    const isDealer = seat === this.state.dealerSeat;
    const fu = calculateFu({
      decomposition: null,
      melds: round.melds[seat],
      winTileKind: tileKind(winTile),
      isTsumo: true,
      isMenzen: isMenzen(round, seat),
      isPinfu: yakuResult.yaku.some((y) => y.name === "平和"),
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isChiitoi: yakuResult.yaku.some((y) => y.name === "七対子"),
    });

    const basePoints = calculateBasePoints(totalHan, fu);
    const payment = calculatePayment(
      basePoints,
      isDealer,
      true,
      this.state.honba,
      this.state.riichiSticks
    );

    // In sanma tsumo: only 2 other players pay
    const scoreChanges: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    if (payment.tsumoAll !== undefined) {
      for (let i = 0; i < PLAYER_COUNT; i++) {
        if (i !== seat) {
          scoreChanges[i] -= payment.tsumoAll;
          scoreChanges[seat] += payment.tsumoAll;
        }
      }
    } else if (
      payment.tsumoDealer !== undefined &&
      payment.tsumoNonDealer !== undefined
    ) {
      for (let i = 0; i < PLAYER_COUNT; i++) {
        if (i === seat) continue;
        const amount =
          i === this.state.dealerSeat
            ? payment.tsumoDealer
            : payment.tsumoNonDealer;
        scoreChanges[i] -= amount;
        scoreChanges[seat] += amount;
      }
    }
    scoreChanges[seat] += this.state.riichiSticks * 1000;
    for (const s of round.riichiDeclaredThisRound) {
      scoreChanges[s] -= 1000;
    }

    const allYaku = [...yakuResult.yaku, ...doraHan.yakuList];
    if (nukidoraCount > 0) {
      allYaku.push({ name: "北ドラ", han: nukidoraCount });
    }

    const event: SanmaGameEvent = {
      type: "TSUMO",
      seat,
      yaku: allYaku,
      han: totalHan,
      fu,
      score: calculateTotalWinnings(payment, this.state.riichiSticks),
      scoreChanges,
    };
    this.applyEvent(event);
    return [event];
  }

  private handleRon(seat: SeatIndex3): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];

    const discard = round.lastDiscard;
    const hand = round.hands[seat];
    const allTiles = [...hand, discard.tileId];

    const winCtx: WinContext = {
      handTileIds: allTiles,
      melds: round.melds[seat],
      winTileId: discard.tileId,
      isTsumo: false,
      isRiichi: round.riichi[seat],
      isDoubleRiichi: false,
      isIppatsu: round.ippatsu[seat],
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isFirstDraw: false,
      isLastTileDraw: false,
      isLastDiscard: tilesRemaining(round.wall) === 0,
      isRinshan: false,
      isChankan: false,
    };

    const yakuResult = evaluateYaku(winCtx);
    if (yakuResult.yaku.length === 0) return [];

    const doraHan = countDora(
      allTiles,
      round.melds[seat],
      round,
      this.state.rules.hasRedDora,
      round.riichi[seat]
    );
    const nukidoraCount = round.nukidora[seat].length;
    const totalHan = yakuResult.totalHan + doraHan.total + nukidoraCount;

    const isDealer = seat === this.state.dealerSeat;
    const fu = calculateFu({
      decomposition: null,
      melds: round.melds[seat],
      winTileKind: tileKind(discard.tileId),
      isTsumo: false,
      isMenzen: isMenzen(round, seat),
      isPinfu: false,
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isChiitoi: yakuResult.yaku.some((y) => y.name === "七対子"),
    });

    const basePoints = calculateBasePoints(totalHan, fu);
    const payment = calculatePayment(
      basePoints,
      isDealer,
      false,
      this.state.honba,
      this.state.riichiSticks
    );

    const scoreChanges: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    scoreChanges[discard.seat] -= payment.ron!;
    scoreChanges[seat] += payment.ron! + this.state.riichiSticks * 1000;
    for (const s of round.riichiDeclaredThisRound) {
      scoreChanges[s] -= 1000;
    }

    const allYaku = [...yakuResult.yaku, ...doraHan.yakuList];
    if (nukidoraCount > 0) {
      allYaku.push({ name: "北ドラ", han: nukidoraCount });
    }

    const event: SanmaGameEvent = {
      type: "RON",
      winners: [
        {
          seat,
          yaku: allYaku,
          han: totalHan,
          fu,
          score: payment.ron! + this.state.riichiSticks * 1000,
        },
      ],
      loserSeat: discard.seat,
      scoreChanges,
    };
    this.applyEvent(event);
    return [event];
  }

  private handlePon(
    seat: SeatIndex3,
    tiles: TileId[]
  ): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];

    const event: SanmaGameEvent = {
      type: "PON",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat,
    };
    this.applyEvent(event);
    return [event];
  }

  private handleKanOpen(
    seat: SeatIndex3,
    tiles: TileId[]
  ): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];

    const events: SanmaGameEvent[] = [];
    const event: SanmaGameEvent = {
      type: "KAN_OPEN",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat,
    };
    this.applyEvent(event);
    events.push(event);

    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);

    return events;
  }

  private handleKanClosed(
    seat: SeatIndex3,
    tiles: TileId[]
  ): SanmaGameEvent[] {
    const events: SanmaGameEvent[] = [];
    const event: SanmaGameEvent = {
      type: "KAN_CLOSED",
      seat,
      tiles,
    };
    this.applyEvent(event);
    events.push(event);

    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);

    return events;
  }

  private handleKanAdded(
    seat: SeatIndex3,
    tileId: TileId
  ): SanmaGameEvent[] {
    const events: SanmaGameEvent[] = [];
    const event: SanmaGameEvent = {
      type: "KAN_ADDED",
      seat,
      tileId,
    };
    this.applyEvent(event);
    events.push(event);

    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);

    return events;
  }

  private handleSkip(seat: SeatIndex3): SanmaGameEvent[] {
    const events: SanmaGameEvent[] = [];
    const event: SanmaGameEvent = { type: "SKIP_CLAIM", seat };
    this.applyEvent(event);
    events.push(event);

    const round = this.state.round;
    if (!round || !round.lastDiscard) return events;

    let anyClaims = false;
    for (let i = 1; i < PLAYER_COUNT; i++) {
      const s = ((round.lastDiscard.seat + i) % PLAYER_COUNT) as SeatIndex3;
      if (s === seat) continue;
      const available = this.getAvailableActions(s);
      if (available.length > 0) {
        anyClaims = true;
        break;
      }
    }

    if (!anyClaims) {
      const nextSeat = ((round.lastDiscard.seat + 1) %
        PLAYER_COUNT) as SeatIndex3;
      const drawEvents = this.doDraw(nextSeat);
      events.push(...drawEvents);
    }

    return events;
  }

  private handleExhaustiveDraw(): SanmaGameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    const tenpaiPlayers: SeatIndex3[] = [];
    for (let i = 0; i < PLAYER_COUNT; i++) {
      const handKinds = round.hands[i].map(tileKind);
      if (isTenpai(handKinds)) {
        tenpaiPlayers.push(i as SeatIndex3);
      }
    }

    // Score changes for tenpai/noten (3-player: total penalty = 3000)
    const scoreChanges: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    const tenpaiCount = tenpaiPlayers.length;
    if (tenpaiCount > 0 && tenpaiCount < PLAYER_COUNT) {
      const totalPenalty = 3000;
      const penaltyPerNoten = totalPenalty / (PLAYER_COUNT - tenpaiCount);
      const bonusPerTenpai = totalPenalty / tenpaiCount;
      for (let i = 0; i < PLAYER_COUNT; i++) {
        if (tenpaiPlayers.includes(i as SeatIndex3)) {
          scoreChanges[i] = bonusPerTenpai;
        } else {
          scoreChanges[i] = -penaltyPerNoten;
        }
      }
    }

    const event: SanmaGameEvent = {
      type: "DRAW_ROUND",
      reason: RoundEndReason.EXHAUSTIVE_DRAW,
      tenpaiPlayers,
      scoreChanges,
    };
    this.applyEvent(event);
    return [event];
  }
}

// ===== Utility functions =====

function isMenzen(round: SanmaRoundState, seat: SeatIndex3): boolean {
  return !round.melds[seat].some((m) => m.type !== MeldType.KAN_CLOSED);
}

function relativeSeatWind(seat: SeatIndex3, dealerSeat: SeatIndex3): Wind {
  return ((seat - dealerSeat + PLAYER_COUNT) % PLAYER_COUNT) as Wind;
}

function findClosedKanGroups(hand: TileId[]): TileKind[] {
  const counts = countByKind(hand);
  const groups: TileKind[] = [];
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 4) groups.push(k);
  }
  return groups;
}

function countDora(
  handTiles: TileId[],
  melds: Meld[],
  round: SanmaRoundState,
  hasRedDora: boolean,
  _isRiichi: boolean
): { total: number; yakuList: { name: string; han: number }[] } {
  const allTiles = [...handTiles];
  for (const m of melds) {
    allTiles.push(...m.tiles);
  }

  const indicators = getDoraIndicators(round.wall);
  let doraCount = 0;

  for (const indicator of indicators) {
    const doraKind = doraFromIndicator(tileKind(indicator));
    doraCount += allTiles.filter((t) => tileKind(t) === doraKind).length;
  }

  let redCount = 0;
  if (hasRedDora) {
    redCount = allTiles.filter(isRedDora).length;
  }

  const yakuList: { name: string; han: number }[] = [];
  if (doraCount > 0) yakuList.push({ name: "ドラ", han: doraCount });
  if (redCount > 0) yakuList.push({ name: "赤ドラ", han: redCount });

  return { total: doraCount + redCount, yakuList };
}

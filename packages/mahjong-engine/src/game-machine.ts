import type { TileId, TileKind, SeatIndex, Meld, PlayerGameView, PlayerView } from "@mahjong/shared";
import { Wind, RoundPhase, ActionType, MeldType, GamePhase, RoundEndReason } from "@mahjong/shared";
import type { GameState, GameEvent, RoundState } from "./game-state";
import { gameReducer, createInitialState, advanceRound } from "./game-reducer";
import { drawTile, drawFromDeadWall, tilesRemaining, getDoraIndicators, rollDice, calculateWallBreakPosition } from "./wall";
import { SeededRNG } from "./rng";
import { tileKind, sortTileIds, countByKind, isRedDora, doraFromIndicator } from "./tile";
import { isWinningHand, isTenpai, findWaitingTiles } from "./hand";
import { evaluateYaku, type WinContext } from "./rules/yaku-evaluator";
import { calculateFu, calculateBasePoints, calculatePayment, calculateScoreChanges, calculateTotalWinnings } from "./rules/scoring";
import type { GameRuleConfig } from "@mahjong/shared";

export interface GameAction {
  seat: SeatIndex;
  action: ActionType;
  tileId?: TileId;
  tiles?: TileId[];
}

/**
 * GameMachine orchestrates the game flow.
 * It validates actions, generates events, and produces new state.
 */
export class GameMachine {
  private state: GameState;
  private eventLog: GameEvent[] = [];

  constructor(state?: GameState) {
    this.state = state ?? createInitialState();
  }

  getState(): GameState {
    return this.state;
  }

  getEventLog(): GameEvent[] {
    return this.eventLog;
  }

  /**
   * Start a new game.
   */
  startGame(seed: number, rules?: Partial<GameRuleConfig>): GameEvent[] {
    const fullRules: GameRuleConfig = {
      ...this.state.rules,
      ...rules,
    };
    const events: GameEvent[] = [];

    // Randomize seat winds (場決め)
    const rng = new SeededRNG(seed);
    const winds: [Wind, Wind, Wind, Wind] = [Wind.EAST, Wind.SOUTH, Wind.WEST, Wind.NORTH];
    rng.shuffle(winds);

    const startEvent: GameEvent = { type: "GAME_START", seed, rules: fullRules, seatWinds: winds };
    this.applyEvent(startEvent);
    events.push(startEvent);

    // Start first round
    const roundEvents = this.startNewRound();
    events.push(...roundEvents);

    return events;
  }

  /**
   * Start a new round.
   */
  startNewRound(): GameEvent[] {
    const events: GameEvent[] = [];
    const roundSeed = this.state.seed + this.state.eventSequence;

    // Roll dice for this round
    const diceResult = rollDice(roundSeed + 7777);
    const diceTotal = diceResult[0] + diceResult[1];
    const wallBreakPosition = calculateWallBreakPosition(diceTotal);

    const roundStart: GameEvent = {
      type: "ROUND_START",
      seed: roundSeed,
      dealerSeat: this.state.dealerSeat,
      diceResult,
      wallBreakPosition,
    };
    this.applyEvent(roundStart);
    events.push(roundStart);

    // Dealer draws first tile
    const drawEvents = this.doDraw(this.state.dealerSeat);
    events.push(...drawEvents);

    return events;
  }

  /**
   * Process a player action. Returns the events generated.
   */
  processAction(action: GameAction): GameEvent[] {
    const available = this.getAvailableActions(action.seat);
    if (!available.includes(action.action)) {
      return []; // Invalid action
    }

    switch (action.action) {
      case ActionType.DISCARD:
        return this.handleDiscard(action.seat, action.tileId!);
      case ActionType.TSUMO:
        return this.handleTsumo(action.seat);
      case ActionType.RON:
        return this.handleRon(action.seat);
      case ActionType.RIICHI:
        return this.handleRiichi(action.seat, action.tileId!);
      case ActionType.CHI:
        return this.handleChi(action.seat, action.tiles!);
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

  /**
   * Get available actions for a player.
   */
  getAvailableActions(seat: SeatIndex): ActionType[] {
    const round = this.state.round;
    if (!round || this.state.gamePhase !== GamePhase.PLAYING) return [];

    const actions: ActionType[] = [];
    const hand = round.hands[seat];
    const handKinds = hand.map(tileKind);

    if (round.phase === RoundPhase.DISCARD && round.currentTurn === seat) {
      // It's our turn to discard
      actions.push(ActionType.DISCARD);

      // Check tsumo
      if (round.drawnTile !== null) {
        const allKinds = hand.map(tileKind);
        if (isWinningHand(allKinds)) {
          actions.push(ActionType.TSUMO);
        }
      }

      // Check riichi (menzen + tenpai + enough points)
      if (!round.riichi[seat] && isMenzen(round, seat) && this.state.scores[seat] >= 1000) {
        // Check if discarding any tile leaves tenpai
        for (const tile of hand) {
          const remaining = hand.filter((t) => t !== tile).map(tileKind);
          if (isTenpai(remaining)) {
            actions.push(ActionType.RIICHI);
            break;
          }
        }
      }

      // Check closed kan
      const kanGroups = findClosedKanGroups(hand);
      if (kanGroups.length > 0 && !round.riichi[seat]) {
        actions.push(ActionType.KAN_CLOSED);
      }

      // Check added kan (upgrade pon to kan)
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
      if (round.skippedClaims?.includes(seat)) return actions; // Already skipped
      const discard = round.lastDiscard;
      if (discard.seat === seat) return actions; // Can't claim own discard

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

      // Chi check (only from previous player's discard)
      const prevSeat = ((seat + 3) % 4) as SeatIndex;
      if (discard.seat === prevSeat && !round.riichi[seat]) {
        if (canChi(handKinds, discardKind)) {
          actions.push(ActionType.CHI);
        }
      }

      if (actions.length > 0) {
        actions.push(ActionType.SKIP);
      }
    }

    return actions;
  }

  /**
   * Perform auto-discard for a player (timeout or disconnect).
   * Tsumogiri (discard drawn tile) if available, else discard last tile in hand.
   */
  autoDiscard(seat: SeatIndex): GameEvent[] {
    const round = this.state.round;
    if (!round || round.currentTurn !== seat || round.phase !== RoundPhase.DISCARD) {
      return [];
    }

    const tileId = round.drawnTile ?? round.hands[seat][round.hands[seat].length - 1];
    if (tileId === undefined) return [];

    const event: GameEvent = { type: "AUTO_DISCARD", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }

  /**
   * Auto-skip all pending claims (for claim timeout).
   */
  autoSkipAllClaims(): GameEvent[] {
    const round = this.state.round;
    if (!round || round.phase !== RoundPhase.CLAIM || !round.lastDiscard) {
      return [];
    }

    const events: GameEvent[] = [];
    for (let iter = 0; iter < 4; iter++) {
      const currentRound = this.state.round;
      if (!currentRound || currentRound.phase !== RoundPhase.CLAIM || !currentRound.lastDiscard) break;

      let skipped = false;
      for (let i = 1; i <= 3; i++) {
        const s = ((currentRound.lastDiscard.seat + i) % 4) as SeatIndex;
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

  /**
   * Advance to next round after round result.
   */
  advanceToNextRound(dealerWon: boolean, isDraw: boolean = false): GameEvent[] {
    if (this.state.gamePhase !== GamePhase.ROUND_RESULT) {
      return [];
    }

    this.state = advanceRound(this.state, dealerWon, isDraw);

    if (this.state.gamePhase === GamePhase.GAME_RESULT) {
      const event: GameEvent = {
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
   */
  getPlayerView(seat: SeatIndex, playerNames: string[]): PlayerGameView {
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
        mySeat: seat,
        myScore: this.state.scores[seat],
        players: playerNames.map((name, i) => ({
          seat: i as SeatIndex,
          name,
          score: this.state.scores[i],
          discards: [],
          melds: [],
          isRiichi: false,
          isConnected: true,
          handCount: 0,
        })),
        currentTurn: 0 as SeatIndex,
        availableActions: [],
        diceResult: this.state.diceResult,
        seatWinds: [...this.state.seatWinds],
        wallBreakPosition: this.state.wallBreakPosition,
        dealerSeat: this.state.dealerSeat,
      };
    }

    const players: PlayerView[] = playerNames.map((name, i) => ({
      seat: i as SeatIndex,
      name,
      score: this.state.scores[i],
      discards: round.discards[i],
      melds: round.melds[i],
      isRiichi: round.riichi[i],
      isConnected: true,
      handCount: round.hands[i].length,
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
      mySeat: seat,
      myScore: this.state.scores[seat],
      players,
      currentTurn: round.currentTurn,
      lastDiscard: round.lastDiscard ?? undefined,
      availableActions: this.getAvailableActions(seat),
      diceResult: this.state.diceResult,
      seatWinds: [...this.state.seatWinds],
      wallBreakPosition: this.state.wallBreakPosition,
      dealerSeat: this.state.dealerSeat,
    };
  }

  // ===== Private handlers =====

  private applyEvent(event: GameEvent): void {
    this.state = gameReducer(this.state, event);
    this.eventLog.push(event);
  }

  private doDraw(seat: SeatIndex): GameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    const result = drawTile(round.wall);
    if (!result) {
      // Wall exhausted -> exhaustive draw
      return this.handleExhaustiveDraw();
    }

    // Update wall in state
    this.state = {
      ...this.state,
      round: { ...round, wall: result.wall },
    };

    const event: GameEvent = {
      type: "DRAW_TILE",
      seat,
      tileId: result.tile,
    };
    this.applyEvent(event);
    return [event];
  }

  private doDrawFromDeadWall(seat: SeatIndex): GameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    const result = drawFromDeadWall(round.wall);
    if (!result) return [];

    this.state = {
      ...this.state,
      round: { ...round, wall: result.wall },
    };

    const event: GameEvent = {
      type: "DRAW_TILE",
      seat,
      tileId: result.tile,
    };
    this.applyEvent(event);
    return [event];
  }

  private handleDiscard(seat: SeatIndex, tileId: TileId): GameEvent[] {
    const event: GameEvent = { type: "DISCARD", seat, tileId };
    this.applyEvent(event);

    // Check for claims from other players, if none -> next turn draw
    return this.afterDiscard(seat, [event]);
  }

  private handleRiichi(seat: SeatIndex, tileId: TileId): GameEvent[] {
    const event: GameEvent = { type: "RIICHI", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }

  private afterDiscard(discardSeat: SeatIndex, events: GameEvent[]): GameEvent[] {
    // Check if any player has claims
    const round = this.state.round;
    if (!round) return events;

    let anyClaims = false;
    for (let i = 1; i <= 3; i++) {
      const seat = ((discardSeat + i) % 4) as SeatIndex;
      const available = this.getAvailableActions(seat);
      if (available.length > 0) {
        anyClaims = true;
      }
    }

    if (!anyClaims) {
      // No claims -> advance to next player
      const nextSeat = ((discardSeat + 1) % 4) as SeatIndex;
      const drawEvents = this.doDraw(nextSeat);
      events.push(...drawEvents);
    }

    return events;
  }

  private handleTsumo(seat: SeatIndex): GameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    const hand = round.hands[seat];
    const handKinds = hand.map(tileKind);
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

    // Add dora
    const doraHan = countDora(hand, round.melds[seat], round, this.state.rules.hasRedDora, round.riichi[seat]);
    const totalHan = yakuResult.totalHan + doraHan.total;

    const isDealer = seat === this.state.dealerSeat;
    const fu = calculateFu({
      decomposition: yakuResult.decomposition,
      melds: round.melds[seat],
      winTileKind: tileKind(winTile),
      isTsumo: true,
      isMenzen: isMenzen(round, seat),
      isPinfu: yakuResult.yaku.some((y) => y.name === "平和"),
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isChiitoi: yakuResult.isChiitoi,
    });

    const basePoints = calculateBasePoints(totalHan, fu);
    const payment = calculatePayment(
      basePoints,
      isDealer,
      true,
      this.state.honba,
      this.state.riichiSticks
    );

    const scoreChanges: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    if (payment.tsumoAll !== undefined) {
      for (let i = 0; i < 4; i++) {
        if (i !== seat) {
          scoreChanges[i] -= payment.tsumoAll;
          scoreChanges[seat] += payment.tsumoAll;
        }
      }
    } else if (payment.tsumoDealer !== undefined && payment.tsumoNonDealer !== undefined) {
      for (let i = 0; i < 4; i++) {
        if (i === seat) continue;
        const amount = i === this.state.dealerSeat ? payment.tsumoDealer : payment.tsumoNonDealer;
        scoreChanges[i] -= amount;
        scoreChanges[seat] += amount;
      }
    }
    // Winner collects riichi sticks on the table
    // (deposits already deducted at declaration time in the reducer)
    scoreChanges[seat] += this.state.riichiSticks * 1000;

    const allYaku = [...yakuResult.yaku, ...doraHan.yakuList];

    const event: GameEvent = {
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

  private handleRon(seat: SeatIndex): GameEvent[] {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];

    const discard = round.lastDiscard;
    const hand = round.hands[seat];
    const allTiles = [...hand, discard.tileId];
    const handKinds = allTiles.map(tileKind);

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

    const doraHan = countDora(allTiles, round.melds[seat], round, this.state.rules.hasRedDora, round.riichi[seat]);
    const totalHan = yakuResult.totalHan + doraHan.total;

    const isDealer = seat === this.state.dealerSeat;
    const fu = calculateFu({
      decomposition: yakuResult.decomposition,
      melds: round.melds[seat],
      winTileKind: tileKind(discard.tileId),
      isTsumo: false,
      isMenzen: isMenzen(round, seat),
      isPinfu: yakuResult.yaku.some((y) => y.name === "平和"),
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isChiitoi: yakuResult.isChiitoi,
    });

    const basePoints = calculateBasePoints(totalHan, fu);
    const payment = calculatePayment(
      basePoints,
      isDealer,
      false,
      this.state.honba,
      this.state.riichiSticks
    );

    const scoreChanges: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    scoreChanges[discard.seat] -= payment.ron!;
    // Winner collects riichi sticks on the table
    // (deposits already deducted at declaration time in the reducer)
    scoreChanges[seat] += payment.ron! + this.state.riichiSticks * 1000;

    const allYaku = [...yakuResult.yaku, ...doraHan.yakuList];

    const event: GameEvent = {
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

  private handleChi(seat: SeatIndex, tiles: TileId[]): GameEvent[] {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];

    const event: GameEvent = {
      type: "CHI",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat,
    };
    this.applyEvent(event);
    return [event];
  }

  private handlePon(seat: SeatIndex, tiles: TileId[]): GameEvent[] {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];

    const event: GameEvent = {
      type: "PON",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat,
    };
    this.applyEvent(event);
    return [event];
  }

  private handleKanOpen(seat: SeatIndex, tiles: TileId[]): GameEvent[] {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];

    const events: GameEvent[] = [];
    const event: GameEvent = {
      type: "KAN_OPEN",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat,
    };
    this.applyEvent(event);
    events.push(event);

    // Draw from dead wall
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);

    return events;
  }

  private handleKanClosed(seat: SeatIndex, tiles: TileId[]): GameEvent[] {
    const events: GameEvent[] = [];
    const event: GameEvent = {
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

  private handleKanAdded(seat: SeatIndex, tileId: TileId): GameEvent[] {
    const events: GameEvent[] = [];
    const event: GameEvent = {
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

  private handleSkip(seat: SeatIndex): GameEvent[] {
    const events: GameEvent[] = [];
    const event: GameEvent = { type: "SKIP_CLAIM", seat };
    this.applyEvent(event);
    events.push(event);

    // Check if all claims resolved
    const round = this.state.round;
    if (!round || !round.lastDiscard) return events;

    // Check if there are still pending actions from other players
    let anyClaims = false;
    for (let i = 1; i <= 3; i++) {
      const s = ((round.lastDiscard.seat + i) % 4) as SeatIndex;
      if (s === seat) continue;
      const available = this.getAvailableActions(s);
      if (available.length > 0) {
        anyClaims = true;
        break;
      }
    }

    if (!anyClaims) {
      // Advance to next turn
      const nextSeat = ((round.lastDiscard.seat + 1) % 4) as SeatIndex;
      const drawEvents = this.doDraw(nextSeat);
      events.push(...drawEvents);
    }

    return events;
  }

  private handleExhaustiveDraw(): GameEvent[] {
    const round = this.state.round;
    if (!round) return [];

    const tenpaiPlayers: SeatIndex[] = [];
    for (let i = 0; i < 4; i++) {
      const handKinds = round.hands[i].map(tileKind);
      if (isTenpai(handKinds)) {
        tenpaiPlayers.push(i as SeatIndex);
      }
    }

    // Score changes for tenpai/noten
    const scoreChanges: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const tenpaiCount = tenpaiPlayers.length;
    if (tenpaiCount > 0 && tenpaiCount < 4) {
      const totalPenalty = 3000;
      const penaltyPerNoten = totalPenalty / (4 - tenpaiCount);
      const bonusPerTenpai = totalPenalty / tenpaiCount;
      for (let i = 0; i < 4; i++) {
        if (tenpaiPlayers.includes(i as SeatIndex)) {
          scoreChanges[i] = bonusPerTenpai;
        } else {
          scoreChanges[i] = -penaltyPerNoten;
        }
      }
    }

    const event: GameEvent = {
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

function isMenzen(round: RoundState, seat: SeatIndex): boolean {
  return !round.melds[seat].some((m) => m.type !== MeldType.KAN_CLOSED);
}

function relativeSeatWind(seat: SeatIndex, dealerSeat: SeatIndex): Wind {
  return ((seat - dealerSeat + 4) % 4) as Wind;
}

function canChi(handKinds: number[], discardKind: number): boolean {
  if (discardKind >= 27) return false; // can't chi honor tiles
  const suit = Math.floor(discardKind / 9);
  const num = discardKind % 9;

  // Check all possible sequences
  const suitKinds = handKinds.filter((k) => Math.floor(k / 9) === suit);
  const nums = suitKinds.map((k) => k % 9);

  // n-2, n-1, n
  if (num >= 2 && nums.includes(num - 2) && nums.includes(num - 1)) return true;
  // n-1, n, n+1
  if (num >= 1 && num <= 7 && nums.includes(num - 1) && nums.includes(num + 1)) return true;
  // n, n+1, n+2
  if (num <= 6 && nums.includes(num + 1) && nums.includes(num + 2)) return true;

  return false;
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
  round: RoundState,
  hasRedDora: boolean,
  isRiichi: boolean
): { total: number; yakuList: { name: string; han: number }[] } {
  const allTiles = [...handTiles];
  for (const m of melds) {
    allTiles.push(...m.tiles);
  }

  const indicators = getDoraIndicators(round.wall);
  let doraCount = 0;

  // Regular dora
  for (const indicator of indicators) {
    const doraKind = doraFromIndicator(tileKind(indicator));
    doraCount += allTiles.filter((t) => tileKind(t) === doraKind).length;
  }

  // Red dora
  let redCount = 0;
  if (hasRedDora) {
    redCount = allTiles.filter(isRedDora).length;
  }

  const yakuList: { name: string; han: number }[] = [];
  if (doraCount > 0) yakuList.push({ name: "ドラ", han: doraCount });
  if (redCount > 0) yakuList.push({ name: "赤ドラ", han: redCount });

  // Uradora (only for riichi winners) - simplified
  // Full implementation would check uradora indicators

  return { total: doraCount + redCount, yakuList };
}

import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { GameMachine } from "@mahjong/engine";
import type { GameState, GameEvent } from "@mahjong/engine";
import type { GameRuleConfig, SeatIndex, PlayerGameView } from "@mahjong/shared";
import { GamePhase, RoundPhase, ActionType, TURN_TIMEOUT_MS, DISCONNECT_GRACE_MS } from "@mahjong/shared";

/** Callback invoked when the server auto-acts (turn timeout, claim timeout, disconnect). */
export type AutoActionCallback = (
  roomId: string,
  events: GameEvent[],
  views: Map<string, PlayerGameView>
) => void;

interface ActiveSession {
  machine: GameMachine;
  playerMap: Map<string, SeatIndex>; // userId -> seat
  reverseMap: Map<SeatIndex, string>; // seat -> userId
  playerNames: string[];
  roomId: string;
  turnTimer?: NodeJS.Timeout;
  claimTimer?: NodeJS.Timeout;
  roundAdvanceTimer?: NodeJS.Timeout;
  disconnectTimers: Map<string, NodeJS.Timeout>;
  disconnectedPlayers: Set<string>;
  autoActionCallback?: AutoActionCallback;
}

@Injectable()
export class GameSessionService {
  private readonly logger = new Logger(GameSessionService.name);
  private sessions = new Map<string, ActiveSession>();

  constructor(private redis: RedisService) {}

  /**
   * Create and start a new game session.
   */
  async createSession(
    roomId: string,
    players: { userId: string; name: string; seat: SeatIndex }[],
    rules?: Partial<GameRuleConfig>,
    autoActionCallback?: AutoActionCallback
  ): Promise<GameEvent[]> {
    const machine = new GameMachine();
    const playerMap = new Map<string, SeatIndex>();
    const reverseMap = new Map<SeatIndex, string>();
    const playerNames: string[] = ["", "", "", ""];

    for (const p of players) {
      playerMap.set(p.userId, p.seat);
      reverseMap.set(p.seat, p.userId);
      playerNames[p.seat] = p.name;
    }

    const session: ActiveSession = {
      machine,
      playerMap,
      reverseMap,
      playerNames,
      roomId,
      disconnectTimers: new Map(),
      disconnectedPlayers: new Set(),
      autoActionCallback,
    };
    this.sessions.set(roomId, session);

    const seed = Date.now();
    const events = machine.startGame(seed, rules);

    await this.cacheState(roomId, machine.getState());

    // Start the first turn timer (dealer's turn after dealing)
    this.startTurnTimer(roomId);

    return events;
  }

  /**
   * Process a player action.
   */
  async processAction(
    roomId: string,
    userId: string,
    action: string,
    tileId?: number,
    tiles?: number[]
  ): Promise<{ events: GameEvent[]; views: Map<string, PlayerGameView> }> {
    const session = this.sessions.get(roomId);
    if (!session) throw new Error("No active session");

    const seat = session.playerMap.get(userId);
    if (seat === undefined) throw new Error("Player not in game");

    // Clear current timers before processing
    this.clearTurnTimer(roomId);

    const events = session.machine.processAction({
      seat,
      action: action as any,
      tileId,
      tiles,
    });

    await this.cacheState(roomId, session.machine.getState());

    const views = this.buildAllViews(session);

    // Handle post-action state (round end, new timers, etc.)
    this.handlePostAction(roomId, events);

    return { events, views };
  }

  /**
   * Advance to the next round after a round result display period.
   */
  async advanceRound(roomId: string): Promise<{ events: GameEvent[]; views: Map<string, PlayerGameView> } | null> {
    const session = this.sessions.get(roomId);
    if (!session) return null;

    const state = session.machine.getState();
    if (state.gamePhase !== GamePhase.ROUND_RESULT) return null;

    // Determine if dealer won (for round advancement logic)
    const { dealerWon, isDraw } = this.analyzeRoundOutcome(session);
    const events = session.machine.advanceToNextRound(dealerWon, isDraw);

    await this.cacheState(roomId, session.machine.getState());

    const views = this.buildAllViews(session);

    // If new round started, begin turn timer
    if (!session.machine.isGameOver()) {
      this.startTurnTimer(roomId);
    }

    return { events, views };
  }

  /**
   * Get player view for reconnection (includes turn time remaining).
   */
  getPlayerView(roomId: string, userId: string): PlayerGameView | null {
    const session = this.sessions.get(roomId);
    if (!session) return null;

    const seat = session.playerMap.get(userId);
    if (seat === undefined) return null;

    const view = session.machine.getPlayerView(seat, session.playerNames);

    // Inject connection status
    this.injectConnectionStatus(session, view);

    // Inject turn time remaining
    const state = session.machine.getState();
    if (state.round) {
      const elapsed = Date.now() - state.round.turnStartTime;
      view.turnTimeRemaining = Math.max(0, TURN_TIMEOUT_MS - elapsed);
    }

    return view;
  }

  /**
   * Get all player views (for broadcasting).
   */
  getAllPlayerViews(roomId: string): Map<string, PlayerGameView> {
    const session = this.sessions.get(roomId);
    if (!session) return new Map();
    return this.buildAllViews(session);
  }

  /**
   * Handle player disconnect.
   */
  handleDisconnect(roomId: string, userId: string): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    session.disconnectedPlayers.add(userId);

    const seat = session.playerMap.get(userId);
    if (seat === undefined) return;

    // If it's the disconnected player's turn, set a shorter grace timer
    // After grace period, auto-discard for them
    const timer = setTimeout(() => {
      this.performAutoActionForDisconnected(roomId, userId);
    }, DISCONNECT_GRACE_MS);

    session.disconnectTimers.set(userId, timer);
  }

  /**
   * Handle player reconnect.
   */
  handleReconnect(roomId: string, userId: string): PlayerGameView | null {
    const session = this.sessions.get(roomId);
    if (!session) return null;

    // Clear disconnect timer
    const timer = session.disconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      session.disconnectTimers.delete(userId);
    }

    session.disconnectedPlayers.delete(userId);

    return this.getPlayerView(roomId, userId);
  }

  /**
   * Check if a player is disconnected.
   */
  isDisconnected(roomId: string, userId: string): boolean {
    const session = this.sessions.get(roomId);
    return session?.disconnectedPlayers.has(userId) ?? false;
  }

  /**
   * Check if a session exists.
   */
  hasSession(roomId: string): boolean {
    return this.sessions.has(roomId);
  }

  /**
   * Get the game state (for persistence).
   */
  getState(roomId: string): GameState | null {
    const session = this.sessions.get(roomId);
    return session?.machine.getState() ?? null;
  }

  /**
   * Check if the game's round just ended.
   */
  isRoundOver(roomId: string): boolean {
    const session = this.sessions.get(roomId);
    return session?.machine.isRoundOver() ?? false;
  }

  /**
   * Check if the game is completely over.
   */
  isGameOver(roomId: string): boolean {
    const session = this.sessions.get(roomId);
    return session?.machine.isGameOver() ?? false;
  }

  /**
   * Get userId for a given seat.
   */
  getUserIdForSeat(roomId: string, seat: SeatIndex): string | undefined {
    const session = this.sessions.get(roomId);
    return session?.reverseMap.get(seat);
  }

  /**
   * Get seat for a given userId.
   */
  getSeatForUserId(roomId: string, userId: string): SeatIndex | undefined {
    const session = this.sessions.get(roomId);
    return session?.playerMap.get(userId);
  }

  /**
   * Remove a session and clean up all timers.
   */
  removeSession(roomId: string): void {
    const session = this.sessions.get(roomId);
    if (session) {
      this.clearTurnTimer(roomId);
      if (session.roundAdvanceTimer) clearTimeout(session.roundAdvanceTimer);
      for (const timer of session.disconnectTimers.values()) {
        clearTimeout(timer);
      }
      this.sessions.delete(roomId);
    }
  }

  // ===== Private: Timer Management =====

  private startTurnTimer(roomId: string): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    this.clearTurnTimer(roomId);

    const state = session.machine.getState();
    if (!state.round || state.gamePhase !== GamePhase.PLAYING) return;

    if (state.round.phase === RoundPhase.DISCARD) {
      // Current player needs to discard - set turn timeout
      session.turnTimer = setTimeout(() => {
        this.onTurnTimeout(roomId);
      }, TURN_TIMEOUT_MS);
    } else if (state.round.phase === RoundPhase.CLAIM) {
      // Waiting for claims - set claim timeout
      session.claimTimer = setTimeout(() => {
        this.onClaimTimeout(roomId);
      }, TURN_TIMEOUT_MS);
    }
  }

  private clearTurnTimer(roomId: string): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    if (session.turnTimer) {
      clearTimeout(session.turnTimer);
      session.turnTimer = undefined;
    }
    if (session.claimTimer) {
      clearTimeout(session.claimTimer);
      session.claimTimer = undefined;
    }
  }

  private onTurnTimeout(roomId: string): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    const state = session.machine.getState();
    if (!state.round || state.round.phase !== RoundPhase.DISCARD) return;

    const seat = state.round.currentTurn;
    this.logger.log(`Turn timeout for seat ${seat} in room ${roomId}`);

    const events = session.machine.autoDiscard(seat);
    if (events.length === 0) return;

    this.cacheState(roomId, session.machine.getState()).catch(() => {});

    const views = this.buildAllViews(session);

    // Notify via callback
    if (session.autoActionCallback) {
      session.autoActionCallback(roomId, events, views);
    }

    // Handle post-action (may start new timer or handle round end)
    this.handlePostAction(roomId, events);
  }

  private onClaimTimeout(roomId: string): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    const state = session.machine.getState();
    if (!state.round || state.round.phase !== RoundPhase.CLAIM) return;

    this.logger.log(`Claim timeout in room ${roomId}`);

    const events = session.machine.autoSkipAllClaims();
    if (events.length === 0) return;

    this.cacheState(roomId, session.machine.getState()).catch(() => {});

    const views = this.buildAllViews(session);

    if (session.autoActionCallback) {
      session.autoActionCallback(roomId, events, views);
    }

    this.handlePostAction(roomId, events);
  }

  private performAutoActionForDisconnected(roomId: string, userId: string): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    // Clean up the disconnect timer
    session.disconnectTimers.delete(userId);

    // If the player reconnected in the meantime, skip
    if (!session.disconnectedPlayers.has(userId)) return;

    const seat = session.playerMap.get(userId);
    if (seat === undefined) return;

    const state = session.machine.getState();
    if (!state.round || state.gamePhase !== GamePhase.PLAYING) return;

    let events: GameEvent[] = [];

    if (state.round.phase === RoundPhase.DISCARD && state.round.currentTurn === seat) {
      // It's their turn to discard - auto-discard
      this.clearTurnTimer(roomId);
      events = session.machine.autoDiscard(seat);
    } else if (state.round.phase === RoundPhase.CLAIM) {
      // They might have a pending claim - auto-skip
      const available = session.machine.getAvailableActions(seat);
      if (available.includes(ActionType.SKIP)) {
        this.clearTurnTimer(roomId);
        events = session.machine.processAction({
          seat,
          action: ActionType.SKIP,
        });
      }
    }

    if (events.length === 0) return;

    this.logger.log(`Auto-action for disconnected player ${userId} (seat ${seat}) in room ${roomId}`);
    this.cacheState(roomId, session.machine.getState()).catch(() => {});

    const views = this.buildAllViews(session);

    if (session.autoActionCallback) {
      session.autoActionCallback(roomId, events, views);
    }

    this.handlePostAction(roomId, events);
  }

  // ===== Private: Post-Action Handling =====

  private handlePostAction(roomId: string, events: GameEvent[]): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    if (session.machine.isRoundOver()) {
      // Round ended - schedule advance to next round after display period
      this.clearTurnTimer(roomId);
      this.scheduleRoundAdvance(roomId);
    } else if (session.machine.isGameOver()) {
      // Game completely over
      this.clearTurnTimer(roomId);
    } else {
      // Game continues - start new turn timer
      this.startTurnTimer(roomId);
    }
  }

  private scheduleRoundAdvance(roomId: string): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    const ROUND_RESULT_DISPLAY_MS = 5000;

    session.roundAdvanceTimer = setTimeout(async () => {
      try {
        const result = await this.advanceRound(roomId);
        if (result && session.autoActionCallback) {
          session.autoActionCallback(roomId, result.events, result.views);
        }
      } catch (err) {
        this.logger.error(`Failed to advance round in room ${roomId}: ${err}`);
      }
    }, ROUND_RESULT_DISPLAY_MS);
  }

  // ===== Private: Helpers =====

  private buildAllViews(session: ActiveSession): Map<string, PlayerGameView> {
    const views = new Map<string, PlayerGameView>();
    const state = session.machine.getState();

    for (const [uid, seat] of session.playerMap) {
      const view = session.machine.getPlayerView(seat, session.playerNames);
      this.injectConnectionStatus(session, view);

      // Inject turn time remaining
      if (state.round) {
        const elapsed = Date.now() - state.round.turnStartTime;
        view.turnTimeRemaining = Math.max(0, TURN_TIMEOUT_MS - elapsed);
      }

      views.set(uid, view);
    }
    return views;
  }

  private injectConnectionStatus(session: ActiveSession, view: PlayerGameView): void {
    for (const player of view.players) {
      const uid = session.reverseMap.get(player.seat);
      if (uid) {
        player.isConnected = !session.disconnectedPlayers.has(uid);
      }
    }
  }

  private analyzeRoundOutcome(session: ActiveSession): { dealerWon: boolean; isDraw: boolean } {
    const state = session.machine.getState();
    if (!state.round) return { dealerWon: false, isDraw: false };

    const events = session.machine.getEventLog();
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.type === "TSUMO") {
        return { dealerWon: event.seat === state.dealerSeat, isDraw: false };
      }
      if (event.type === "RON") {
        return { dealerWon: event.winners.some((w) => w.seat === state.dealerSeat), isDraw: false };
      }
      if (event.type === "DRAW_ROUND") {
        return { dealerWon: event.tenpaiPlayers.includes(state.dealerSeat), isDraw: true };
      }
    }
    return { dealerWon: false, isDraw: false };
  }

  private async cacheState(roomId: string, state: GameState): Promise<void> {
    try {
      await this.redis.setGameState(roomId, state);
    } catch (err) {
      this.logger.warn(`Failed to cache state for room ${roomId}: ${err}`);
    }
  }
}

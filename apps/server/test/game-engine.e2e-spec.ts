/**
 * Integration tests for the mahjong game engine.
 * Tests the GameMachine, game flow, and scoring without DB.
 */

import {
  GameMachine,
  createInitialState,
  gameReducer,
  tileKind,
} from "@mahjong/engine";
import type { GameState, GameEvent } from "@mahjong/engine";
import { GamePhase, RoundPhase, ActionType } from "@mahjong/shared";

describe("GameMachine (4-player)", () => {
  let machine: GameMachine;

  beforeEach(() => {
    machine = new GameMachine();
  });

  describe("startGame", () => {
    it("should initialize a game with events", () => {
      const events = machine.startGame(12345);
      expect(events.length).toBeGreaterThanOrEqual(2); // GAME_START + ROUND_START + DRAW_TILE

      const state = machine.getState();
      expect(state.gamePhase).toBe(GamePhase.PLAYING);
      expect(state.scores).toEqual([25000, 25000, 25000, 25000]);
      expect(state.round).not.toBeNull();
    });

    it("should deal 13 tiles to each player and draw 1 for dealer", () => {
      machine.startGame(42);
      const state = machine.getState();
      const round = state.round!;

      // Dealer gets 14 (13 + drawn), others get 13
      expect(round.hands[state.dealerSeat].length).toBe(14);
      for (let i = 0; i < 4; i++) {
        if (i !== state.dealerSeat) {
          expect(round.hands[i].length).toBe(13);
        }
      }
    });

    it("should set dealer seat to 0 initially", () => {
      machine.startGame(1);
      expect(machine.getState().dealerSeat).toBe(0);
    });
  });

  describe("processAction", () => {
    beforeEach(() => {
      machine.startGame(100);
    });

    it("should allow dealer to discard a tile", () => {
      const state = machine.getState();
      const round = state.round!;
      const dealerSeat = state.dealerSeat;
      const tileToDiscard = round.hands[dealerSeat][0];

      const events = machine.processAction({
        seat: dealerSeat,
        action: ActionType.DISCARD,
        tileId: tileToDiscard,
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe("DISCARD");
    });

    it("should reject invalid actions", () => {
      const state = machine.getState();
      // Non-dealer cannot discard
      const nonDealer = ((state.dealerSeat + 1) % 4) as 0 | 1 | 2 | 3;
      const events = machine.processAction({
        seat: nonDealer,
        action: ActionType.DISCARD,
        tileId: 0,
      });
      expect(events.length).toBe(0);
    });
  });

  describe("autoDiscard", () => {
    it("should auto-discard for the current player", () => {
      machine.startGame(200);
      const state = machine.getState();
      const events = machine.autoDiscard(state.dealerSeat);
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("getAvailableActions", () => {
    it("should return DISCARD for the dealer at game start", () => {
      machine.startGame(300);
      const state = machine.getState();
      const actions = machine.getAvailableActions(state.dealerSeat);
      expect(actions).toContain(ActionType.DISCARD);
    });

    it("should return empty for non-current players during discard phase", () => {
      machine.startGame(300);
      const state = machine.getState();
      const nonDealer = ((state.dealerSeat + 1) % 4) as 0 | 1 | 2 | 3;
      const actions = machine.getAvailableActions(nonDealer);
      expect(actions.length).toBe(0);
    });
  });

  describe("event log", () => {
    it("should track all events", () => {
      const events = machine.startGame(500);
      const log = machine.getEventLog();
      expect(log.length).toBe(events.length);
      expect(log[0].type).toBe("GAME_START");
    });
  });

  describe("full round flow", () => {
    it("should play through multiple auto-discards without crashing", () => {
      machine.startGame(999);

      let iterations = 0;
      const maxIterations = 500; // Safety limit

      while (!machine.isRoundOver() && !machine.isGameOver() && iterations < maxIterations) {
        const state = machine.getState();
        const round = state.round;
        if (!round) break;

        if (round.phase === RoundPhase.DISCARD) {
          machine.autoDiscard(round.currentTurn);
        } else if (round.phase === RoundPhase.CLAIM) {
          machine.autoSkipAllClaims();
        } else {
          break;
        }
        iterations++;
      }

      // Should have ended (either round over or game over or exhaustive draw)
      expect(iterations).toBeLessThan(maxIterations);
    });
  });
});

describe("gameReducer", () => {
  it("should handle GAME_START event", () => {
    const state = createInitialState();
    const event: GameEvent = {
      type: "GAME_START",
      seed: 42,
      rules: state.rules,
    };

    const newState = gameReducer(state, event);
    expect(newState.gamePhase).toBe(GamePhase.PLAYING);
    expect(newState.seed).toBe(42);
  });

  it("should handle GAME_END event", () => {
    const state = {
      ...createInitialState(),
      gamePhase: GamePhase.PLAYING,
    };
    const event: GameEvent = {
      type: "GAME_END",
      finalScores: [30000, 25000, 20000, 25000],
    };

    const newState = gameReducer(state, event);
    expect(newState.gamePhase).toBe(GamePhase.FINISHED);
  });

  it("should increment eventSequence on each event", () => {
    let state = createInitialState();
    expect(state.eventSequence).toBe(0);

    state = gameReducer(state, {
      type: "GAME_START",
      seed: 1,
      rules: state.rules,
    });
    expect(state.eventSequence).toBe(1);
  });
});

describe("Sanma (3-player) GameMachine", () => {
  // Dynamic import since we export from the same package
  let SanmaGameMachine: any;
  let createSanmaInitialState: any;

  beforeAll(async () => {
    const sanma = await import("@mahjong/engine");
    SanmaGameMachine = sanma.SanmaGameMachine;
    createSanmaInitialState = sanma.createSanmaInitialState;
  });

  it("should create an initial state with 3 players", () => {
    const state = createSanmaInitialState();
    expect(state.scores.length).toBe(3);
    expect(state.rules.playerCount).toBe(3);
  });

  it("should start a game with correct tile count", () => {
    const machine = new SanmaGameMachine();
    machine.startGame(42);
    const state = machine.getState();

    expect(state.gamePhase).toBe(GamePhase.PLAYING);
    expect(state.round).not.toBeNull();

    const round = state.round!;
    // Dealer gets 14, others get 13
    expect(round.hands[state.dealerSeat].length).toBe(14);
    for (let i = 0; i < 3; i++) {
      if (i !== state.dealerSeat) {
        expect(round.hands[i].length).toBe(13);
      }
    }

    // Verify no excluded tiles (man 2-8, kinds 1-7)
    for (let seat = 0; seat < 3; seat++) {
      for (const tileId of round.hands[seat]) {
        const kind = tileKind(tileId);
        expect(kind < 1 || kind > 7).toBe(true);
      }
    }
  });

  it("should not offer chi in available actions", () => {
    const machine = new SanmaGameMachine();
    machine.startGame(100);

    // Auto-discard to trigger claim phase
    const state = machine.getState();
    machine.autoDiscard(state.dealerSeat);

    const newState = machine.getState();
    for (let i = 0; i < 3; i++) {
      const actions = machine.getAvailableActions(i as 0 | 1 | 2);
      expect(actions).not.toContain(ActionType.CHI);
    }
  });

  it("should play through auto-discards without crashing", () => {
    const machine = new SanmaGameMachine();
    machine.startGame(777);

    let iterations = 0;
    const maxIterations = 500;

    while (!machine.isRoundOver() && !machine.isGameOver() && iterations < maxIterations) {
      const state = machine.getState();
      const round = state.round;
      if (!round) break;

      if (round.phase === RoundPhase.DISCARD) {
        machine.autoDiscard(round.currentTurn);
      } else if (round.phase === RoundPhase.CLAIM) {
        machine.autoSkipAllClaims();
      } else {
        break;
      }
      iterations++;
    }

    expect(iterations).toBeLessThan(maxIterations);
  });
});

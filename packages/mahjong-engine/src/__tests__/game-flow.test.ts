import { describe, it, expect } from "vitest";
import { GameMachine } from "../game-machine";
import { advanceRound } from "../game-reducer";
import { botDecideAction } from "../bot";
import { GamePhase, Wind } from "@mahjong/shared";
import type { SeatIndex } from "@mahjong/shared";

/**
 * Full game flow integration tests.
 * Verifies: round progression, wind rotation, honba, トビ, 南4局 completion.
 */
describe("Game Flow", () => {
  /**
   * Helper: play a single round to completion using bot AI for all players.
   */
  function playRoundToEnd(machine: GameMachine): {
    dealerWon: boolean;
    isDraw: boolean;
  } {
    const MAX_ACTIONS = 500;
    let actions = 0;

    while (actions < MAX_ACTIONS) {
      const state = machine.getState();
      if (state.gamePhase !== GamePhase.PLAYING || !state.round) break;

      let acted = false;
      for (let i = 0; i < 4; i++) {
        const seat = i as SeatIndex;
        const available = machine.getAvailableActions(seat);
        if (available.length === 0) continue;

        const action = botDecideAction(state, seat, available);
        if (action) {
          machine.processAction(action);
          acted = true;
          actions++;
          break;
        }
      }

      if (!acted) break;
    }

    const state = machine.getState();
    const dealerSeat = state.dealerSeat;
    const events = machine.getEventLog();
    let dealerWon = false;
    let isDraw = false;

    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "TSUMO") {
        dealerWon = e.seat === dealerSeat;
        break;
      }
      if (e.type === "RON") {
        dealerWon = e.winners.some((w) => w.seat === dealerSeat);
        break;
      }
      if (e.type === "DRAW_ROUND") {
        isDraw = true;
        dealerWon = e.tenpaiPlayers.includes(dealerSeat);
        break;
      }
    }

    return { dealerWon, isDraw };
  }

  function isGameOver(machine: GameMachine): boolean {
    const phase = machine.getState().gamePhase;
    return phase === GamePhase.GAME_RESULT || phase === GamePhase.FINISHED;
  }

  it("should advance from East to South wind correctly", () => {
    const machine = new GameMachine();
    machine.startGame(12345, { roundType: "south" });

    let state = machine.getState();
    expect(state.roundWind).toBe(Wind.EAST);
    expect(state.roundNumber).toBe(0);

    // Play 4 rounds forcing dealer to always lose
    for (let i = 0; i < 4; i++) {
      const { isDraw } = playRoundToEnd(machine);
      state = machine.getState();
      expect(state.gamePhase).toBe(GamePhase.ROUND_RESULT);
      machine.advanceToNextRound(false, isDraw); // force dealer loss
    }

    state = machine.getState();
    expect(state.roundWind).toBe(Wind.SOUTH);
    expect(state.roundNumber).toBe(0);
  });

  it("should end game after South 4 (南4局)", () => {
    const machine = new GameMachine();
    machine.startGame(99999, { roundType: "south" });

    // Play 8 rounds with no dealer wins (East 1-4 + South 1-4)
    for (let i = 0; i < 8; i++) {
      if (isGameOver(machine)) break;

      const { isDraw } = playRoundToEnd(machine);
      if (machine.getState().gamePhase === GamePhase.ROUND_RESULT) {
        machine.advanceToNextRound(false, isDraw);
      }
    }

    expect(isGameOver(machine)).toBe(true);
  });

  it("should keep dealer on 連荘 (dealer win)", () => {
    const machine = new GameMachine();
    machine.startGame(42, { roundType: "south" });

    playRoundToEnd(machine);
    const state = machine.getState();
    const origDealer = state.dealerSeat;
    const origRound = state.roundNumber;

    machine.advanceToNextRound(true, false);

    const newState = machine.getState();
    expect(newState.dealerSeat).toBe(origDealer);
    expect(newState.roundNumber).toBe(origRound);
    expect(newState.honba).toBe(1);
  });

  it("should reset honba to 0 on non-dealer win", () => {
    const machine = new GameMachine();
    machine.startGame(42, { roundType: "south" });

    // Dealer wins twice → honba 1, 2
    playRoundToEnd(machine);
    machine.advanceToNextRound(true, false);
    expect(machine.getState().honba).toBe(1);

    playRoundToEnd(machine);
    machine.advanceToNextRound(true, false);
    expect(machine.getState().honba).toBe(2);

    // Non-dealer wins → honba resets to 0
    playRoundToEnd(machine);
    machine.advanceToNextRound(false, false);
    expect(machine.getState().honba).toBe(0);
  });

  it("should increment honba on draw", () => {
    const machine = new GameMachine();
    machine.startGame(42, { roundType: "south" });

    playRoundToEnd(machine);
    machine.advanceToNextRound(false, true); // draw, dealer not tenpai
    expect(machine.getState().honba).toBe(1);

    playRoundToEnd(machine);
    machine.advanceToNextRound(false, true);
    expect(machine.getState().honba).toBe(2);
  });

  it("should end game on トビ (bust, score < 0)", () => {
    const machine = new GameMachine();
    machine.startGame(42, { roundType: "south" });

    // Use advanceRound directly with a state where a player has negative score
    const state = machine.getState();
    const testState = {
      ...state,
      gamePhase: GamePhase.ROUND_RESULT as GamePhase,
      scores: [35000, 40000, -1000, 26000] as [number, number, number, number],
      round: null,
    };

    const result = advanceRound(testState, false, false);
    expect(result.gamePhase).toBe(GamePhase.GAME_RESULT);
  });

  it("should play a full south game end-to-end with bots", () => {
    const machine = new GameMachine();
    machine.startGame(777, { roundType: "south" });

    let roundsPlayed = 0;
    const MAX_ROUNDS = 30;

    while (roundsPlayed < MAX_ROUNDS) {
      if (isGameOver(machine)) break;

      const { dealerWon, isDraw } = playRoundToEnd(machine);
      if (machine.getState().gamePhase === GamePhase.ROUND_RESULT) {
        machine.advanceToNextRound(dealerWon, isDraw);
      }

      roundsPlayed++;
    }

    expect(isGameOver(machine)).toBe(true);

    const finalState = machine.getState();
    // Total score should sum to 100000 (zero-sum game)
    const totalScore = finalState.scores.reduce((a, b) => a + b, 0);
    // Riichi sticks still on table are points taken from scores
    expect(totalScore + finalState.riichiSticks * 1000).toBe(100000);

    expect(roundsPlayed).toBeGreaterThanOrEqual(8);
  });

  it("should end East-only game after East 4", () => {
    const machine = new GameMachine();
    machine.startGame(555, { roundType: "east" });

    let roundsPlayed = 0;
    const MAX_ROUNDS = 20;

    while (roundsPlayed < MAX_ROUNDS) {
      if (isGameOver(machine)) break;

      const { dealerWon, isDraw } = playRoundToEnd(machine);
      if (machine.getState().gamePhase === GamePhase.ROUND_RESULT) {
        machine.advanceToNextRound(dealerWon, isDraw);
      }
      roundsPlayed++;
    }

    expect(isGameOver(machine)).toBe(true);
    expect(roundsPlayed).toBeGreaterThanOrEqual(4);
  });

  it("should track scores correctly through multiple rounds", () => {
    const machine = new GameMachine();
    machine.startGame(42, { roundType: "south" });

    const initialTotal = machine.getState().scores.reduce((a, b) => a + b, 0);
    expect(initialTotal).toBe(100000);

    for (let i = 0; i < 3; i++) {
      if (isGameOver(machine)) break;

      const { dealerWon, isDraw } = playRoundToEnd(machine);
      if (machine.getState().gamePhase === GamePhase.ROUND_RESULT) {
        machine.advanceToNextRound(dealerWon, isDraw);
      }
    }

    const state = machine.getState();
    const total = state.scores.reduce((a, b) => a + b, 0);
    // Scores + riichi sticks on table should always equal 100000
    expect(total + state.riichiSticks * 1000).toBe(100000);
  });

  it("should play multiple full games with different seeds consistently", () => {
    for (const seed of [1, 42, 100, 999, 12345]) {
      const machine = new GameMachine();
      machine.startGame(seed, { roundType: "south" });

      let rounds = 0;
      while (rounds < 30 && !isGameOver(machine)) {
        const { dealerWon, isDraw } = playRoundToEnd(machine);
        if (machine.getState().gamePhase === GamePhase.ROUND_RESULT) {
          machine.advanceToNextRound(dealerWon, isDraw);
        }
        rounds++;
      }

      const state = machine.getState();
      expect(isGameOver(machine)).toBe(true);
      const total = state.scores.reduce((a, b) => a + b, 0);
      expect(total + state.riichiSticks * 1000).toBe(100000);
    }
  });
});

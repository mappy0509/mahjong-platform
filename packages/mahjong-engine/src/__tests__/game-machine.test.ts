import { describe, it, expect } from "vitest";
import { GameMachine } from "../game-machine";
import { GamePhase, RoundPhase, ActionType } from "@mahjong/shared";
import type { SeatIndex } from "@mahjong/shared";

describe("GameMachine", () => {
  it("should create initial state", () => {
    const machine = new GameMachine();
    const state = machine.getState();
    expect(state.gamePhase).toBe(GamePhase.WAITING);
    expect(state.scores).toEqual([25000, 25000, 25000, 25000]);
  });

  it("should start a game and deal tiles", () => {
    const machine = new GameMachine();
    const events = machine.startGame(42);
    const state = machine.getState();

    expect(state.gamePhase).toBe(GamePhase.PLAYING);
    expect(state.round).not.toBeNull();
    expect(state.round!.phase).toBe(RoundPhase.DISCARD);

    // Dealer should have 14 tiles (13 + 1 drawn)
    expect(state.round!.hands[0].length).toBe(14);
    // Other players should have 13 tiles
    expect(state.round!.hands[1].length).toBe(13);
    expect(state.round!.hands[2].length).toBe(13);
    expect(state.round!.hands[3].length).toBe(13);
  });

  it("should produce deterministic deals with same seed", () => {
    const machine1 = new GameMachine();
    machine1.startGame(42);

    const machine2 = new GameMachine();
    machine2.startGame(42);

    const state1 = machine1.getState();
    const state2 = machine2.getState();

    expect(state1.round!.hands).toEqual(state2.round!.hands);
  });

  it("should allow dealer to discard", () => {
    const machine = new GameMachine();
    machine.startGame(42);

    const state = machine.getState();
    const dealerHand = state.round!.hands[0];
    const tileToDiscard = dealerHand[0];

    const available = machine.getAvailableActions(0 as SeatIndex);
    expect(available).toContain(ActionType.DISCARD);

    const events = machine.processAction({
      seat: 0 as SeatIndex,
      action: ActionType.DISCARD,
      tileId: tileToDiscard,
    });

    expect(events.length).toBeGreaterThan(0);
  });

  it("should generate PlayerGameView with hidden information", () => {
    const machine = new GameMachine();
    machine.startGame(42);

    const names = ["Player 0", "Player 1", "Player 2", "Player 3"];
    const view0 = machine.getPlayerView(0 as SeatIndex, names);
    const view1 = machine.getPlayerView(1 as SeatIndex, names);

    // Each player sees their own hand
    expect(view0.myHand.length).toBe(14); // dealer with drawn tile
    expect(view1.myHand.length).toBe(13);

    // Players don't see each other's hands (only hand count)
    expect(view0.players[1].handCount).toBe(13);
    expect(view1.players[0].handCount).toBe(14);
  });

  it("should play through a basic discard cycle", () => {
    const machine = new GameMachine();
    machine.startGame(42);

    // Play 4 turns of discarding
    for (let turn = 0; turn < 4; turn++) {
      const state = machine.getState();
      if (!state.round) break;

      const currentSeat = state.round.currentTurn;
      const hand = state.round.hands[currentSeat];

      const available = machine.getAvailableActions(currentSeat);
      if (!available.includes(ActionType.DISCARD)) break;

      const tileToDiscard = hand[hand.length - 1]; // discard last tile
      machine.processAction({
        seat: currentSeat,
        action: ActionType.DISCARD,
        tileId: tileToDiscard,
      });
    }

    const finalState = machine.getState();
    expect(finalState.gamePhase).toBe(GamePhase.PLAYING);
  });
});

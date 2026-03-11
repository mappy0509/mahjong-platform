import {
  SanmaGameMachine,
  createSanmaInitialState,
  createSanmaWall,
  SANMA_DEFAULT_RULES,
  SANMA_TOTAL_TILES,
  EXCLUDED_MAN_KINDS,
  NORTH_WIND_KIND,
} from "../sanma";
import { tileKind, tilesRemaining } from "..";
import { GamePhase, RoundPhase } from "@mahjong/shared";
import { DEAD_WALL_SIZE } from "@mahjong/shared";

describe("Sanma Wall", () => {
  it("should create 108 tiles (excluding man 2-8)", () => {
    const wall = createSanmaWall(42);
    const totalTiles = wall.liveTiles.length + wall.deadWall.length;
    expect(totalTiles).toBe(SANMA_TOTAL_TILES);
  });

  it("should have 14 dead wall tiles", () => {
    const wall = createSanmaWall(42);
    expect(wall.deadWall.length).toBe(DEAD_WALL_SIZE);
  });

  it("should have 94 live tiles", () => {
    const wall = createSanmaWall(42);
    expect(wall.liveTiles.length).toBe(SANMA_TOTAL_TILES - DEAD_WALL_SIZE);
  });

  it("should not contain man 2-8 tiles", () => {
    const wall = createSanmaWall(42);
    const allTiles = [...wall.liveTiles, ...wall.deadWall];
    for (const tileId of allTiles) {
      const kind = tileKind(tileId);
      expect(EXCLUDED_MAN_KINDS).not.toContain(kind);
    }
  });

  it("should produce different walls with different seeds", () => {
    const wall1 = createSanmaWall(1);
    const wall2 = createSanmaWall(2);
    expect(wall1.liveTiles).not.toEqual(wall2.liveTiles);
  });
});

describe("Sanma Default Rules", () => {
  it("should have 3 players", () => {
    expect(SANMA_DEFAULT_RULES.playerCount).toBe(3);
  });

  it("should have 3-element uma", () => {
    expect(SANMA_DEFAULT_RULES.uma.length).toBe(3);
    expect(SANMA_DEFAULT_RULES.uma[0]).toBeGreaterThan(0);
    expect(SANMA_DEFAULT_RULES.uma[2]).toBeLessThan(0);
  });

  it("should have 35000 start points", () => {
    expect(SANMA_DEFAULT_RULES.startPoints).toBe(35000);
  });
});

describe("SanmaGameMachine", () => {
  let machine: SanmaGameMachine;

  beforeEach(() => {
    machine = new SanmaGameMachine();
  });

  describe("initial state", () => {
    it("should have 3 scores", () => {
      const state = createSanmaInitialState();
      expect(state.scores.length).toBe(3);
    });

    it("should be in WAITING phase", () => {
      const state = machine.getState();
      expect(state.gamePhase).toBe(GamePhase.WAITING);
    });
  });

  describe("startGame", () => {
    it("should initialize the game", () => {
      const events = machine.startGame(42);
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events[0].type).toBe("GAME_START");
      expect(events[1].type).toBe("ROUND_START");

      const state = machine.getState();
      expect(state.gamePhase).toBe(GamePhase.PLAYING);
    });

    it("should deal tiles to 3 players", () => {
      machine.startGame(42);
      const state = machine.getState();
      const round = state.round!;

      // Count total dealt tiles
      let totalDealt = 0;
      for (let i = 0; i < 3; i++) {
        totalDealt += round.hands[i].length;
      }
      // 13 * 3 + 1 dealer draw = 40
      expect(totalDealt).toBe(40);
    });

    it("should not deal excluded man tiles", () => {
      machine.startGame(42);
      const state = machine.getState();
      const round = state.round!;

      for (let seat = 0; seat < 3; seat++) {
        for (const tileId of round.hands[seat]) {
          const kind = tileKind(tileId);
          expect(EXCLUDED_MAN_KINDS).not.toContain(kind);
        }
      }
    });
  });

  describe("actions", () => {
    beforeEach(() => {
      machine.startGame(100);
    });

    it("should allow dealer to discard", () => {
      const state = machine.getState();
      const actions = machine.getAvailableActions(state.dealerSeat);
      expect(actions).toContain("DISCARD");
    });

    it("should not allow chi", () => {
      // Discard a tile to enter claim phase
      const state = machine.getState();
      const round = state.round!;
      const tileToDiscard = round.hands[state.dealerSeat][0];

      machine.processAction({
        seat: state.dealerSeat,
        action: "DISCARD",
        tileId: tileToDiscard,
      });

      // Check no player has chi available
      for (let i = 0; i < 3; i++) {
        const actions = machine.getAvailableActions(i as 0 | 1 | 2);
        expect(actions).not.toContain("CHI");
      }
    });

    it("should offer nukidora for north wind tiles", () => {
      // Start with a specific seed and check if nukidora is offered
      // when a player has a north wind tile
      const m = new SanmaGameMachine();
      m.startGame(42);
      const state = m.getState();
      const round = state.round!;

      // Check if dealer has a north wind tile
      const hasNorth = round.hands[state.dealerSeat].some(
        (t) => tileKind(t) === NORTH_WIND_KIND
      );

      const actions = m.getAvailableActions(state.dealerSeat);
      if (hasNorth) {
        expect(actions).toContain("NUKIDORA");
      }
    });
  });

  describe("auto-play", () => {
    it("should complete a round with auto-discards", () => {
      machine.startGame(999);

      let iterations = 0;
      const maxIterations = 500;

      while (
        !machine.isRoundOver() &&
        !machine.isGameOver() &&
        iterations < maxIterations
      ) {
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
      // Should have finished the round
      expect(
        machine.isRoundOver() || machine.isGameOver()
      ).toBe(true);
    });

    it("should track event log correctly", () => {
      machine.startGame(123);
      const initialLogLength = machine.getEventLog().length;
      expect(initialLogLength).toBeGreaterThan(0);

      // Do one auto-discard
      const state = machine.getState();
      machine.autoDiscard(state.dealerSeat);

      expect(machine.getEventLog().length).toBeGreaterThan(initialLogLength);
    });
  });
});

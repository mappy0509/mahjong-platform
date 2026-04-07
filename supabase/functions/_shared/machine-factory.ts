// Helpers to construct the right GameMachine flavor (4p / 3p) from saved state.
import { GameMachine, SanmaGameMachine } from "./engine.js";

export type AnyMachine = GameMachine | SanmaGameMachine;

/** Determine player count from saved state (scores array length). */
export function detectPlayerCount(state: any): 3 | 4 {
  if (!state) return 4;
  if (Array.isArray(state.scores) && state.scores.length === 3) return 3;
  if (state.rules?.playerCount === 3) return 3;
  return 4;
}

/** Construct the right machine flavor from a saved state. */
export function machineFromState(state: any): AnyMachine {
  return detectPlayerCount(state) === 3
    ? new SanmaGameMachine(state)
    : new GameMachine(state);
}

/** True if the given player count uses sanma. */
export function isSanma(playerCount: number | undefined): boolean {
  return playerCount === 3;
}

/**
 * 三人麻雀 (Sanma / 3-player mahjong) module.
 *
 * Usage:
 *   import { SanmaGameMachine, createSanmaInitialState, SANMA_DEFAULT_RULES } from "@mahjong/engine";
 */

export * from "./types";
export { createSanmaWall } from "./wall";
export { sanmaReducer, createSanmaInitialState, advanceSanmaRound } from "./reducer";
export { SanmaGameMachine } from "./machine";
export type { SanmaGameAction } from "./machine";

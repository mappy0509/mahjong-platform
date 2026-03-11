import type { TileId } from "@mahjong/shared";
import {
  TOTAL_TILES,
  DEAD_WALL_SIZE,
  DORA_INDICATOR_COUNT,
} from "@mahjong/shared";
import { SeededRNG } from "./rng";
import { tileKind } from "./tile";

export interface Wall {
  /** Remaining live tiles (draw from front) */
  liveTiles: TileId[];
  /** Dead wall (14 tiles) */
  deadWall: TileId[];
  /** Number of revealed dora indicators */
  doraIndicatorCount: number;
  /** Number of kan dora revealed */
  kanDoraCount: number;
}

/**
 * Roll two dice using the RNG (1-6 each).
 */
export function rollDice(seed: number): [number, number] {
  const rng = new SeededRNG(seed);
  const die1 = (rng.next() % 6) + 1;
  const die2 = (rng.next() % 6) + 1;
  return [die1, die2];
}

/**
 * Calculate wall break position from dice result.
 * In real mahjong, the dealer counts walls counter-clockwise starting from themselves,
 * then counts stacks from the right end of that wall.
 * We simulate this as an offset into the shuffled tile array.
 * Returns the number of tiles to skip from the start before dealing.
 */
export function calculateWallBreakPosition(diceTotal: number): number {
  // Each side has 34 tiles (17 stacks × 2). Total 136.
  // The break position skips (diceTotal × 2) tiles from a reference point.
  // This ensures different dice rolls produce different dealing orders.
  return (diceTotal * 2) % TOTAL_TILES;
}

/** Create a shuffled wall from a seed, with optional wall break position */
export function createWall(seed: number, wallBreakPosition: number = 0): Wall {
  const rng = new SeededRNG(seed);

  // Create all 136 tiles
  const tiles: TileId[] = [];
  for (let i = 0; i < TOTAL_TILES; i++) {
    tiles.push(i);
  }

  // Deterministic shuffle
  rng.shuffle(tiles);

  // Apply wall break: rotate the array so dealing starts from break position
  if (wallBreakPosition > 0) {
    const pos = wallBreakPosition % tiles.length;
    const rotated = [...tiles.slice(pos), ...tiles.slice(0, pos)];
    tiles.length = 0;
    tiles.push(...rotated);
  }

  // Split: last 14 tiles are dead wall (behind the break point)
  const deadWall = tiles.splice(tiles.length - DEAD_WALL_SIZE, DEAD_WALL_SIZE);

  return {
    liveTiles: tiles,
    deadWall,
    doraIndicatorCount: 1,
    kanDoraCount: 0,
  };
}

/** Draw a tile from the live wall */
export function drawTile(wall: Wall): { tile: TileId; wall: Wall } | null {
  if (wall.liveTiles.length === 0) return null;

  const tile = wall.liveTiles[0];
  return {
    tile,
    wall: {
      ...wall,
      liveTiles: wall.liveTiles.slice(1),
    },
  };
}

/** Draw a tile from dead wall (for kan replacement) */
export function drawFromDeadWall(
  wall: Wall
): { tile: TileId; wall: Wall } | null {
  if (wall.deadWall.length === 0) return null;

  // Draw from the end of dead wall (replacement tile)
  const tile = wall.deadWall[wall.deadWall.length - 1];

  // Move one tile from live wall to dead wall to maintain size
  const newLive = [...wall.liveTiles];
  const replenish = newLive.pop();
  const newDead = [...wall.deadWall.slice(0, -1)];
  if (replenish !== undefined) {
    newDead.unshift(replenish);
  }

  return {
    tile,
    wall: {
      ...wall,
      liveTiles: newLive,
      deadWall: newDead,
      kanDoraCount: wall.kanDoraCount + 1,
      doraIndicatorCount: Math.min(
        wall.doraIndicatorCount + 1,
        DORA_INDICATOR_COUNT
      ),
    },
  };
}

/** Get the current dora indicator tile IDs */
export function getDoraIndicators(wall: Wall): TileId[] {
  // Dora indicators are at positions 4, 6, 8, 10, 12 in dead wall (every other from index 4)
  const indicators: TileId[] = [];
  for (let i = 0; i < wall.doraIndicatorCount; i++) {
    const idx = 4 + i * 2;
    if (idx < wall.deadWall.length) {
      indicators.push(wall.deadWall[idx]);
    }
  }
  return indicators;
}

/** Get uradora indicators (under the dora indicators) */
export function getUraDoraIndicators(wall: Wall): TileId[] {
  const indicators: TileId[] = [];
  for (let i = 0; i < wall.doraIndicatorCount; i++) {
    const idx = 5 + i * 2;
    if (idx < wall.deadWall.length) {
      indicators.push(wall.deadWall[idx]);
    }
  }
  return indicators;
}

/** Get the number of remaining drawable tiles */
export function tilesRemaining(wall: Wall): number {
  return wall.liveTiles.length;
}

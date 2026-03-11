/**
 * 三人麻雀 wall creation.
 * Removes Man 2-8 tiles (tileIds for kinds 1-7).
 * Total: 27 kinds × 4 = 108 tiles
 * Dead wall: 14, Live wall: 94
 */

import type { TileId } from "@mahjong/shared";
import { DEAD_WALL_SIZE } from "@mahjong/shared";
import { SeededRNG } from "../rng";
import { tileKind } from "../tile";
import type { Wall } from "../wall";
import { EXCLUDED_MAN_KINDS } from "./types";

/** Check if a tileId belongs to an excluded kind (Man 2-8) */
function isExcludedTile(tileId: TileId): boolean {
  const kind = tileKind(tileId);
  return EXCLUDED_MAN_KINDS.includes(kind);
}

/** Create a shuffled wall for 3-player mahjong */
export function createSanmaWall(seed: number): Wall {
  const rng = new SeededRNG(seed);

  // Create tiles, excluding Man 2-8 (kinds 1-7)
  const tiles: TileId[] = [];
  for (let i = 0; i < 136; i++) {
    if (!isExcludedTile(i)) {
      tiles.push(i);
    }
  }

  // Should be 108 tiles: (34 - 7) * 4
  // Deterministic shuffle
  rng.shuffle(tiles);

  // Split: last 14 tiles are dead wall
  const deadWall = tiles.splice(tiles.length - DEAD_WALL_SIZE, DEAD_WALL_SIZE);

  return {
    liveTiles: tiles, // 94 live tiles
    deadWall,
    doraIndicatorCount: 1,
    kanDoraCount: 0,
  };
}

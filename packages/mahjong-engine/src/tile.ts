import type { TileKind, TileId } from "@mahjong/shared";
import {
  TILE_KINDS,
  TILES_PER_KIND,
  MAN_START,
  PIN_START,
  SOU_START,
  WIND_START,
  DRAGON_START,
  RED_MAN_5,
  RED_PIN_5,
  RED_SOU_5,
} from "@mahjong/shared";
import { TileSuit } from "@mahjong/shared";

// ===== TileId <-> TileKind Conversion =====

/** Get the TileKind (0-33) from a TileId (0-135) */
export function tileKind(tileId: TileId): TileKind {
  return Math.floor(tileId / TILES_PER_KIND);
}

/** Get the copy index (0-3) from a TileId */
export function tileCopy(tileId: TileId): number {
  return tileId % TILES_PER_KIND;
}

/** Create a TileId from TileKind and copy index */
export function makeTileId(kind: TileKind, copy: number): TileId {
  return kind * TILES_PER_KIND + copy;
}

/** Get all 4 TileIds for a given TileKind */
export function allTileIds(kind: TileKind): TileId[] {
  return [0, 1, 2, 3].map((c) => makeTileId(kind, c));
}

// ===== Tile Properties =====

export function tileSuit(kind: TileKind): TileSuit {
  if (kind < PIN_START) return TileSuit.MAN;
  if (kind < SOU_START) return TileSuit.PIN;
  if (kind < WIND_START) return TileSuit.SOU;
  if (kind < DRAGON_START) return TileSuit.WIND;
  return TileSuit.DRAGON;
}

/** Get the number (1-9) for numbered tiles, or 0 for honor tiles */
export function tileNumber(kind: TileKind): number {
  if (kind >= WIND_START) return 0;
  return (kind % 9) + 1;
}

export function isNumberTile(kind: TileKind): boolean {
  return kind < WIND_START;
}

export function isHonorTile(kind: TileKind): boolean {
  return kind >= WIND_START;
}

export function isWindTile(kind: TileKind): boolean {
  return kind >= WIND_START && kind < DRAGON_START;
}

export function isDragonTile(kind: TileKind): boolean {
  return kind >= DRAGON_START;
}

export function isTerminal(kind: TileKind): boolean {
  if (!isNumberTile(kind)) return false;
  const n = tileNumber(kind);
  return n === 1 || n === 9;
}

export function isTerminalOrHonor(kind: TileKind): boolean {
  return isTerminal(kind) || isHonorTile(kind);
}

export function isSimple(kind: TileKind): boolean {
  if (!isNumberTile(kind)) return false;
  const n = tileNumber(kind);
  return n >= 2 && n <= 8;
}

export function isGreenTile(kind: TileKind): boolean {
  // 緑一色 tiles: 2s, 3s, 4s, 6s, 8s, 発
  if (kind === 32) return true; // HATSU
  if (tileSuit(kind) !== TileSuit.SOU) return false;
  const n = tileNumber(kind);
  return n === 2 || n === 3 || n === 4 || n === 6 || n === 8;
}

/** Check if a TileId is a red dora */
export function isRedDora(tileId: TileId): boolean {
  return (
    tileId === RED_MAN_5 || tileId === RED_PIN_5 || tileId === RED_SOU_5
  );
}

/** Get the dora tile kind from an indicator tile kind */
export function doraFromIndicator(indicatorKind: TileKind): TileKind {
  if (isNumberTile(indicatorKind)) {
    const suit = tileSuit(indicatorKind);
    const n = tileNumber(indicatorKind);
    const base =
      suit === TileSuit.MAN
        ? MAN_START
        : suit === TileSuit.PIN
          ? PIN_START
          : SOU_START;
    return base + (n % 9); // wraps 9 -> 1
  }
  if (isWindTile(indicatorKind)) {
    return WIND_START + ((indicatorKind - WIND_START + 1) % 4);
  }
  // Dragon: 白→發→中→白
  return DRAGON_START + ((indicatorKind - DRAGON_START + 1) % 3);
}

/** Sort tile kinds in standard order */
export function sortTileKinds(kinds: TileKind[]): TileKind[] {
  return [...kinds].sort((a, b) => a - b);
}

/** Sort tile IDs by their kind */
export function sortTileIds(ids: TileId[]): TileId[] {
  return [...ids].sort((a, b) => {
    const ka = tileKind(a);
    const kb = tileKind(b);
    if (ka !== kb) return ka - kb;
    return a - b;
  });
}

/** Create a human-readable string for a tile kind */
export function tileKindToString(kind: TileKind): string {
  const suit = tileSuit(kind);
  if (suit === TileSuit.MAN) return `${tileNumber(kind)}m`;
  if (suit === TileSuit.PIN) return `${tileNumber(kind)}p`;
  if (suit === TileSuit.SOU) return `${tileNumber(kind)}s`;
  const names = ["東", "南", "西", "北", "白", "發", "中"];
  return names[kind - WIND_START];
}

/** Count occurrences of each tile kind in a set of tile IDs */
export function countByKind(tileIds: TileId[]): number[] {
  const counts = new Array(TILE_KINDS).fill(0);
  for (const id of tileIds) {
    counts[tileKind(id)]++;
  }
  return counts;
}

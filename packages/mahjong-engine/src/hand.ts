import type { TileKind, TileId } from "@mahjong/shared";
import { TILE_KINDS } from "@mahjong/shared";
import { tileKind, isNumberTile, countByKind } from "./tile";

/**
 * A decomposed hand: pair + mentsu (groups of 3)
 */
export interface HandDecomposition {
  pair: TileKind;
  mentsu: Mentsu[];
}

export interface Mentsu {
  type: "shuntsu" | "koutsu"; // sequence | triplet
  tiles: TileKind[]; // the tile kinds in the group
}

/**
 * Find all valid decompositions of a hand into 1 pair + N mentsu.
 * Input: array of 14 tile kinds (or 2 for chiitoi check, etc.)
 * For standard win: 14 tiles -> 1 pair + 4 mentsu
 */
export function decomposeHand(tileKinds: TileKind[]): HandDecomposition[] {
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;

  const results: HandDecomposition[] = [];

  // Try each possible pair
  for (let pair = 0; pair < TILE_KINDS; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const mentsu: Mentsu[] = [];
    findMentsu(counts, 0, mentsu, results, pair);
    counts[pair] += 2;
  }

  return results;
}

function findMentsu(
  counts: number[],
  startKind: number,
  current: Mentsu[],
  results: HandDecomposition[],
  pair: TileKind
): void {
  // Find the first kind with remaining tiles
  let idx = startKind;
  while (idx < TILE_KINDS && counts[idx] === 0) idx++;

  if (idx >= TILE_KINDS) {
    // All tiles consumed -> valid decomposition
    results.push({ pair, mentsu: [...current] });
    return;
  }

  // Try koutsu (triplet)
  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    current.push({ type: "koutsu", tiles: [idx, idx, idx] });
    findMentsu(counts, idx, current, results, pair);
    current.pop();
    counts[idx] += 3;
  }

  // Try shuntsu (sequence) - only for number tiles
  if (isNumberTile(idx) && idx % 9 <= 6) {
    // can form sequence (not 8 or 9 of suit)
    const next1 = idx + 1;
    const next2 = idx + 2;
    if (
      next1 < TILE_KINDS &&
      next2 < TILE_KINDS &&
      Math.floor(idx / 9) === Math.floor(next2 / 9) && // same suit
      counts[next1] > 0 &&
      counts[next2] > 0
    ) {
      counts[idx]--;
      counts[next1]--;
      counts[next2]--;
      current.push({ type: "shuntsu", tiles: [idx, next1, next2] });
      findMentsu(counts, idx, current, results, pair);
      current.pop();
      counts[idx]++;
      counts[next1]++;
      counts[next2]++;
    }
  }
}

/**
 * Check for seven pairs (七対子)
 * Returns true if the 14 tiles form 7 distinct pairs
 */
export function isSevenPairs(tileKinds: TileKind[]): boolean {
  if (tileKinds.length !== 14) return false;
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;

  let pairs = 0;
  for (let i = 0; i < TILE_KINDS; i++) {
    if (counts[i] === 2) pairs++;
    else if (counts[i] !== 0) return false;
  }
  return pairs === 7;
}

/**
 * Check for thirteen orphans (国士無双)
 * Returns true if the 14 tiles contain all 13 terminal/honor tiles + 1 duplicate
 */
export function isThirteenOrphans(tileKinds: TileKind[]): boolean {
  if (tileKinds.length !== 14) return false;
  // Terminal and honor tiles: 1m,9m,1p,9p,1s,9s,東,南,西,北,白,發,中
  const required = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;

  let hasPair = false;
  for (const r of required) {
    if (counts[r] === 0) return false;
    if (counts[r] === 2) hasPair = true;
    if (counts[r] > 2) return false;
  }

  // Check no other tiles
  const total = required.reduce((sum, r) => sum + counts[r], 0);
  return total === 14 && hasPair;
}

/**
 * Check if a set of tiles forms a winning hand
 */
export function isWinningHand(tileKinds: TileKind[]): boolean {
  if (tileKinds.length !== 14) return false;
  if (isThirteenOrphans(tileKinds)) return true;
  if (isSevenPairs(tileKinds)) return true;
  return decomposeHand(tileKinds).length > 0;
}

/**
 * Calculate shanten number (向聴数)
 * -1 = tenpai with winning tile, 0 = tenpai, 1 = iishanten, etc.
 */
export function calculateShanten(tileKinds: TileKind[]): number {
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;

  const regular = regularShanten(counts, tileKinds.length);
  const chiitoi = chiitoiShanten(counts, tileKinds.length);
  const kokushi = kokushiShanten(counts, tileKinds.length);

  return Math.min(regular, chiitoi, kokushi);
}

function regularShanten(counts: number[], handSize: number): number {
  const targetMentsu = Math.floor((handSize - 2) / 3);
  let minShanten = 8; // max possible

  // Try each possible pair
  for (let pair = 0; pair < TILE_KINDS; pair++) {
    if (counts[pair] >= 2) {
      counts[pair] -= 2;
      const { mentsu, partials } = countMentsuAndPartials(counts);
      const effective = Math.min(mentsu + partials, targetMentsu);
      const shanten = targetMentsu * 2 - mentsu * 2 - effective;
      minShanten = Math.min(minShanten, shanten);
      counts[pair] += 2;
    }
  }

  // No pair
  {
    const { mentsu, partials } = countMentsuAndPartials(counts);
    const effective = Math.min(mentsu + partials, targetMentsu);
    const shanten = targetMentsu * 2 - mentsu * 2 - effective + 1;
    minShanten = Math.min(minShanten, shanten);
  }

  return minShanten;
}

function countMentsuAndPartials(counts: number[]): {
  mentsu: number;
  partials: number;
} {
  let bestMentsu = 0;
  let bestPartials = 0;

  function search(idx: number, mentsu: number, partials: number): void {
    // Find next tile
    while (idx < TILE_KINDS && counts[idx] === 0) idx++;
    if (idx >= TILE_KINDS) {
      if (
        mentsu > bestMentsu ||
        (mentsu === bestMentsu && partials > bestPartials)
      ) {
        bestMentsu = mentsu;
        bestPartials = partials;
      }
      return;
    }

    // Try koutsu
    if (counts[idx] >= 3) {
      counts[idx] -= 3;
      search(idx, mentsu + 1, partials);
      counts[idx] += 3;
    }

    // Try shuntsu
    if (isNumberTile(idx) && idx % 9 <= 6) {
      const n1 = idx + 1;
      const n2 = idx + 2;
      if (
        n1 < TILE_KINDS &&
        n2 < TILE_KINDS &&
        Math.floor(idx / 9) === Math.floor(n2 / 9) &&
        counts[n1] > 0 &&
        counts[n2] > 0
      ) {
        counts[idx]--;
        counts[n1]--;
        counts[n2]--;
        search(idx, mentsu + 1, partials);
        counts[idx]++;
        counts[n1]++;
        counts[n2]++;
      }
    }

    // Try partial koutsu (pair)
    if (counts[idx] >= 2) {
      counts[idx] -= 2;
      search(idx, mentsu, partials + 1);
      counts[idx] += 2;
    }

    // Try partial shuntsu (adjacent)
    if (isNumberTile(idx) && idx % 9 <= 7) {
      const n1 = idx + 1;
      if (
        n1 < TILE_KINDS &&
        Math.floor(idx / 9) === Math.floor(n1 / 9) &&
        counts[n1] > 0
      ) {
        counts[idx]--;
        counts[n1]--;
        search(idx, mentsu, partials + 1);
        counts[idx]++;
        counts[n1]++;
      }
    }

    // Try partial shuntsu (skip one)
    if (isNumberTile(idx) && idx % 9 <= 6) {
      const n2 = idx + 2;
      if (
        n2 < TILE_KINDS &&
        Math.floor(idx / 9) === Math.floor(n2 / 9) &&
        counts[n2] > 0
      ) {
        counts[idx]--;
        counts[n2]--;
        search(idx, mentsu, partials + 1);
        counts[idx]++;
        counts[n2]++;
      }
    }

    // Skip this tile
    const saved = counts[idx];
    counts[idx] = 0;
    search(idx + 1, mentsu, partials);
    counts[idx] = saved;
  }

  search(0, 0, 0);
  return { mentsu: bestMentsu, partials: bestPartials };
}

function chiitoiShanten(counts: number[], handSize: number): number {
  if (handSize < 13) return 99;
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < TILE_KINDS; i++) {
    if (counts[i] >= 2) pairs++;
    if (counts[i] >= 1) kinds++;
  }
  // Need 7 pairs, and at least 7 different kinds
  const shanten = 6 - pairs;
  return shanten;
}

function kokushiShanten(counts: number[], handSize: number): number {
  if (handSize < 13) return 99;
  const required = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let found = 0;
  let hasPair = false;
  for (const r of required) {
    if (counts[r] >= 1) found++;
    if (counts[r] >= 2) hasPair = true;
  }
  return 13 - found - (hasPair ? 1 : 0);
}

/**
 * Find all tiles that would complete the hand (tenpai waiting tiles)
 */
export function findWaitingTiles(tileKinds: TileKind[]): TileKind[] {
  if (tileKinds.length !== 13) return [];

  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;

  const waits: TileKind[] = [];
  for (let k = 0; k < TILE_KINDS; k++) {
    if (counts[k] >= 4) continue; // all 4 copies used
    counts[k]++;
    const testHand = [...tileKinds, k];
    if (isWinningHand(testHand)) {
      waits.push(k);
    }
    counts[k]--;
  }

  return waits;
}

/**
 * Check if hand is in tenpai (waiting for a winning tile)
 */
export function isTenpai(tileKinds: TileKind[]): boolean {
  return findWaitingTiles(tileKinds).length > 0;
}

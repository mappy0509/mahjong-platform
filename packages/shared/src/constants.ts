// Tile system constants
export const TILE_KINDS = 34;
export const TOTAL_TILES = 136;
export const TILES_PER_KIND = 4;
export const HAND_SIZE = 13;
export const WINNING_HAND_SIZE = 14;

// Tile kind ranges
export const MAN_START = 0; // 一萬 ~ 九萬: 0-8
export const PIN_START = 9; // 一筒 ~ 九筒: 9-17
export const SOU_START = 18; // 一索 ~ 九索: 18-26
export const WIND_START = 27; // 東南西北: 27-30
export const DRAGON_START = 31; // 白發中: 31-33

// Specific tile kinds
export const EAST_WIND = 27;
export const SOUTH_WIND = 28;
export const WEST_WIND = 29;
export const NORTH_WIND = 30;
export const HAKU = 31; // 白
export const HATSU = 32; // 發
export const CHUN = 33; // 中

// Red dora tile IDs (copy index 0 of each 5)
export const RED_MAN_5 = 4 * 4; // TileId 16 (5萬 red)
export const RED_PIN_5 = 13 * 4; // TileId 52 (5筒 red)
export const RED_SOU_5 = 22 * 4; // TileId 88 (5索 red)

// Game constants
export const INITIAL_POINTS = 25000;
export const RETURN_POINTS = 30000;
export const RIICHI_DEPOSIT = 1000;

// Wall constants
export const WALL_SIZE = 136;
export const DEAD_WALL_SIZE = 14;
export const DORA_INDICATOR_COUNT = 5; // max dora indicators
export const INITIAL_DORA_INDICATORS = 1;

// Turn timer
export const TURN_TIMEOUT_MS = 10000; // 10 seconds
export const DISCONNECT_GRACE_MS = 60000; // 60 seconds
export const RECONNECT_RESTORE_MS = 1000; // target 1 second restore

// Ceremony durations (ms)
export const SEAT_DRAW_DURATION_MS = 3000; // 場決め演出
export const DICE_ROLL_DURATION_MS = 2000; // サイコロ演出
export const DEALING_DURATION_MS = 2000; // 配牌演出

// GPS
export const GPS_DEFAULT_RESTRICTION_KM = 0; // 0 = disabled

/**
 * Haversine distance in km between two lat/lng points.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Default rules — 4p
export const DEFAULT_RULES = {
  playerCount: 4 as 3 | 4,
  roundType: "south" as const,
  startPoints: INITIAL_POINTS,
  returnPoints: RETURN_POINTS,
  uma: [30, 10, -10, -30] as number[],
  hasRedDora: true,
  hasOpenTanyao: true,
};

// Default rules — 3p (sanma)
export const SANMA_DEFAULT_RULES = {
  playerCount: 3 as 3 | 4,
  roundType: "south" as const,
  startPoints: 35000,
  returnPoints: 40000,
  uma: [20, 0, -20] as number[],
  hasRedDora: true,
  hasOpenTanyao: true,
  hasNukidora: true,
};

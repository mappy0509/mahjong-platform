/**
 * 牌の表現。
 *  Kind: 0..33  (萬1-9=0..8, 筒1-9=9..17, 索1-9=18..26, 東南西北=27..30, 白發中=31..33)
 *  Tile: 0..135 (kind = tile >> 2)。赤ドラは 5萬/5筒/5索 のうち tile % 4 === 0 の1枚。
 */
export type Kind = number;
export type Tile = number;

export const KINDS = 34;
export const EAST = 27, SOUTH = 28, WEST = 29, NORTH = 30, HAKU = 31, HATSU = 32, CHUN = 33;

export const kindOf = (t: Tile): Kind => t >> 2;
export const suitOf = (k: Kind): number => (k < 27 ? Math.floor(k / 9) : 3);
/** 数牌の数字 1..9（字牌は 0） */
export const numOf = (k: Kind): number => (k < 27 ? (k % 9) + 1 : 0);
export const isHonor = (k: Kind): boolean => k >= 27;
export const isTerminal = (k: Kind): boolean => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isYaochu = (k: Kind): boolean => isHonor(k) || isTerminal(k);
export const isDragon = (k: Kind): boolean => k >= 31;
export const isWind = (k: Kind): boolean => k >= 27 && k <= 30;
export const isGreen = (k: Kind): boolean => k === 19 || k === 20 || k === 21 || k === 23 || k === 25 || k === HATSU;

export const YAOCHU_KINDS: Kind[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

/** 赤ドラか（ルールで赤ありのときだけ意味を持つ） */
export const isAkaTile = (t: Tile): boolean => {
  const k = t >> 2;
  return (t & 3) === 0 && (k === 4 || k === 13 || k === 22);
};

/** ドラ表示牌 → ドラ。sanma=true のとき 1萬の次は 9萬。 */
export function doraFromIndicator(k: Kind, sanma = false): Kind {
  if (k < 27) {
    if (sanma && k === 0) return 8;
    return k % 9 === 8 ? k - 8 : k + 1;
  }
  if (k <= 30) return k === 30 ? 27 : k + 1;
  return k === 33 ? 31 : k + 1;
}

export function countsOf(tiles: Tile[]): number[] {
  const c = new Array<number>(KINDS).fill(0);
  for (const t of tiles) c[t >> 2]++;
  return c;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  // 赤5は通常の5の直前に並ぶ（id が小さい）
  return [...tiles].sort((a, b) => a - b);
}

const SUIT_CH = ['m', 'p', 's', 'z'];

/** 例: "123m406p789s1122z" → Kind[]（0 は赤5）。返り値は {kinds, aka}。 */
export function parseKinds(s: string): { kind: Kind; aka: boolean }[] {
  const out: { kind: Kind; aka: boolean }[] = [];
  let buf: string[] = [];
  for (const ch of s.replace(/\s/g, '')) {
    const si = SUIT_CH.indexOf(ch);
    if (si < 0) {
      buf.push(ch);
      continue;
    }
    for (const d of buf) {
      const n = Number(d);
      if (n === 0) out.push({ kind: si * 9 + 4, aka: true });
      else out.push({ kind: si * 9 + (n - 1), aka: false });
    }
    buf = [];
  }
  return out;
}

/**
 * 表記から具体的な Tile id を割り当てる（テスト・デバッグ用）。
 * used に渡した集合と衝突しない id を選ぶ。赤指定(0)は id%4==0、通常の5は id%4!=0 を使う。
 */
export function tilesFromString(s: string, used: Set<Tile> = new Set()): Tile[] {
  const out: Tile[] = [];
  for (const { kind, aka } of parseKinds(s)) {
    const akaKind = kind === 4 || kind === 13 || kind === 22;
    let found = -1;
    for (let i = 0; i < 4; i++) {
      const t = kind * 4 + i;
      if (used.has(t)) continue;
      if (akaKind && aka !== (i === 0)) continue;
      found = t;
      break;
    }
    // 通常の5が尽きていたら赤で代用する
    if (found < 0 && akaKind && !aka && !used.has(kind * 4)) found = kind * 4;
    if (found < 0) throw new Error(`no tile left for kind ${kind} in "${s}"`);
    used.add(found);
    out.push(found);
  }
  return out;
}

export function kindToString(k: Kind): string {
  return `${k < 27 ? (k % 9) + 1 : k - 26}${SUIT_CH[suitOf(k)]}`;
}

export function tileToString(t: Tile): string {
  const k = t >> 2;
  if (isAkaTile(t)) return `0${SUIT_CH[suitOf(k)]}`;
  return kindToString(k);
}

export function tilesToString(tiles: Tile[]): string {
  const sorted = sortTiles(tiles);
  let out = '';
  let cur = -1;
  let buf = '';
  for (const t of sorted) {
    const s = suitOf(t >> 2);
    if (s !== cur) {
      if (buf) out += buf + SUIT_CH[cur];
      buf = '';
      cur = s;
    }
    buf += isAkaTile(t) ? '0' : String(s < 3 ? ((t >> 2) % 9) + 1 : (t >> 2) - 26);
  }
  if (buf) out += buf + SUIT_CH[cur];
  return out;
}

// packages/shared/src/constants.ts
var TILE_KINDS = 34;
var TOTAL_TILES = 136;
var TILES_PER_KIND = 4;
var MAN_START = 0;
var PIN_START = 9;
var SOU_START = 18;
var WIND_START = 27;
var DRAGON_START = 31;
var EAST_WIND = 27;
var HAKU = 31;
var HATSU = 32;
var CHUN = 33;
var RED_MAN_5 = 4 * 4;
var RED_PIN_5 = 13 * 4;
var RED_SOU_5 = 22 * 4;
var INITIAL_POINTS = 25e3;
var RIICHI_DEPOSIT = 1e3;
var DEAD_WALL_SIZE = 14;
var DORA_INDICATOR_COUNT = 5;

// packages/mahjong-engine/src/tile.ts
function tileKind(tileId) {
  return Math.floor(tileId / TILES_PER_KIND);
}
function tileCopy(tileId) {
  return tileId % TILES_PER_KIND;
}
function makeTileId(kind, copy) {
  return kind * TILES_PER_KIND + copy;
}
function allTileIds(kind) {
  return [0, 1, 2, 3].map((c) => makeTileId(kind, c));
}
function tileSuit(kind) {
  if (kind < PIN_START) return "man" /* MAN */;
  if (kind < SOU_START) return "pin" /* PIN */;
  if (kind < WIND_START) return "sou" /* SOU */;
  if (kind < DRAGON_START) return "wind" /* WIND */;
  return "dragon" /* DRAGON */;
}
function tileNumber(kind) {
  if (kind >= WIND_START) return 0;
  return kind % 9 + 1;
}
function isNumberTile(kind) {
  return kind < WIND_START;
}
function isHonorTile(kind) {
  return kind >= WIND_START;
}
function isWindTile(kind) {
  return kind >= WIND_START && kind < DRAGON_START;
}
function isDragonTile(kind) {
  return kind >= DRAGON_START;
}
function isTerminal(kind) {
  if (!isNumberTile(kind)) return false;
  const n = tileNumber(kind);
  return n === 1 || n === 9;
}
function isTerminalOrHonor(kind) {
  return isTerminal(kind) || isHonorTile(kind);
}
function isSimple(kind) {
  if (!isNumberTile(kind)) return false;
  const n = tileNumber(kind);
  return n >= 2 && n <= 8;
}
function isGreenTile(kind) {
  if (kind === 32) return true;
  if (tileSuit(kind) !== "sou" /* SOU */) return false;
  const n = tileNumber(kind);
  return n === 2 || n === 3 || n === 4 || n === 6 || n === 8;
}
function isRedDora(tileId) {
  return tileId === RED_MAN_5 || tileId === RED_PIN_5 || tileId === RED_SOU_5;
}
function doraFromIndicator(indicatorKind) {
  if (isNumberTile(indicatorKind)) {
    const suit = tileSuit(indicatorKind);
    const n = tileNumber(indicatorKind);
    const base = suit === "man" /* MAN */ ? MAN_START : suit === "pin" /* PIN */ ? PIN_START : SOU_START;
    return base + n % 9;
  }
  if (isWindTile(indicatorKind)) {
    return WIND_START + (indicatorKind - WIND_START + 1) % 4;
  }
  return DRAGON_START + (indicatorKind - DRAGON_START + 1) % 3;
}
function sortTileKinds(kinds) {
  return [...kinds].sort((a, b) => a - b);
}
function sortTileIds(ids) {
  return [...ids].sort((a, b) => {
    const ka = tileKind(a);
    const kb = tileKind(b);
    if (ka !== kb) return ka - kb;
    return a - b;
  });
}
function tileKindToString(kind) {
  const suit = tileSuit(kind);
  if (suit === "man" /* MAN */) return `${tileNumber(kind)}m`;
  if (suit === "pin" /* PIN */) return `${tileNumber(kind)}p`;
  if (suit === "sou" /* SOU */) return `${tileNumber(kind)}s`;
  const names = ["\u6771", "\u5357", "\u897F", "\u5317", "\u767D", "\u767C", "\u4E2D"];
  return names[kind - WIND_START];
}
function countByKind(tileIds) {
  const counts = new Array(TILE_KINDS).fill(0);
  for (const id of tileIds) {
    counts[tileKind(id)]++;
  }
  return counts;
}

// packages/mahjong-engine/src/rng.ts
var SeededRNG = class {
  s;
  constructor(seed) {
    this.s = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      seed |= 0;
      seed = seed + 2654435769 | 0;
      let t = seed ^ seed >>> 16;
      t = Math.imul(t, 569420461);
      t = t ^ t >>> 15;
      t = Math.imul(t, 1935289751);
      t = t ^ t >>> 15;
      this.s[i] = t >>> 0;
    }
  }
  /** Get next random uint32 (xoshiro128**) */
  next() {
    const s = this.s;
    let result = Math.imul(s[1], 5);
    result = result << 7 | result >>> 25;
    result = Math.imul(result, 9);
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = s[3] << 11 | s[3] >>> 21;
    return result >>> 0;
  }
  /** Random float in [0, 1) */
  random() {
    return this.next() / 4294967296;
  }
  /** Fisher-Yates shuffle (in-place) */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.next() % (i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
};

// packages/mahjong-engine/src/wall.ts
function rollDice(seed) {
  const rng = new SeededRNG(seed);
  const die1 = rng.next() % 6 + 1;
  const die2 = rng.next() % 6 + 1;
  return [die1, die2];
}
function calculateWallBreakPosition(diceTotal) {
  return diceTotal * 2 % TOTAL_TILES;
}
function createWall(seed, wallBreakPosition = 0) {
  const rng = new SeededRNG(seed);
  const tiles = [];
  for (let i = 0; i < TOTAL_TILES; i++) {
    tiles.push(i);
  }
  rng.shuffle(tiles);
  if (wallBreakPosition > 0) {
    const pos = wallBreakPosition % tiles.length;
    const rotated = [...tiles.slice(pos), ...tiles.slice(0, pos)];
    tiles.length = 0;
    tiles.push(...rotated);
  }
  const deadWall = tiles.splice(tiles.length - DEAD_WALL_SIZE, DEAD_WALL_SIZE);
  return {
    liveTiles: tiles,
    deadWall,
    doraIndicatorCount: 1,
    kanDoraCount: 0
  };
}
function drawTile(wall) {
  if (wall.liveTiles.length === 0) return null;
  const tile = wall.liveTiles[0];
  return {
    tile,
    wall: {
      ...wall,
      liveTiles: wall.liveTiles.slice(1)
    }
  };
}
function drawFromDeadWall(wall) {
  if (wall.deadWall.length === 0) return null;
  const tile = wall.deadWall[wall.deadWall.length - 1];
  const newLive = [...wall.liveTiles];
  const replenish = newLive.pop();
  const newDead = [...wall.deadWall.slice(0, -1)];
  if (replenish !== void 0) {
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
      )
    }
  };
}
function getDoraIndicators(wall) {
  const indicators = [];
  for (let i = 0; i < wall.doraIndicatorCount; i++) {
    const idx = 4 + i * 2;
    if (idx < wall.deadWall.length) {
      indicators.push(wall.deadWall[idx]);
    }
  }
  return indicators;
}
function getUraDoraIndicators(wall) {
  const indicators = [];
  for (let i = 0; i < wall.doraIndicatorCount; i++) {
    const idx = 5 + i * 2;
    if (idx < wall.deadWall.length) {
      indicators.push(wall.deadWall[idx]);
    }
  }
  return indicators;
}
function tilesRemaining(wall) {
  return wall.liveTiles.length;
}

// packages/mahjong-engine/src/hand.ts
function decomposeHand(tileKinds) {
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;
  const results = [];
  for (let pair = 0; pair < TILE_KINDS; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const mentsu = [];
    findMentsu(counts, 0, mentsu, results, pair);
    counts[pair] += 2;
  }
  return results;
}
function findMentsu(counts, startKind, current, results, pair) {
  let idx = startKind;
  while (idx < TILE_KINDS && counts[idx] === 0) idx++;
  if (idx >= TILE_KINDS) {
    results.push({ pair, mentsu: [...current] });
    return;
  }
  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    current.push({ type: "koutsu", tiles: [idx, idx, idx] });
    findMentsu(counts, idx, current, results, pair);
    current.pop();
    counts[idx] += 3;
  }
  if (isNumberTile(idx) && idx % 9 <= 6) {
    const next1 = idx + 1;
    const next2 = idx + 2;
    if (next1 < TILE_KINDS && next2 < TILE_KINDS && Math.floor(idx / 9) === Math.floor(next2 / 9) && // same suit
    counts[next1] > 0 && counts[next2] > 0) {
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
function isSevenPairs(tileKinds) {
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
function isThirteenOrphans(tileKinds) {
  if (tileKinds.length !== 14) return false;
  const required = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;
  let hasPair = false;
  for (const r of required) {
    if (counts[r] === 0) return false;
    if (counts[r] === 2) hasPair = true;
    if (counts[r] > 2) return false;
  }
  const total = required.reduce((sum, r) => sum + counts[r], 0);
  return total === 14 && hasPair;
}
function isWinningHand(tileKinds) {
  if (tileKinds.length !== 14) return false;
  if (isThirteenOrphans(tileKinds)) return true;
  if (isSevenPairs(tileKinds)) return true;
  return decomposeHand(tileKinds).length > 0;
}
function calculateShanten(tileKinds) {
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;
  const regular = regularShanten(counts, tileKinds.length);
  const chiitoi = chiitoiShanten(counts, tileKinds.length);
  const kokushi = kokushiShanten(counts, tileKinds.length);
  return Math.min(regular, chiitoi, kokushi);
}
function regularShanten(counts, handSize) {
  const targetMentsu = Math.floor((handSize - 2) / 3);
  let minShanten = 8;
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
  {
    const { mentsu, partials } = countMentsuAndPartials(counts);
    const effective = Math.min(mentsu + partials, targetMentsu);
    const shanten = targetMentsu * 2 - mentsu * 2 - effective + 1;
    minShanten = Math.min(minShanten, shanten);
  }
  return minShanten;
}
function countMentsuAndPartials(counts) {
  let bestMentsu = 0;
  let bestPartials = 0;
  function search(idx, mentsu, partials) {
    while (idx < TILE_KINDS && counts[idx] === 0) idx++;
    if (idx >= TILE_KINDS) {
      if (mentsu > bestMentsu || mentsu === bestMentsu && partials > bestPartials) {
        bestMentsu = mentsu;
        bestPartials = partials;
      }
      return;
    }
    if (counts[idx] >= 3) {
      counts[idx] -= 3;
      search(idx, mentsu + 1, partials);
      counts[idx] += 3;
    }
    if (isNumberTile(idx) && idx % 9 <= 6) {
      const n1 = idx + 1;
      const n2 = idx + 2;
      if (n1 < TILE_KINDS && n2 < TILE_KINDS && Math.floor(idx / 9) === Math.floor(n2 / 9) && counts[n1] > 0 && counts[n2] > 0) {
        counts[idx]--;
        counts[n1]--;
        counts[n2]--;
        search(idx, mentsu + 1, partials);
        counts[idx]++;
        counts[n1]++;
        counts[n2]++;
      }
    }
    if (counts[idx] >= 2) {
      counts[idx] -= 2;
      search(idx, mentsu, partials + 1);
      counts[idx] += 2;
    }
    if (isNumberTile(idx) && idx % 9 <= 7) {
      const n1 = idx + 1;
      if (n1 < TILE_KINDS && Math.floor(idx / 9) === Math.floor(n1 / 9) && counts[n1] > 0) {
        counts[idx]--;
        counts[n1]--;
        search(idx, mentsu, partials + 1);
        counts[idx]++;
        counts[n1]++;
      }
    }
    if (isNumberTile(idx) && idx % 9 <= 6) {
      const n2 = idx + 2;
      if (n2 < TILE_KINDS && Math.floor(idx / 9) === Math.floor(n2 / 9) && counts[n2] > 0) {
        counts[idx]--;
        counts[n2]--;
        search(idx, mentsu, partials + 1);
        counts[idx]++;
        counts[n2]++;
      }
    }
    const saved = counts[idx];
    counts[idx] = 0;
    search(idx + 1, mentsu, partials);
    counts[idx] = saved;
  }
  search(0, 0, 0);
  return { mentsu: bestMentsu, partials: bestPartials };
}
function chiitoiShanten(counts, handSize) {
  if (handSize < 13) return 99;
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < TILE_KINDS; i++) {
    if (counts[i] >= 2) pairs++;
    if (counts[i] >= 1) kinds++;
  }
  const shanten = 6 - pairs;
  return shanten;
}
function kokushiShanten(counts, handSize) {
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
function findWaitingTiles(tileKinds) {
  if (tileKinds.length !== 13) return [];
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of tileKinds) counts[k]++;
  const waits = [];
  for (let k = 0; k < TILE_KINDS; k++) {
    if (counts[k] >= 4) continue;
    counts[k]++;
    const testHand = [...tileKinds, k];
    if (isWinningHand(testHand)) {
      waits.push(k);
    }
    counts[k]--;
  }
  return waits;
}
function isTenpai(tileKinds) {
  return findWaitingTiles(tileKinds).length > 0;
}

// packages/mahjong-engine/src/rules/yaku/yaku-checkers.ts
function allMentsu(ctx) {
  if (!ctx.decomposition) return [];
  return ctx.decomposition.mentsu;
}
function allKindsFlat(ctx) {
  const kinds = [...ctx.handKinds];
  for (const m of ctx.melds) {
    for (const t of m.tiles) {
      kinds.push(tileKind(t));
    }
  }
  return kinds;
}
function allKoutsu(ctx) {
  const result = [];
  for (const m of allMentsu(ctx)) {
    if (m.type === "koutsu") result.push(m.tiles[0]);
  }
  for (const m of ctx.melds) {
    if (m.type === "PON" /* PON */ || m.type === "KAN_OPEN" /* KAN_OPEN */ || m.type === "KAN_CLOSED" /* KAN_CLOSED */ || m.type === "KAN_ADDED" /* KAN_ADDED */) {
      result.push(tileKind(m.tiles[0]));
    }
  }
  return result;
}
function allShuntsu(ctx) {
  const result = [];
  for (const m of allMentsu(ctx)) {
    if (m.type === "shuntsu") result.push(m.tiles);
  }
  for (const m of ctx.melds) {
    if (m.type === "CHI" /* CHI */) {
      result.push(m.tiles.map(tileKind).sort((a, b) => a - b));
    }
  }
  return result;
}
function kanCount(ctx) {
  return ctx.melds.filter(
    (m) => m.type === "KAN_OPEN" /* KAN_OPEN */ || m.type === "KAN_CLOSED" /* KAN_CLOSED */ || m.type === "KAN_ADDED" /* KAN_ADDED */
  ).length;
}
var menzenTsumo = (ctx) => {
  if (!ctx.isMenzen || !ctx.isTsumo) return null;
  return { name: "\u9580\u524D\u6E05\u81EA\u6478\u548C", han: 1 };
};
var riichi = (ctx) => {
  if (!ctx.isRiichi || ctx.isDoubleRiichi) return null;
  return { name: "\u7ACB\u76F4", han: 1 };
};
var ippatsu = (ctx) => {
  if (!ctx.isIppatsu) return null;
  return { name: "\u4E00\u767A", han: 1 };
};
var pinfu = (ctx) => {
  if (!ctx.isMenzen || !ctx.decomposition) return null;
  const dec = ctx.decomposition;
  if (dec.mentsu.some((m) => m.type !== "shuntsu")) return null;
  const pair = dec.pair;
  if (isDragonTile(pair)) return null;
  if (pair === EAST_WIND + ctx.roundWind) return null;
  if (pair === EAST_WIND + ctx.seatWind) return null;
  const winKind = ctx.winTileKind;
  const winMentsu = dec.mentsu.find(
    (m) => m.type === "shuntsu" && m.tiles.includes(winKind)
  );
  if (!winMentsu) return null;
  const sorted = [...winMentsu.tiles].sort((a, b) => a - b);
  if (winKind === sorted[1]) return null;
  if (winKind === sorted[2] && tileNumber(sorted[0]) === 1) return null;
  if (winKind === sorted[0] && tileNumber(sorted[2]) === 9) return null;
  return { name: "\u5E73\u548C", han: 1 };
};
var iipeikou = (ctx) => {
  if (!ctx.isMenzen || !ctx.decomposition) return null;
  const shuntsu = ctx.decomposition.mentsu.filter(
    (m) => m.type === "shuntsu"
  );
  let count = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const s of shuntsu) {
    const key = s.tiles.join(",");
    if (seen.has(key)) {
      count++;
    } else {
      seen.add(key);
    }
  }
  if (count === 2) return null;
  if (count !== 1) return null;
  return { name: "\u4E00\u76C3\u53E3", han: 1 };
};
var tanyao = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (allKinds.every(isSimple)) {
    return { name: "\u65AD\u4E48\u4E5D", han: 1 };
  }
  return null;
};
var yakuhaiHaku = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  if (koutsuList.includes(HAKU)) return { name: "\u5F79\u724C \u767D", han: 1 };
  return null;
};
var yakuhaiHatsu = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  if (koutsuList.includes(HATSU)) return { name: "\u5F79\u724C \u767C", han: 1 };
  return null;
};
var yakuhaiChun = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  if (koutsuList.includes(CHUN)) return { name: "\u5F79\u724C \u4E2D", han: 1 };
  return null;
};
var yakuhaiRoundWind = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  const windKind = EAST_WIND + ctx.roundWind;
  if (koutsuList.includes(windKind)) return { name: "\u5F79\u724C \u5834\u98A8\u724C", han: 1 };
  return null;
};
var yakuhaiSeatWind = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  const windKind = EAST_WIND + ctx.seatWind;
  if (koutsuList.includes(windKind)) return { name: "\u5F79\u724C \u81EA\u98A8\u724C", han: 1 };
  return null;
};
var haitei = (ctx) => {
  if (!ctx.isLastTileDraw || !ctx.isTsumo) return null;
  return { name: "\u6D77\u5E95\u6478\u6708", han: 1 };
};
var houtei = (ctx) => {
  if (!ctx.isLastDiscard || !ctx.isTsumo) return null;
  return { name: "\u6CB3\u5E95\u6488\u9B5A", han: 1 };
};
var rinshan = (ctx) => {
  if (!ctx.isRinshan) return null;
  return { name: "\u5DBA\u4E0A\u958B\u82B1", han: 1 };
};
var chankan = (ctx) => {
  if (!ctx.isChankan) return null;
  return { name: "\u6436\u69D3", han: 1 };
};
var doubleRiichi = (ctx) => {
  if (!ctx.isDoubleRiichi) return null;
  return { name: "\u30C0\u30D6\u30EB\u7ACB\u76F4", han: 2 };
};
var chanta = (ctx) => {
  if (!ctx.decomposition) return null;
  const dec = ctx.decomposition;
  if (!isTerminalOrHonor(dec.pair)) return null;
  for (const m of dec.mentsu) {
    if (!m.tiles.some(isTerminalOrHonor)) return null;
  }
  for (const m of ctx.melds) {
    if (!m.tiles.some((t) => isTerminalOrHonor(tileKind(t)))) return null;
  }
  const hasShuntsu = allShuntsu(ctx).length > 0;
  if (!hasShuntsu) return null;
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.some(isHonorTile)) return null;
  return { name: "\u6DF7\u5168\u5E2F\u4E48\u4E5D", han: ctx.isMenzen ? 2 : 1 };
};
var sanshokuDoujun = (ctx) => {
  const shuntsu = allShuntsu(ctx);
  for (const s of shuntsu) {
    const num = s[0] % 9;
    const hasSuits = [false, false, false];
    for (const s2 of shuntsu) {
      if (s2[0] % 9 === num) {
        const suitIdx = Math.floor(s2[0] / 9);
        if (suitIdx < 3) hasSuits[suitIdx] = true;
      }
    }
    if (hasSuits[0] && hasSuits[1] && hasSuits[2]) {
      return { name: "\u4E09\u8272\u540C\u9806", han: ctx.isMenzen ? 2 : 1 };
    }
  }
  return null;
};
var ikkitsuukan = (ctx) => {
  const shuntsu = allShuntsu(ctx);
  for (let suit = 0; suit < 3; suit++) {
    const base = suit * 9;
    const has123 = shuntsu.some((s) => s[0] === base);
    const has456 = shuntsu.some((s) => s[0] === base + 3);
    const has789 = shuntsu.some((s) => s[0] === base + 6);
    if (has123 && has456 && has789) {
      return { name: "\u4E00\u6C17\u901A\u8CAB", han: ctx.isMenzen ? 2 : 1 };
    }
  }
  return null;
};
var toitoi = (ctx) => {
  if (!ctx.decomposition) return null;
  const totalMentsu = allMentsu(ctx).length + ctx.melds.length;
  const totalKoutsu = allKoutsu(ctx).length;
  if (totalKoutsu !== 4) return null;
  return { name: "\u5BFE\u3005\u548C", han: 2 };
};
var sanankou = (ctx) => {
  if (!ctx.decomposition) return null;
  let closedKoutsu = 0;
  for (const m of allMentsu(ctx)) {
    if (m.type === "koutsu") closedKoutsu++;
  }
  for (const m of ctx.melds) {
    if (m.type === "KAN_CLOSED" /* KAN_CLOSED */) closedKoutsu++;
  }
  if (!ctx.isTsumo && ctx.decomposition) {
    for (const m of ctx.decomposition.mentsu) {
      if (m.type === "koutsu" && m.tiles[0] === ctx.winTileKind) {
        closedKoutsu--;
        break;
      }
    }
  }
  if (closedKoutsu !== 3) return null;
  return { name: "\u4E09\u6697\u523B", han: 2 };
};
var sanshokuDoukou = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  for (const k of koutsuList) {
    if (!isNumberTile(k)) continue;
    const num = k % 9;
    const hasSuits = [false, false, false];
    for (const k2 of koutsuList) {
      if (isNumberTile(k2) && k2 % 9 === num) {
        hasSuits[Math.floor(k2 / 9)] = true;
      }
    }
    if (hasSuits[0] && hasSuits[1] && hasSuits[2]) {
      return { name: "\u4E09\u8272\u540C\u523B", han: 2 };
    }
  }
  return null;
};
var sankantsu = (ctx) => {
  if (kanCount(ctx) !== 3) return null;
  return { name: "\u4E09\u69D3\u5B50", han: 2 };
};
var chiitoitsu = (ctx) => {
  if (!ctx.isChiitoi) return null;
  return { name: "\u4E03\u5BFE\u5B50", han: 2 };
};
var honroutou = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.every(isTerminalOrHonor)) return null;
  if (!allKinds.some(isTerminal)) return null;
  if (!allKinds.some(isHonorTile)) return null;
  return { name: "\u6DF7\u8001\u982D", han: 2 };
};
var shousangen = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  let dragonKoutsu = 0;
  for (const k of koutsuList) {
    if (isDragonTile(k)) dragonKoutsu++;
  }
  if (!ctx.decomposition) return null;
  if (!isDragonTile(ctx.decomposition.pair)) return null;
  if (dragonKoutsu !== 2) return null;
  return { name: "\u5C0F\u4E09\u5143", han: 2 };
};
var honitsu = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  const suits = /* @__PURE__ */ new Set();
  let hasHonor = false;
  for (const k of allKinds) {
    if (isHonorTile(k)) {
      hasHonor = true;
    } else {
      suits.add(tileSuit(k));
    }
  }
  if (suits.size !== 1 || !hasHonor) return null;
  return { name: "\u6DF7\u4E00\u8272", han: ctx.isMenzen ? 3 : 2 };
};
var junchan = (ctx) => {
  if (!ctx.decomposition) return null;
  const dec = ctx.decomposition;
  const allKinds = allKindsFlat(ctx);
  if (allKinds.some(isHonorTile)) return null;
  if (!isTerminal(dec.pair)) return null;
  for (const m of dec.mentsu) {
    if (!m.tiles.some(isTerminal)) return null;
  }
  for (const m of ctx.melds) {
    if (!m.tiles.some((t) => isTerminal(tileKind(t)))) return null;
  }
  if (allShuntsu(ctx).length === 0) return null;
  return { name: "\u7D14\u5168\u5E2F\u4E48\u4E5D", han: ctx.isMenzen ? 3 : 2 };
};
var ryanpeikou = (ctx) => {
  if (!ctx.isMenzen || !ctx.decomposition) return null;
  const shuntsu = ctx.decomposition.mentsu.filter(
    (m) => m.type === "shuntsu"
  );
  if (shuntsu.length !== 4) return null;
  const keys = shuntsu.map((s) => s.tiles.join(",")).sort();
  if (keys[0] === keys[1] && keys[2] === keys[3]) {
    return { name: "\u4E8C\u76C3\u53E3", han: 3 };
  }
  return null;
};
var chinitsu = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (allKinds.some(isHonorTile)) return null;
  const suits = new Set(allKinds.map(tileSuit));
  if (suits.size !== 1) return null;
  return { name: "\u6E05\u4E00\u8272", han: ctx.isMenzen ? 6 : 5 };
};
var kokushiMusou = (ctx) => {
  if (!ctx.isKokushi) return null;
  return { name: "\u56FD\u58EB\u7121\u53CC", han: 13, isYakuman: true };
};
var suuankou = (ctx) => {
  if (!ctx.decomposition) return null;
  let closedKoutsu = 0;
  for (const m of ctx.decomposition.mentsu) {
    if (m.type === "koutsu") closedKoutsu++;
  }
  for (const m of ctx.melds) {
    if (m.type === "KAN_CLOSED" /* KAN_CLOSED */) closedKoutsu++;
  }
  if (ctx.isTsumo) {
    if (closedKoutsu !== 4) return null;
  } else {
    if (closedKoutsu !== 4) return null;
    if (ctx.decomposition.pair !== ctx.winTileKind) return null;
  }
  return { name: "\u56DB\u6697\u523B", han: 13, isYakuman: true };
};
var daisangen = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  let count = 0;
  if (koutsuList.includes(HAKU)) count++;
  if (koutsuList.includes(HATSU)) count++;
  if (koutsuList.includes(CHUN)) count++;
  if (count !== 3) return null;
  return { name: "\u5927\u4E09\u5143", han: 13, isYakuman: true };
};
var shousuushii = (ctx) => {
  if (!ctx.decomposition) return null;
  const koutsuList = allKoutsu(ctx);
  let windKoutsu = 0;
  for (const k of koutsuList) {
    if (isWindTile(k)) windKoutsu++;
  }
  if (windKoutsu !== 3) return null;
  if (!isWindTile(ctx.decomposition.pair)) return null;
  return { name: "\u5C0F\u56DB\u559C", han: 13, isYakuman: true };
};
var daisuushii = (ctx) => {
  const koutsuList = allKoutsu(ctx);
  let windKoutsu = 0;
  for (const k of koutsuList) {
    if (isWindTile(k)) windKoutsu++;
  }
  if (windKoutsu !== 4) return null;
  return { name: "\u5927\u56DB\u559C", han: 13, isYakuman: true };
};
var tsuuiisou = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.every(isHonorTile)) return null;
  return { name: "\u5B57\u4E00\u8272", han: 13, isYakuman: true };
};
var chinroutou = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.every(isTerminal)) return null;
  return { name: "\u6E05\u8001\u982D", han: 13, isYakuman: true };
};
var ryuuiisou = (ctx) => {
  const allKinds = allKindsFlat(ctx);
  if (!allKinds.every(isGreenTile)) return null;
  return { name: "\u7DD1\u4E00\u8272", han: 13, isYakuman: true };
};
var chuurenPoutou = (ctx) => {
  if (!ctx.isMenzen) return null;
  const allKinds = allKindsFlat(ctx);
  if (allKinds.some(isHonorTile)) return null;
  const suits = new Set(allKinds.map(tileSuit));
  if (suits.size !== 1) return null;
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of allKinds) counts[k]++;
  const suit = tileSuit(allKinds[0]);
  const base = suit === "man" /* MAN */ ? 0 : suit === "pin" /* PIN */ ? 9 : 18;
  const required = [3, 1, 1, 1, 1, 1, 1, 1, 3];
  for (let i = 0; i < 9; i++) {
    if (counts[base + i] < required[i]) return null;
  }
  return { name: "\u4E5D\u84EE\u5B9D\u71C8", han: 13, isYakuman: true };
};
var suukantsu = (ctx) => {
  if (kanCount(ctx) !== 4) return null;
  return { name: "\u56DB\u69D3\u5B50", han: 13, isYakuman: true };
};
var tenhou = (ctx) => {
  if (!ctx.isFirstDraw || !ctx.isTsumo || ctx.seatWind !== 0 /* EAST */)
    return null;
  return { name: "\u5929\u548C", han: 13, isYakuman: true };
};
var chiihou = (ctx) => {
  if (!ctx.isFirstDraw || !ctx.isTsumo || ctx.seatWind === 0 /* EAST */)
    return null;
  return { name: "\u5730\u548C", han: 13, isYakuman: true };
};
var ALL_YAKU_CHECKERS = [
  // Yakuman (check first)
  tenhou,
  chiihou,
  kokushiMusou,
  suuankou,
  daisangen,
  daisuushii,
  shousuushii,
  tsuuiisou,
  chinroutou,
  ryuuiisou,
  chuurenPoutou,
  suukantsu,
  // Regular yaku
  menzenTsumo,
  riichi,
  doubleRiichi,
  ippatsu,
  pinfu,
  iipeikou,
  tanyao,
  yakuhaiHaku,
  yakuhaiHatsu,
  yakuhaiChun,
  yakuhaiRoundWind,
  yakuhaiSeatWind,
  haitei,
  houtei,
  rinshan,
  chankan,
  chanta,
  sanshokuDoujun,
  ikkitsuukan,
  toitoi,
  sanankou,
  sanshokuDoukou,
  sankantsu,
  chiitoitsu,
  honroutou,
  shousangen,
  honitsu,
  junchan,
  ryanpeikou,
  chinitsu
];

// packages/mahjong-engine/src/rules/yaku-evaluator.ts
function evaluateYaku(win) {
  const handKinds = win.handTileIds.map(tileKind);
  const winKind = tileKind(win.winTileId);
  const isMenzen3 = !win.melds.some(
    (m) => m.type !== "KAN_CLOSED" /* KAN_CLOSED */
  );
  const isChiitoi = isSevenPairs(handKinds);
  const isKokushi = isThirteenOrphans(handKinds);
  let bestResult = { yaku: [], totalHan: 0, isYakuman: false, decomposition: null, isChiitoi: false };
  if (isChiitoi || isKokushi) {
    const ctx = {
      decomposition: null,
      handKinds,
      handTileIds: win.handTileIds,
      melds: win.melds,
      winTileKind: winKind,
      winTileId: win.winTileId,
      isTsumo: win.isTsumo,
      isMenzen: isMenzen3,
      isRiichi: win.isRiichi,
      isDoubleRiichi: win.isDoubleRiichi,
      isIppatsu: win.isIppatsu,
      roundWind: win.roundWind,
      seatWind: win.seatWind,
      isFirstDraw: win.isFirstDraw,
      isLastTileDraw: win.isLastTileDraw,
      isLastDiscard: win.isLastDiscard,
      isRinshan: win.isRinshan,
      isChankan: win.isChankan,
      isChiitoi,
      isKokushi
    };
    const result = checkAllYaku(ctx, null, isChiitoi);
    if (result.totalHan > bestResult.totalHan) {
      bestResult = result;
    }
  }
  const decompositions = decomposeHand(handKinds);
  for (const dec of decompositions) {
    const ctx = {
      decomposition: dec,
      handKinds,
      handTileIds: win.handTileIds,
      melds: win.melds,
      winTileKind: winKind,
      winTileId: win.winTileId,
      isTsumo: win.isTsumo,
      isMenzen: isMenzen3,
      isRiichi: win.isRiichi,
      isDoubleRiichi: win.isDoubleRiichi,
      isIppatsu: win.isIppatsu,
      roundWind: win.roundWind,
      seatWind: win.seatWind,
      isFirstDraw: win.isFirstDraw,
      isLastTileDraw: win.isLastTileDraw,
      isLastDiscard: win.isLastDiscard,
      isRinshan: win.isRinshan,
      isChankan: win.isChankan,
      isChiitoi: false,
      isKokushi: false
    };
    const result = checkAllYaku(ctx, dec, false);
    if (result.totalHan > bestResult.totalHan) {
      bestResult = result;
    }
  }
  return bestResult;
}
function checkAllYaku(ctx, decomposition, isChiitoi) {
  const yaku = [];
  for (const checker of ALL_YAKU_CHECKERS) {
    const result = checker(ctx);
    if (result) yaku.push(result);
  }
  const yakumanList = yaku.filter((y) => y.isYakuman);
  if (yakumanList.length > 0) {
    return {
      yaku: yakumanList,
      totalHan: yakumanList.reduce((sum, y) => sum + y.han, 0),
      isYakuman: true,
      decomposition,
      isChiitoi
    };
  }
  const filtered = filterSupersededYaku(yaku);
  return {
    yaku: filtered,
    totalHan: filtered.reduce((sum, y) => sum + y.han, 0),
    isYakuman: false,
    decomposition,
    isChiitoi
  };
}
function filterSupersededYaku(yaku) {
  const names = new Set(yaku.map((y) => y.name));
  return yaku.filter((y) => {
    if (y.name === "\u4E00\u76C3\u53E3" && names.has("\u4E8C\u76C3\u53E3")) return false;
    if (y.name === "\u4E03\u5BFE\u5B50" && names.has("\u4E8C\u76C3\u53E3")) return false;
    if (y.name === "\u6DF7\u5168\u5E2F\u4E48\u4E5D" && names.has("\u6DF7\u8001\u982D")) return false;
    if (y.name === "\u6DF7\u5168\u5E2F\u4E48\u4E5D" && names.has("\u7D14\u5168\u5E2F\u4E48\u4E5D")) return false;
    if (y.name === "\u6DF7\u4E00\u8272" && names.has("\u6E05\u4E00\u8272")) return false;
    if (y.name === "\u7ACB\u76F4" && names.has("\u30C0\u30D6\u30EB\u7ACB\u76F4")) return false;
    return true;
  });
}

// packages/mahjong-engine/src/rules/scoring.ts
function calculateFu(ctx) {
  if (ctx.isChiitoi) return 25;
  if (!ctx.decomposition) return 30;
  let fu = 30;
  if (ctx.isMenzen && !ctx.isTsumo) {
    fu += 10;
  }
  if (ctx.isTsumo && !ctx.isPinfu) {
    fu += 2;
  }
  const pair = ctx.decomposition.pair;
  if (isDragonTile(pair)) fu += 2;
  if (pair === 27 + ctx.roundWind) fu += 2;
  if (pair === 27 + ctx.seatWind) fu += 2;
  for (const m of ctx.decomposition.mentsu) {
    fu += mentsuFu(m, true);
  }
  for (const m of ctx.melds) {
    fu += meldFu(m);
  }
  fu += waitFu(ctx.decomposition, ctx.winTileKind);
  if (ctx.isPinfu && ctx.isTsumo) return 20;
  return Math.ceil(fu / 10) * 10;
}
function mentsuFu(m, isClosed) {
  if (m.type === "shuntsu") return 0;
  const base = isTerminalOrHonor(m.tiles[0]) ? 8 : 4;
  return isClosed ? base : base / 2;
}
function meldFu(m) {
  const kind = tileKind(m.tiles[0]);
  const isYaochu = isTerminalOrHonor(kind);
  switch (m.type) {
    case "CHI" /* CHI */:
      return 0;
    case "PON" /* PON */:
      return isYaochu ? 4 : 2;
    case "KAN_OPEN" /* KAN_OPEN */:
    case "KAN_ADDED" /* KAN_ADDED */:
      return isYaochu ? 16 : 8;
    case "KAN_CLOSED" /* KAN_CLOSED */:
      return isYaochu ? 32 : 16;
    default:
      return 0;
  }
}
function waitFu(dec, winTileKind) {
  if (dec.pair === winTileKind) return 2;
  for (const m of dec.mentsu) {
    if (!m.tiles.includes(winTileKind)) continue;
    if (m.type === "koutsu") return 0;
    if (m.type === "shuntsu") {
      const sorted = [...m.tiles].sort((a, b) => a - b);
      const pos = sorted.indexOf(winTileKind);
      if (pos === 1) return 2;
      if (pos === 0 && sorted[2] % 9 === 8) return 2;
      if (pos === 2 && sorted[0] % 9 === 0) return 2;
      return 0;
    }
  }
  return 0;
}
function calculateBasePoints(han, fu) {
  if (han >= 13) return 8e3;
  if (han >= 11) return 6e3;
  if (han >= 8) return 4e3;
  if (han >= 6) return 3e3;
  if (han >= 5) return 2e3;
  const base = fu * Math.pow(2, han + 2);
  return Math.min(base, 2e3);
}
function calculatePayment(basePoints, isDealer, isTsumo, honba, riichiSticks) {
  const honbaBonus = honba * 100;
  if (isTsumo) {
    if (isDealer) {
      const each = roundUpTo100(basePoints * 2) + honbaBonus;
      return { tsumoAll: each };
    } else {
      const fromDealer = roundUpTo100(basePoints * 2) + honbaBonus;
      const fromOthers = roundUpTo100(basePoints) + honbaBonus;
      return { tsumoDealer: fromDealer, tsumoNonDealer: fromOthers };
    }
  } else {
    const multiplier = isDealer ? 6 : 4;
    const total = roundUpTo100(basePoints * multiplier) + honbaBonus * 3;
    return { ron: total };
  }
}
function calculateTotalWinnings(payment, riichiSticks) {
  const riichiBonus = riichiSticks * RIICHI_DEPOSIT;
  if (payment.ron !== void 0) {
    return payment.ron + riichiBonus;
  }
  if (payment.tsumoAll !== void 0) {
    return payment.tsumoAll * 3 + riichiBonus;
  }
  if (payment.tsumoDealer !== void 0 && payment.tsumoNonDealer !== void 0) {
    return payment.tsumoDealer + payment.tsumoNonDealer * 2 + riichiBonus;
  }
  return 0;
}
function calculateScoreChanges(winnerSeat, loserSeat, payment, riichiSticks, riichiPlayers, dealerSeat) {
  const changes = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const riichiBonus = riichiSticks * RIICHI_DEPOSIT;
  if (payment.ron !== void 0 && loserSeat !== null) {
    changes[loserSeat] -= payment.ron;
    changes[winnerSeat] += payment.ron + riichiBonus;
  } else if (payment.tsumoAll !== void 0) {
    for (let i = 0; i < 4; i++) {
      if (i !== winnerSeat) {
        changes[i] -= payment.tsumoAll;
        changes[winnerSeat] += payment.tsumoAll;
      }
    }
    changes[winnerSeat] += riichiBonus;
  } else if (payment.tsumoDealer !== void 0 && payment.tsumoNonDealer !== void 0) {
    for (let i = 0; i < 4; i++) {
      if (i === winnerSeat) continue;
      const amount = i === dealerSeat ? payment.tsumoDealer : payment.tsumoNonDealer;
      changes[i] -= amount;
      changes[winnerSeat] += amount;
    }
    changes[winnerSeat] += riichiBonus;
  }
  for (const seat of riichiPlayers) {
    changes[seat] -= RIICHI_DEPOSIT;
  }
  return changes;
}
function calculateUmaOka(scores, returnPoints, uma) {
  const indexed = scores.map((score, i) => ({ score, index: i }));
  indexed.sort((a, b) => b.score - a.score);
  const umaScores = new Array(4).fill(0);
  const finalScores = new Array(4).fill(0);
  for (let rank = 0; rank < 4; rank++) {
    const player = indexed[rank];
    const okaScore = (player.score - returnPoints) / 1e3;
    umaScores[player.index] = okaScore + uma[rank];
    finalScores[player.index] = okaScore + uma[rank];
  }
  return { finalScores, umaScores };
}
function roundUpTo100(n) {
  return Math.ceil(n / 100) * 100;
}

// packages/mahjong-engine/src/game-reducer.ts
function gameReducer(state, event) {
  const newState = { ...state, eventSequence: state.eventSequence + 1 };
  switch (event.type) {
    case "GAME_START":
      return {
        ...newState,
        gamePhase: "PLAYING" /* PLAYING */,
        rules: event.rules,
        scores: [
          event.rules.startPoints,
          event.rules.startPoints,
          event.rules.startPoints,
          event.rules.startPoints
        ],
        seed: event.seed,
        roundWind: 0 /* EAST */,
        roundNumber: 0,
        honba: 0,
        riichiSticks: 0,
        dealerSeat: 0,
        seatWinds: event.seatWinds
      };
    case "ROUND_START":
      return handleRoundStart(newState, event);
    case "DRAW_TILE":
      return handleDrawTile(newState, event);
    case "DISCARD":
    case "AUTO_DISCARD":
      return handleDiscard(newState, {
        seat: event.seat,
        tileId: event.tileId
      });
    case "RIICHI":
      return handleRiichi(newState, event);
    case "CHI":
      return handleChi(newState, event);
    case "PON":
      return handlePon(newState, event);
    case "KAN_OPEN":
      return handleKanOpen(newState, event);
    case "KAN_CLOSED":
      return handleKanClosed(newState, event);
    case "KAN_ADDED":
      return handleKanAdded(newState, event);
    case "TSUMO":
      return handleTsumo(newState, event);
    case "RON":
      return handleRon(newState, event);
    case "DRAW_ROUND":
      return handleDrawRound(newState, event);
    case "SKIP_CLAIM":
      return handleSkipClaim(newState, event);
    case "GAME_END":
      return { ...newState, gamePhase: "FINISHED" /* FINISHED */ };
    default:
      return newState;
  }
}
function handleRoundStart(state, event) {
  const wall = createWall(event.seed, event.wallBreakPosition);
  const hands = [[], [], [], []];
  let currentWall = wall;
  for (let round2 = 0; round2 < 3; round2++) {
    for (let seat = 0; seat < 4; seat++) {
      const dealSeat = (event.dealerSeat + seat) % 4;
      for (let i = 0; i < 4; i++) {
        const result = drawTile(currentWall);
        if (result) {
          hands[dealSeat].push(result.tile);
          currentWall = result.wall;
        }
      }
    }
  }
  for (let seat = 0; seat < 4; seat++) {
    const dealSeat = (event.dealerSeat + seat) % 4;
    const result = drawTile(currentWall);
    if (result) {
      hands[dealSeat].push(result.tile);
      currentWall = result.wall;
    }
  }
  for (let i = 0; i < 4; i++) {
    hands[i] = sortTileIds(hands[i]);
  }
  const round = {
    phase: "DRAW" /* DRAW */,
    wall: currentWall,
    hands,
    melds: [[], [], [], []],
    discards: [[], [], [], []],
    currentTurn: event.dealerSeat,
    drawnTile: null,
    lastDiscard: null,
    riichi: [false, false, false, false],
    ippatsu: [false, false, false, false],
    isFirstTurn: true,
    isAfterKan: false,
    pendingClaims: [],
    turnStartTime: Date.now(),
    kanCount: 0,
    riichiDeclaredThisRound: [],
    skippedClaims: []
  };
  return {
    ...state,
    gamePhase: "PLAYING" /* PLAYING */,
    round,
    dealerSeat: event.dealerSeat,
    diceResult: event.diceResult,
    wallBreakPosition: event.wallBreakPosition
  };
}
function handleDrawTile(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  hands[event.seat] = [...hands[event.seat], event.tileId];
  return {
    ...state,
    round: {
      ...round,
      hands,
      currentTurn: event.seat,
      drawnTile: event.tileId,
      phase: "DISCARD" /* DISCARD */,
      turnStartTime: Date.now()
    }
  };
}
function handleDiscard(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const discards = [...round.discards];
  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx === -1) return state;
  handCopy.splice(idx, 1);
  hands[event.seat] = sortTileIds(handCopy);
  discards[event.seat] = [...discards[event.seat], event.tileId];
  const ippatsu2 = [...round.ippatsu];
  const isFirstTurn = round.isFirstTurn && event.seat === state.dealerSeat && round.discards[event.seat].length === 0;
  return {
    ...state,
    round: {
      ...round,
      hands,
      discards,
      drawnTile: null,
      lastDiscard: { seat: event.seat, tileId: event.tileId },
      phase: "CLAIM" /* CLAIM */,
      ippatsu: ippatsu2,
      isFirstTurn: false,
      isAfterKan: false,
      pendingClaims: [],
      skippedClaims: [],
      turnStartTime: Date.now()
    }
  };
}
function handleRiichi(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const riichi2 = [...round.riichi];
  const ippatsu2 = [...round.ippatsu];
  const riichiDeclared = [...round.riichiDeclaredThisRound];
  riichi2[event.seat] = true;
  ippatsu2[event.seat] = true;
  riichiDeclared.push(event.seat);
  const scores = [...state.scores];
  scores[event.seat] -= RIICHI_DEPOSIT;
  const afterDiscard = handleDiscard(
    {
      ...state,
      scores,
      riichiSticks: state.riichiSticks + 1,
      round: { ...round, riichi: riichi2, ippatsu: ippatsu2, riichiDeclaredThisRound: riichiDeclared }
    },
    { seat: event.seat, tileId: event.tileId }
  );
  return afterDiscard;
}
function handleChi(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    if (t === event.calledTile) continue;
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;
  const meld = {
    type: "CHI" /* CHI */,
    tiles: event.tiles,
    fromPlayer: event.fromSeat,
    calledTile: event.calledTile
  };
  melds[event.seat] = [...melds[event.seat], meld];
  const discards = [...round.discards];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;
  const ippatsu2 = [false, false, false, false];
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      discards,
      currentTurn: event.seat,
      phase: "DISCARD" /* DISCARD */,
      drawnTile: null,
      lastDiscard: null,
      ippatsu: ippatsu2,
      isFirstTurn: false,
      isAfterKan: false,
      pendingClaims: [],
      turnStartTime: Date.now()
    }
  };
}
function handlePon(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    if (t === event.calledTile) continue;
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;
  const meld = {
    type: "PON" /* PON */,
    tiles: event.tiles,
    fromPlayer: event.fromSeat,
    calledTile: event.calledTile
  };
  melds[event.seat] = [...melds[event.seat], meld];
  const discards = [...round.discards];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;
  const ippatsu2 = [false, false, false, false];
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      discards,
      currentTurn: event.seat,
      phase: "DISCARD" /* DISCARD */,
      drawnTile: null,
      lastDiscard: null,
      ippatsu: ippatsu2,
      isFirstTurn: false,
      isAfterKan: false,
      pendingClaims: [],
      turnStartTime: Date.now()
    }
  };
}
function handleKanOpen(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    if (t === event.calledTile) continue;
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;
  const meld = {
    type: "KAN_OPEN" /* KAN_OPEN */,
    tiles: event.tiles,
    fromPlayer: event.fromSeat,
    calledTile: event.calledTile
  };
  melds[event.seat] = [...melds[event.seat], meld];
  const discards = [...round.discards];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;
  const ippatsu2 = [false, false, false, false];
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      discards,
      currentTurn: event.seat,
      phase: "KAN" /* KAN */,
      drawnTile: null,
      lastDiscard: null,
      ippatsu: ippatsu2,
      isFirstTurn: false,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      pendingClaims: [],
      turnStartTime: Date.now()
    }
  };
}
function handleKanClosed(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;
  const meld = {
    type: "KAN_CLOSED" /* KAN_CLOSED */,
    tiles: event.tiles
  };
  melds[event.seat] = [...melds[event.seat], meld];
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      currentTurn: event.seat,
      phase: "KAN" /* KAN */,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      turnStartTime: Date.now()
    }
  };
}
function handleKanAdded(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx !== -1) handCopy.splice(idx, 1);
  hands[event.seat] = handCopy;
  const meldsCopy = [...melds[event.seat]];
  const kind = tileKind(event.tileId);
  const ponIdx = meldsCopy.findIndex(
    (m) => m.type === "PON" /* PON */ && tileKind(m.tiles[0]) === kind
  );
  if (ponIdx !== -1) {
    meldsCopy[ponIdx] = {
      ...meldsCopy[ponIdx],
      type: "KAN_ADDED" /* KAN_ADDED */,
      tiles: [...meldsCopy[ponIdx].tiles, event.tileId]
    };
  }
  melds[event.seat] = meldsCopy;
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      currentTurn: event.seat,
      phase: "KAN" /* KAN */,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      turnStartTime: Date.now()
    }
  };
}
function handleTsumo(state, event) {
  const scores = [...state.scores];
  for (let i = 0; i < 4; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }
  return {
    ...state,
    scores,
    gamePhase: "ROUND_RESULT" /* ROUND_RESULT */,
    riichiSticks: 0,
    round: state.round ? { ...state.round, phase: "ROUND_END" /* ROUND_END */ } : null
  };
}
function handleRon(state, event) {
  const scores = [...state.scores];
  for (let i = 0; i < 4; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }
  return {
    ...state,
    scores,
    gamePhase: "ROUND_RESULT" /* ROUND_RESULT */,
    riichiSticks: 0,
    round: state.round ? { ...state.round, phase: "ROUND_END" /* ROUND_END */ } : null
  };
}
function handleDrawRound(state, event) {
  const scores = [...state.scores];
  for (let i = 0; i < 4; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }
  return {
    ...state,
    scores,
    gamePhase: "ROUND_RESULT" /* ROUND_RESULT */,
    round: state.round ? { ...state.round, phase: "ROUND_END" /* ROUND_END */ } : null
  };
}
function handleSkipClaim(state, event) {
  if (!state.round) return state;
  const pendingClaims = state.round.pendingClaims.filter(
    (c) => c.seat !== event.seat
  );
  const skippedClaims = [...state.round.skippedClaims || [], event.seat];
  return {
    ...state,
    round: {
      ...state.round,
      pendingClaims,
      skippedClaims
    }
  };
}
function createInitialState() {
  return {
    rules: {
      playerCount: 4,
      roundType: "south",
      startPoints: INITIAL_POINTS,
      returnPoints: 3e4,
      uma: [30, 10, -10, -30],
      hasRedDora: true,
      hasOpenTanyao: true
    },
    gamePhase: "WAITING" /* WAITING */,
    scores: [INITIAL_POINTS, INITIAL_POINTS, INITIAL_POINTS, INITIAL_POINTS],
    round: null,
    roundWind: 0 /* EAST */,
    roundNumber: 0,
    honba: 0,
    riichiSticks: 0,
    dealerSeat: 0,
    seed: 0,
    eventSequence: 0,
    seatWinds: [0 /* EAST */, 1 /* SOUTH */, 2 /* WEST */, 3 /* NORTH */],
    diceResult: [1, 1],
    wallBreakPosition: 0
  };
}
function advanceRound(state, dealerWon, isDraw = false) {
  let { roundWind, roundNumber, honba, dealerSeat } = state;
  if (state.scores.some((s) => s < 0)) {
    return { ...state, gamePhase: "GAME_RESULT" /* GAME_RESULT */, round: null };
  }
  if (dealerWon) {
    honba++;
  } else {
    dealerSeat = (dealerSeat + 1) % 4;
    roundNumber++;
    if (roundNumber >= 4) {
      roundNumber = 0;
      roundWind = roundWind + 1;
    }
    honba = isDraw ? honba + 1 : 0;
  }
  const maxWind = state.rules.roundType === "east" ? 1 /* SOUTH */ : 2 /* WEST */;
  if (roundWind >= maxWind) {
    return { ...state, gamePhase: "GAME_RESULT" /* GAME_RESULT */, round: null };
  }
  return {
    ...state,
    roundWind,
    roundNumber,
    honba,
    dealerSeat,
    gamePhase: "PLAYING" /* PLAYING */,
    round: null
  };
}

// packages/mahjong-engine/src/game-machine.ts
var GameMachine = class {
  state;
  eventLog = [];
  constructor(state) {
    this.state = state ?? createInitialState();
  }
  getState() {
    return this.state;
  }
  getEventLog() {
    return this.eventLog;
  }
  /**
   * Start a new game.
   */
  startGame(seed, rules) {
    const fullRules = {
      ...this.state.rules,
      ...rules
    };
    const events = [];
    const rng = new SeededRNG(seed);
    const winds = [0 /* EAST */, 1 /* SOUTH */, 2 /* WEST */, 3 /* NORTH */];
    rng.shuffle(winds);
    const startEvent = { type: "GAME_START", seed, rules: fullRules, seatWinds: winds };
    this.applyEvent(startEvent);
    events.push(startEvent);
    const roundEvents = this.startNewRound();
    events.push(...roundEvents);
    return events;
  }
  /**
   * Start a new round.
   */
  startNewRound() {
    const events = [];
    const roundSeed = this.state.seed + this.state.eventSequence;
    const diceResult = rollDice(roundSeed + 7777);
    const diceTotal = diceResult[0] + diceResult[1];
    const wallBreakPosition = calculateWallBreakPosition(diceTotal);
    const roundStart = {
      type: "ROUND_START",
      seed: roundSeed,
      dealerSeat: this.state.dealerSeat,
      diceResult,
      wallBreakPosition
    };
    this.applyEvent(roundStart);
    events.push(roundStart);
    const drawEvents = this.doDraw(this.state.dealerSeat);
    events.push(...drawEvents);
    return events;
  }
  /**
   * Process a player action. Returns the events generated.
   */
  processAction(action) {
    const available = this.getAvailableActions(action.seat);
    if (!available.includes(action.action)) {
      return [];
    }
    switch (action.action) {
      case "DISCARD" /* DISCARD */:
        return this.handleDiscard(action.seat, action.tileId);
      case "TSUMO" /* TSUMO */:
        return this.handleTsumo(action.seat);
      case "RON" /* RON */:
        return this.handleRon(action.seat);
      case "RIICHI" /* RIICHI */:
        return this.handleRiichi(action.seat, action.tileId);
      case "CHI" /* CHI */:
        return this.handleChi(action.seat, action.tiles);
      case "PON" /* PON */:
        return this.handlePon(action.seat, action.tiles);
      case "KAN_OPEN" /* KAN_OPEN */:
        return this.handleKanOpen(action.seat, action.tiles);
      case "KAN_CLOSED" /* KAN_CLOSED */:
        return this.handleKanClosed(action.seat, action.tiles);
      case "KAN_ADDED" /* KAN_ADDED */:
        return this.handleKanAdded(action.seat, action.tileId);
      case "SKIP" /* SKIP */:
        return this.handleSkip(action.seat);
      default:
        return [];
    }
  }
  /**
   * Get available actions for a player.
   */
  getAvailableActions(seat) {
    const round = this.state.round;
    if (!round || this.state.gamePhase !== "PLAYING" /* PLAYING */) return [];
    const actions = [];
    const hand = round.hands[seat];
    const handKinds = hand.map(tileKind);
    if (round.phase === "DISCARD" /* DISCARD */ && round.currentTurn === seat) {
      actions.push("DISCARD" /* DISCARD */);
      if (round.drawnTile !== null) {
        const allKinds = hand.map(tileKind);
        if (isWinningHand(allKinds)) {
          actions.push("TSUMO" /* TSUMO */);
        }
      }
      if (!round.riichi[seat] && isMenzen(round, seat) && this.state.scores[seat] >= 1e3) {
        for (const tile of hand) {
          const remaining = hand.filter((t) => t !== tile).map(tileKind);
          if (isTenpai(remaining)) {
            actions.push("RIICHI" /* RIICHI */);
            break;
          }
        }
      }
      const kanGroups = findClosedKanGroups(hand);
      if (kanGroups.length > 0 && !round.riichi[seat]) {
        actions.push("KAN_CLOSED" /* KAN_CLOSED */);
      }
      if (!round.riichi[seat]) {
        for (const meld of round.melds[seat]) {
          if (meld.type === "PON" /* PON */) {
            const ponKind = tileKind(meld.tiles[0]);
            if (hand.some((t) => tileKind(t) === ponKind)) {
              actions.push("KAN_ADDED" /* KAN_ADDED */);
              break;
            }
          }
        }
      }
    }
    if (round.phase === "CLAIM" /* CLAIM */ && round.lastDiscard) {
      if (round.skippedClaims?.includes(seat)) return actions;
      const discard = round.lastDiscard;
      if (discard.seat === seat) return actions;
      const discardKind = tileKind(discard.tileId);
      const testHand = [...handKinds, discardKind];
      if (isWinningHand(testHand)) {
        actions.push("RON" /* RON */);
      }
      const kindCount = handKinds.filter((k) => k === discardKind).length;
      if (kindCount >= 2 && !round.riichi[seat]) {
        actions.push("PON" /* PON */);
      }
      if (kindCount >= 3 && !round.riichi[seat]) {
        actions.push("KAN_OPEN" /* KAN_OPEN */);
      }
      const prevSeat = (seat + 3) % 4;
      if (discard.seat === prevSeat && !round.riichi[seat]) {
        if (canChi(handKinds, discardKind)) {
          actions.push("CHI" /* CHI */);
        }
      }
      if (actions.length > 0) {
        actions.push("SKIP" /* SKIP */);
      }
    }
    return actions;
  }
  /**
   * Perform auto-discard for a player (timeout or disconnect).
   * Tsumogiri (discard drawn tile) if available, else discard last tile in hand.
   */
  autoDiscard(seat) {
    const round = this.state.round;
    if (!round || round.currentTurn !== seat || round.phase !== "DISCARD" /* DISCARD */) {
      return [];
    }
    const tileId = round.drawnTile ?? round.hands[seat][round.hands[seat].length - 1];
    if (tileId === void 0) return [];
    const event = { type: "AUTO_DISCARD", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }
  /**
   * Auto-skip all pending claims (for claim timeout).
   */
  autoSkipAllClaims() {
    const round = this.state.round;
    if (!round || round.phase !== "CLAIM" /* CLAIM */ || !round.lastDiscard) {
      return [];
    }
    const events = [];
    for (let iter = 0; iter < 4; iter++) {
      const currentRound = this.state.round;
      if (!currentRound || currentRound.phase !== "CLAIM" /* CLAIM */ || !currentRound.lastDiscard) break;
      let skipped = false;
      for (let i = 1; i <= 3; i++) {
        const s = (currentRound.lastDiscard.seat + i) % 4;
        const available = this.getAvailableActions(s);
        if (available.includes("SKIP" /* SKIP */)) {
          const skipEvents = this.handleSkip(s);
          events.push(...skipEvents);
          skipped = true;
          break;
        }
      }
      if (!skipped) break;
    }
    return events;
  }
  /**
   * Advance to next round after round result.
   */
  advanceToNextRound(dealerWon, isDraw = false) {
    if (this.state.gamePhase !== "ROUND_RESULT" /* ROUND_RESULT */) {
      return [];
    }
    this.state = advanceRound(this.state, dealerWon, isDraw);
    if (this.state.gamePhase === "GAME_RESULT" /* GAME_RESULT */) {
      const event = {
        type: "GAME_END",
        finalScores: [...this.state.scores]
      };
      this.applyEvent(event);
      return [event];
    }
    return this.startNewRound();
  }
  isRoundOver() {
    return this.state.gamePhase === "ROUND_RESULT" /* ROUND_RESULT */;
  }
  isGameOver() {
    return this.state.gamePhase === "FINISHED" /* FINISHED */ || this.state.gamePhase === "GAME_RESULT" /* GAME_RESULT */;
  }
  /**
   * Generate a PlayerGameView (filtered view for a specific player).
   */
  getPlayerView(seat, playerNames) {
    const round = this.state.round;
    if (!round) {
      return {
        gamePhase: this.state.gamePhase,
        roundPhase: "DRAW" /* DRAW */,
        roundWind: this.state.roundWind,
        roundNumber: this.state.roundNumber,
        honba: this.state.honba,
        riichiSticks: this.state.riichiSticks,
        tilesRemaining: 0,
        doraIndicators: [],
        myHand: [],
        mySeat: seat,
        myScore: this.state.scores[seat],
        players: playerNames.map((name, i) => ({
          seat: i,
          name,
          score: this.state.scores[i],
          discards: [],
          melds: [],
          isRiichi: false,
          isConnected: true,
          handCount: 0
        })),
        currentTurn: 0,
        availableActions: [],
        diceResult: this.state.diceResult,
        seatWinds: [...this.state.seatWinds],
        wallBreakPosition: this.state.wallBreakPosition,
        dealerSeat: this.state.dealerSeat
      };
    }
    const players = playerNames.map((name, i) => ({
      seat: i,
      name,
      score: this.state.scores[i],
      discards: round.discards[i],
      melds: round.melds[i],
      isRiichi: round.riichi[i],
      isConnected: true,
      handCount: round.hands[i].length
    }));
    return {
      gamePhase: this.state.gamePhase,
      roundPhase: round.phase,
      roundWind: this.state.roundWind,
      roundNumber: this.state.roundNumber,
      honba: this.state.honba,
      riichiSticks: this.state.riichiSticks,
      tilesRemaining: tilesRemaining(round.wall),
      doraIndicators: getDoraIndicators(round.wall),
      myHand: sortTileIds(round.hands[seat]),
      mySeat: seat,
      myScore: this.state.scores[seat],
      players,
      currentTurn: round.currentTurn,
      lastDiscard: round.lastDiscard ?? void 0,
      availableActions: this.getAvailableActions(seat),
      diceResult: this.state.diceResult,
      seatWinds: [...this.state.seatWinds],
      wallBreakPosition: this.state.wallBreakPosition,
      dealerSeat: this.state.dealerSeat
    };
  }
  // ===== Private handlers =====
  applyEvent(event) {
    this.state = gameReducer(this.state, event);
    this.eventLog.push(event);
  }
  doDraw(seat) {
    const round = this.state.round;
    if (!round) return [];
    const result = drawTile(round.wall);
    if (!result) {
      return this.handleExhaustiveDraw();
    }
    this.state = {
      ...this.state,
      round: { ...round, wall: result.wall }
    };
    const event = {
      type: "DRAW_TILE",
      seat,
      tileId: result.tile
    };
    this.applyEvent(event);
    return [event];
  }
  doDrawFromDeadWall(seat) {
    const round = this.state.round;
    if (!round) return [];
    const result = drawFromDeadWall(round.wall);
    if (!result) return [];
    this.state = {
      ...this.state,
      round: { ...round, wall: result.wall }
    };
    const event = {
      type: "DRAW_TILE",
      seat,
      tileId: result.tile
    };
    this.applyEvent(event);
    return [event];
  }
  handleDiscard(seat, tileId) {
    const event = { type: "DISCARD", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }
  handleRiichi(seat, tileId) {
    const event = { type: "RIICHI", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }
  afterDiscard(discardSeat, events) {
    const round = this.state.round;
    if (!round) return events;
    let anyClaims = false;
    for (let i = 1; i <= 3; i++) {
      const seat = (discardSeat + i) % 4;
      const available = this.getAvailableActions(seat);
      if (available.length > 0) {
        anyClaims = true;
      }
    }
    if (!anyClaims) {
      const nextSeat = (discardSeat + 1) % 4;
      const drawEvents = this.doDraw(nextSeat);
      events.push(...drawEvents);
    }
    return events;
  }
  handleTsumo(seat) {
    const round = this.state.round;
    if (!round) return [];
    const hand = round.hands[seat];
    const handKinds = hand.map(tileKind);
    const winTile = round.drawnTile;
    const winCtx = {
      handTileIds: hand,
      melds: round.melds[seat],
      winTileId: winTile,
      isTsumo: true,
      isRiichi: round.riichi[seat],
      isDoubleRiichi: false,
      isIppatsu: round.ippatsu[seat],
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isFirstDraw: round.isFirstTurn,
      isLastTileDraw: tilesRemaining(round.wall) === 0,
      isLastDiscard: false,
      isRinshan: round.isAfterKan,
      isChankan: false
    };
    const yakuResult = evaluateYaku(winCtx);
    if (yakuResult.yaku.length === 0) return [];
    const doraHan = countDora(hand, round.melds[seat], round, this.state.rules.hasRedDora, round.riichi[seat]);
    const totalHan = yakuResult.totalHan + doraHan.total;
    const isDealer = seat === this.state.dealerSeat;
    const fu = calculateFu({
      decomposition: yakuResult.decomposition,
      melds: round.melds[seat],
      winTileKind: tileKind(winTile),
      isTsumo: true,
      isMenzen: isMenzen(round, seat),
      isPinfu: yakuResult.yaku.some((y) => y.name === "\u5E73\u548C"),
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isChiitoi: yakuResult.isChiitoi
    });
    const basePoints = calculateBasePoints(totalHan, fu);
    const payment = calculatePayment(
      basePoints,
      isDealer,
      true,
      this.state.honba,
      this.state.riichiSticks
    );
    const scoreChanges = { 0: 0, 1: 0, 2: 0, 3: 0 };
    if (payment.tsumoAll !== void 0) {
      for (let i = 0; i < 4; i++) {
        if (i !== seat) {
          scoreChanges[i] -= payment.tsumoAll;
          scoreChanges[seat] += payment.tsumoAll;
        }
      }
    } else if (payment.tsumoDealer !== void 0 && payment.tsumoNonDealer !== void 0) {
      for (let i = 0; i < 4; i++) {
        if (i === seat) continue;
        const amount = i === this.state.dealerSeat ? payment.tsumoDealer : payment.tsumoNonDealer;
        scoreChanges[i] -= amount;
        scoreChanges[seat] += amount;
      }
    }
    scoreChanges[seat] += this.state.riichiSticks * 1e3;
    const allYaku = [...yakuResult.yaku, ...doraHan.yakuList];
    const event = {
      type: "TSUMO",
      seat,
      yaku: allYaku,
      han: totalHan,
      fu,
      score: calculateTotalWinnings(payment, this.state.riichiSticks),
      scoreChanges
    };
    this.applyEvent(event);
    return [event];
  }
  handleRon(seat) {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];
    const discard = round.lastDiscard;
    const hand = round.hands[seat];
    const allTiles = [...hand, discard.tileId];
    const handKinds = allTiles.map(tileKind);
    const winCtx = {
      handTileIds: allTiles,
      melds: round.melds[seat],
      winTileId: discard.tileId,
      isTsumo: false,
      isRiichi: round.riichi[seat],
      isDoubleRiichi: false,
      isIppatsu: round.ippatsu[seat],
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isFirstDraw: false,
      isLastTileDraw: false,
      isLastDiscard: tilesRemaining(round.wall) === 0,
      isRinshan: false,
      isChankan: false
    };
    const yakuResult = evaluateYaku(winCtx);
    if (yakuResult.yaku.length === 0) return [];
    const doraHan = countDora(allTiles, round.melds[seat], round, this.state.rules.hasRedDora, round.riichi[seat]);
    const totalHan = yakuResult.totalHan + doraHan.total;
    const isDealer = seat === this.state.dealerSeat;
    const fu = calculateFu({
      decomposition: yakuResult.decomposition,
      melds: round.melds[seat],
      winTileKind: tileKind(discard.tileId),
      isTsumo: false,
      isMenzen: isMenzen(round, seat),
      isPinfu: yakuResult.yaku.some((y) => y.name === "\u5E73\u548C"),
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind(seat, this.state.dealerSeat),
      isChiitoi: yakuResult.isChiitoi
    });
    const basePoints = calculateBasePoints(totalHan, fu);
    const payment = calculatePayment(
      basePoints,
      isDealer,
      false,
      this.state.honba,
      this.state.riichiSticks
    );
    const scoreChanges = { 0: 0, 1: 0, 2: 0, 3: 0 };
    scoreChanges[discard.seat] -= payment.ron;
    scoreChanges[seat] += payment.ron + this.state.riichiSticks * 1e3;
    const allYaku = [...yakuResult.yaku, ...doraHan.yakuList];
    const event = {
      type: "RON",
      winners: [
        {
          seat,
          yaku: allYaku,
          han: totalHan,
          fu,
          score: payment.ron + this.state.riichiSticks * 1e3
        }
      ],
      loserSeat: discard.seat,
      scoreChanges
    };
    this.applyEvent(event);
    return [event];
  }
  handleChi(seat, tiles) {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];
    const event = {
      type: "CHI",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat
    };
    this.applyEvent(event);
    return [event];
  }
  handlePon(seat, tiles) {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];
    const event = {
      type: "PON",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat
    };
    this.applyEvent(event);
    return [event];
  }
  handleKanOpen(seat, tiles) {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];
    const events = [];
    const event = {
      type: "KAN_OPEN",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat
    };
    this.applyEvent(event);
    events.push(event);
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);
    return events;
  }
  handleKanClosed(seat, tiles) {
    const events = [];
    const event = {
      type: "KAN_CLOSED",
      seat,
      tiles
    };
    this.applyEvent(event);
    events.push(event);
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);
    return events;
  }
  handleKanAdded(seat, tileId) {
    const events = [];
    const event = {
      type: "KAN_ADDED",
      seat,
      tileId
    };
    this.applyEvent(event);
    events.push(event);
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);
    return events;
  }
  handleSkip(seat) {
    const events = [];
    const event = { type: "SKIP_CLAIM", seat };
    this.applyEvent(event);
    events.push(event);
    const round = this.state.round;
    if (!round || !round.lastDiscard) return events;
    let anyClaims = false;
    for (let i = 1; i <= 3; i++) {
      const s = (round.lastDiscard.seat + i) % 4;
      if (s === seat) continue;
      const available = this.getAvailableActions(s);
      if (available.length > 0) {
        anyClaims = true;
        break;
      }
    }
    if (!anyClaims) {
      const nextSeat = (round.lastDiscard.seat + 1) % 4;
      const drawEvents = this.doDraw(nextSeat);
      events.push(...drawEvents);
    }
    return events;
  }
  handleExhaustiveDraw() {
    const round = this.state.round;
    if (!round) return [];
    const tenpaiPlayers = [];
    for (let i = 0; i < 4; i++) {
      const handKinds = round.hands[i].map(tileKind);
      if (isTenpai(handKinds)) {
        tenpaiPlayers.push(i);
      }
    }
    const scoreChanges = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const tenpaiCount = tenpaiPlayers.length;
    if (tenpaiCount > 0 && tenpaiCount < 4) {
      const totalPenalty = 3e3;
      const penaltyPerNoten = totalPenalty / (4 - tenpaiCount);
      const bonusPerTenpai = totalPenalty / tenpaiCount;
      for (let i = 0; i < 4; i++) {
        if (tenpaiPlayers.includes(i)) {
          scoreChanges[i] = bonusPerTenpai;
        } else {
          scoreChanges[i] = -penaltyPerNoten;
        }
      }
    }
    const event = {
      type: "DRAW_ROUND",
      reason: "EXHAUSTIVE_DRAW" /* EXHAUSTIVE_DRAW */,
      tenpaiPlayers,
      scoreChanges
    };
    this.applyEvent(event);
    return [event];
  }
};
function isMenzen(round, seat) {
  return !round.melds[seat].some((m) => m.type !== "KAN_CLOSED" /* KAN_CLOSED */);
}
function relativeSeatWind(seat, dealerSeat) {
  return (seat - dealerSeat + 4) % 4;
}
function canChi(handKinds, discardKind) {
  if (discardKind >= 27) return false;
  const suit = Math.floor(discardKind / 9);
  const num = discardKind % 9;
  const suitKinds = handKinds.filter((k) => Math.floor(k / 9) === suit);
  const nums = suitKinds.map((k) => k % 9);
  if (num >= 2 && nums.includes(num - 2) && nums.includes(num - 1)) return true;
  if (num >= 1 && num <= 7 && nums.includes(num - 1) && nums.includes(num + 1)) return true;
  if (num <= 6 && nums.includes(num + 1) && nums.includes(num + 2)) return true;
  return false;
}
function findClosedKanGroups(hand) {
  const counts = countByKind(hand);
  const groups = [];
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 4) groups.push(k);
  }
  return groups;
}
function countDora(handTiles, melds, round, hasRedDora, isRiichi) {
  const allTiles = [...handTiles];
  for (const m of melds) {
    allTiles.push(...m.tiles);
  }
  const indicators = getDoraIndicators(round.wall);
  let doraCount = 0;
  for (const indicator of indicators) {
    const doraKind = doraFromIndicator(tileKind(indicator));
    doraCount += allTiles.filter((t) => tileKind(t) === doraKind).length;
  }
  let redCount = 0;
  if (hasRedDora) {
    redCount = allTiles.filter(isRedDora).length;
  }
  const yakuList = [];
  if (doraCount > 0) yakuList.push({ name: "\u30C9\u30E9", han: doraCount });
  if (redCount > 0) yakuList.push({ name: "\u8D64\u30C9\u30E9", han: redCount });
  return { total: doraCount + redCount, yakuList };
}

// packages/mahjong-engine/src/bot.ts
function botDecideAction(state, seat, availableActions) {
  if (availableActions.length === 0) return null;
  const round = state.round;
  if (!round) return null;
  if (availableActions.includes("TSUMO" /* TSUMO */)) {
    return { seat, action: "TSUMO" /* TSUMO */ };
  }
  if (availableActions.includes("RON" /* RON */)) {
    return { seat, action: "RON" /* RON */ };
  }
  if (availableActions.includes("RIICHI" /* RIICHI */)) {
    const tileToDiscard = chooseBestDiscard(round, seat);
    if (tileToDiscard !== null) {
      const hand = round.hands[seat];
      const remaining = hand.filter((t) => t !== tileToDiscard).map(tileKind);
      if (isTenpai(remaining)) {
        return { seat, action: "RIICHI" /* RIICHI */, tileId: tileToDiscard };
      }
    }
  }
  if (availableActions.includes("PON" /* PON */) && round.lastDiscard) {
    const discardKind = tileKind(round.lastDiscard.tileId);
    const hand = round.hands[seat];
    const handKinds = hand.map(tileKind);
    const matchCount = handKinds.filter((k) => k === discardKind).length;
    if (matchCount >= 2) {
      const isYakuhai = discardKind >= 31 || discardKind === 27 + state.roundWind;
      if (isYakuhai || Math.random() < 0.3) {
        const ponTiles = hand.filter((t) => tileKind(t) === discardKind).slice(0, 2);
        return {
          seat,
          action: "PON" /* PON */,
          tiles: [...ponTiles, round.lastDiscard.tileId]
        };
      }
    }
  }
  if (availableActions.includes("DISCARD" /* DISCARD */)) {
    const tileToDiscard = chooseBestDiscard(round, seat);
    if (tileToDiscard !== null) {
      return { seat, action: "DISCARD" /* DISCARD */, tileId: tileToDiscard };
    }
  }
  if (availableActions.includes("SKIP" /* SKIP */)) {
    return { seat, action: "SKIP" /* SKIP */ };
  }
  return null;
}
function chooseBestDiscard(round, seat) {
  const hand = round.hands[seat];
  if (hand.length === 0) return null;
  if (round.riichi[seat] && round.drawnTile !== null) {
    return round.drawnTile;
  }
  const handKinds = hand.map(tileKind);
  const counts = countByKind(hand);
  const scores = hand.map((tileId) => {
    const kind = tileKind(tileId);
    let score = 0;
    if (counts[kind] === 1) score += 10;
    if (isTerminalOrHonor(kind)) {
      score += 5;
      if (counts[kind] >= 2) score -= 15;
    }
    if (kind < 27) {
      const suit = Math.floor(kind / 9);
      const num = kind % 9;
      const hasAdj1 = num > 0 && counts[suit * 9 + num - 1] > 0;
      const hasAdj2 = num < 8 && counts[suit * 9 + num + 1] > 0;
      if (!hasAdj1 && !hasAdj2) score += 8;
      else if (hasAdj1 && hasAdj2) score -= 5;
    }
    if (counts[kind] === 2) score -= 3;
    if (counts[kind] >= 3) score -= 10;
    if (tileId === round.drawnTile) score += 0.5;
    return { tileId, score };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0].tileId;
}
function runBotActions(machine, humanSeat) {
  const state = machine.getState();
  if (state.gamePhase !== "PLAYING" /* PLAYING */ || !state.round) return;
  for (let i = 0; i < 4; i++) {
    const seat = i;
    if (seat === humanSeat) continue;
    const available = machine.getAvailableActions(seat);
    if (available.length === 0) continue;
    const action = botDecideAction(state, seat, available);
    if (action) {
      machine.processAction(action);
      runBotActions(machine, humanSeat);
      return;
    }
  }
}

// packages/mahjong-engine/src/discard-assist.ts
function findWaitsGeneral(handKinds) {
  const size = handKinds.length;
  if (size % 3 !== 1) return [];
  const counts = new Array(TILE_KINDS).fill(0);
  for (const k of handKinds) counts[k]++;
  const waits = [];
  for (let k = 0; k < TILE_KINDS; k++) {
    if (counts[k] >= 4) continue;
    const testKinds = [...handKinds, k];
    if (decomposeHand(testKinds).length > 0) {
      waits.push(k);
      continue;
    }
    if (testKinds.length === 14 && isSevenPairs(testKinds)) {
      waits.push(k);
    }
  }
  return waits;
}
function analyzeDiscards(hand, melds, roundWind, seatWind, isRiichi) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  for (const tileId of hand) {
    const kind = tileKind(tileId);
    if (seen.has(kind)) continue;
    seen.add(kind);
    const remaining = hand.filter((t) => t !== tileId);
    const remainingKinds = remaining.map(tileKind);
    const shanten = calculateShanten(remainingKinds);
    if (shanten > 0) continue;
    const waits = findWaitsGeneral(remainingKinds);
    if (waits.length === 0) continue;
    const waitInfos = waits.map((waitKind) => {
      const winTileId = waitKind * 4;
      const fullHand = [...remaining, winTileId];
      const ctx = {
        handTileIds: fullHand,
        melds,
        winTileId,
        isTsumo: true,
        // assume tsumo for yaku check
        isRiichi,
        isDoubleRiichi: false,
        isIppatsu: false,
        roundWind,
        seatWind,
        isFirstDraw: false,
        isLastTileDraw: false,
        isLastDiscard: false,
        isRinshan: false,
        isChankan: false
      };
      const result = evaluateYaku(ctx);
      return {
        tileKind: waitKind,
        yaku: result.yaku.map((y) => ({ name: y.name, han: y.han })),
        totalHan: result.totalHan
      };
    });
    results.push({
      tileId,
      shantenAfter: shanten,
      waits: waitInfos
    });
  }
  results.sort((a, b) => {
    if (b.waits.length !== a.waits.length) return b.waits.length - a.waits.length;
    const maxHanA = Math.max(...a.waits.map((w) => w.totalHan), 0);
    const maxHanB = Math.max(...b.waits.map((w) => w.totalHan), 0);
    return maxHanB - maxHanA;
  });
  return results;
}

// packages/mahjong-engine/src/sanma/types.ts
var EXCLUDED_MAN_KINDS = [1, 2, 3, 4, 5, 6, 7];
var SANMA_TILE_KINDS = 27;
var SANMA_TOTAL_TILES = 108;
var NORTH_WIND_KIND = 30;
var SANMA_DEFAULT_RULES = {
  playerCount: 3,
  roundType: "south",
  startPoints: 35e3,
  returnPoints: 4e4,
  uma: [20, 0, -20],
  hasRedDora: true,
  hasOpenTanyao: true,
  hasNukidora: true
};

// packages/mahjong-engine/src/sanma/wall.ts
function isExcludedTile(tileId) {
  const kind = tileKind(tileId);
  return EXCLUDED_MAN_KINDS.includes(kind);
}
function createSanmaWall(seed) {
  const rng = new SeededRNG(seed);
  const tiles = [];
  for (let i = 0; i < 136; i++) {
    if (!isExcludedTile(i)) {
      tiles.push(i);
    }
  }
  rng.shuffle(tiles);
  const deadWall = tiles.splice(tiles.length - DEAD_WALL_SIZE, DEAD_WALL_SIZE);
  return {
    liveTiles: tiles,
    // 94 live tiles
    deadWall,
    doraIndicatorCount: 1,
    kanDoraCount: 0
  };
}

// packages/mahjong-engine/src/sanma/reducer.ts
var PLAYER_COUNT = 3;
function sanmaReducer(state, event) {
  const newState = { ...state, eventSequence: state.eventSequence + 1 };
  switch (event.type) {
    case "GAME_START":
      return {
        ...newState,
        gamePhase: "PLAYING" /* PLAYING */,
        rules: event.rules,
        scores: [
          event.rules.startPoints,
          event.rules.startPoints,
          event.rules.startPoints
        ],
        seed: event.seed,
        roundWind: 0 /* EAST */,
        roundNumber: 0,
        honba: 0,
        riichiSticks: 0,
        dealerSeat: 0
      };
    case "ROUND_START":
      return handleRoundStart2(newState, event);
    case "DRAW_TILE":
      return handleDrawTile2(newState, event);
    case "DISCARD":
    case "AUTO_DISCARD":
      return handleDiscard2(newState, {
        seat: event.seat,
        tileId: event.tileId
      });
    case "RIICHI":
      return handleRiichi2(newState, event);
    case "PON":
      return handlePon2(newState, event);
    case "KAN_OPEN":
      return handleKanOpen2(newState, event);
    case "KAN_CLOSED":
      return handleKanClosed2(newState, event);
    case "KAN_ADDED":
      return handleKanAdded2(newState, event);
    case "NUKIDORA":
      return handleNukidora(newState, event);
    case "TSUMO":
      return handleTsumo2(newState, event);
    case "RON":
      return handleRon2(newState, event);
    case "DRAW_ROUND":
      return handleDrawRound2(newState, event);
    case "SKIP_CLAIM":
      return handleSkipClaim2(newState, event);
    case "GAME_END":
      return { ...newState, gamePhase: "FINISHED" /* FINISHED */ };
    default:
      return newState;
  }
}
function handleRoundStart2(state, event) {
  const wall = createSanmaWall(event.seed);
  const hands = [[], [], []];
  let currentWall = wall;
  for (let round = 0; round < 3; round++) {
    for (let seat = 0; seat < PLAYER_COUNT; seat++) {
      const dealSeat = (event.dealerSeat + seat) % PLAYER_COUNT;
      for (let i = 0; i < 4; i++) {
        const result = drawTile(currentWall);
        if (result) {
          hands[dealSeat].push(result.tile);
          currentWall = result.wall;
        }
      }
    }
  }
  for (let seat = 0; seat < PLAYER_COUNT; seat++) {
    const dealSeat = (event.dealerSeat + seat) % PLAYER_COUNT;
    const result = drawTile(currentWall);
    if (result) {
      hands[dealSeat].push(result.tile);
      currentWall = result.wall;
    }
  }
  for (let i = 0; i < PLAYER_COUNT; i++) {
    hands[i] = sortTileIds(hands[i]);
  }
  const roundState = {
    phase: "DRAW" /* DRAW */,
    wall: currentWall,
    hands,
    melds: [[], [], []],
    discards: [[], [], []],
    currentTurn: event.dealerSeat,
    drawnTile: null,
    lastDiscard: null,
    riichi: [false, false, false],
    ippatsu: [false, false, false],
    isFirstTurn: true,
    isAfterKan: false,
    pendingClaims: [],
    turnStartTime: Date.now(),
    kanCount: 0,
    riichiDeclaredThisRound: [],
    nukidora: [[], [], []]
  };
  return {
    ...state,
    gamePhase: "PLAYING" /* PLAYING */,
    round: roundState,
    dealerSeat: event.dealerSeat
  };
}
function handleDrawTile2(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  hands[event.seat] = [...hands[event.seat], event.tileId];
  return {
    ...state,
    round: {
      ...round,
      hands,
      currentTurn: event.seat,
      drawnTile: event.tileId,
      phase: "DISCARD" /* DISCARD */,
      turnStartTime: Date.now()
    }
  };
}
function handleDiscard2(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const discards = [...round.discards];
  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx === -1) return state;
  handCopy.splice(idx, 1);
  hands[event.seat] = sortTileIds(handCopy);
  discards[event.seat] = [...discards[event.seat], event.tileId];
  const ippatsu2 = [...round.ippatsu];
  return {
    ...state,
    round: {
      ...round,
      hands,
      discards,
      drawnTile: null,
      lastDiscard: { seat: event.seat, tileId: event.tileId },
      phase: "CLAIM" /* CLAIM */,
      ippatsu: ippatsu2,
      isFirstTurn: false,
      isAfterKan: false,
      pendingClaims: [],
      turnStartTime: Date.now()
    }
  };
}
function handleRiichi2(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const riichi2 = [...round.riichi];
  const ippatsu2 = [...round.ippatsu];
  const riichiDeclared = [...round.riichiDeclaredThisRound];
  riichi2[event.seat] = true;
  ippatsu2[event.seat] = true;
  riichiDeclared.push(event.seat);
  return handleDiscard2(
    {
      ...state,
      round: {
        ...round,
        riichi: riichi2,
        ippatsu: ippatsu2,
        riichiDeclaredThisRound: riichiDeclared
      }
    },
    { seat: event.seat, tileId: event.tileId }
  );
}
function handleNukidora(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const nukidora = [...round.nukidora];
  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx === -1) return state;
  handCopy.splice(idx, 1);
  hands[event.seat] = handCopy;
  nukidora[event.seat] = [...nukidora[event.seat], event.tileId];
  return {
    ...state,
    round: {
      ...round,
      hands,
      nukidora,
      // After nukidora, player needs to draw a replacement tile
      phase: "KAN" /* KAN */,
      // reuse KAN phase for replacement draw
      isAfterKan: false,
      turnStartTime: Date.now()
    }
  };
}
function handlePon2(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    if (t === event.calledTile) continue;
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;
  const meld = {
    type: "PON" /* PON */,
    tiles: event.tiles,
    fromPlayer: event.fromSeat,
    calledTile: event.calledTile
  };
  melds[event.seat] = [...melds[event.seat], meld];
  const discards = [...round.discards];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;
  const ippatsu2 = [false, false, false];
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      discards,
      currentTurn: event.seat,
      phase: "DISCARD" /* DISCARD */,
      drawnTile: null,
      lastDiscard: null,
      ippatsu: ippatsu2,
      isFirstTurn: false,
      isAfterKan: false,
      pendingClaims: [],
      turnStartTime: Date.now()
    }
  };
}
function handleKanOpen2(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    if (t === event.calledTile) continue;
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;
  const meld = {
    type: "KAN_OPEN" /* KAN_OPEN */,
    tiles: event.tiles,
    fromPlayer: event.fromSeat,
    calledTile: event.calledTile
  };
  melds[event.seat] = [...melds[event.seat], meld];
  const discards = [...round.discards];
  const discardCopy = [...discards[event.fromSeat]];
  const dIdx = discardCopy.lastIndexOf(event.calledTile);
  if (dIdx !== -1) discardCopy.splice(dIdx, 1);
  discards[event.fromSeat] = discardCopy;
  const ippatsu2 = [false, false, false];
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      discards,
      currentTurn: event.seat,
      phase: "KAN" /* KAN */,
      drawnTile: null,
      lastDiscard: null,
      ippatsu: ippatsu2,
      isFirstTurn: false,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      pendingClaims: [],
      turnStartTime: Date.now()
    }
  };
}
function handleKanClosed2(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  for (const t of event.tiles) {
    const idx = handCopy.indexOf(t);
    if (idx !== -1) handCopy.splice(idx, 1);
  }
  hands[event.seat] = handCopy;
  const meld = {
    type: "KAN_CLOSED" /* KAN_CLOSED */,
    tiles: event.tiles
  };
  melds[event.seat] = [...melds[event.seat], meld];
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      currentTurn: event.seat,
      phase: "KAN" /* KAN */,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      turnStartTime: Date.now()
    }
  };
}
function handleKanAdded2(state, event) {
  if (!state.round) return state;
  const round = { ...state.round };
  const hands = [...round.hands];
  const melds = [...round.melds];
  const handCopy = [...hands[event.seat]];
  const idx = handCopy.indexOf(event.tileId);
  if (idx !== -1) handCopy.splice(idx, 1);
  hands[event.seat] = handCopy;
  const meldsCopy = [...melds[event.seat]];
  const kind = tileKind(event.tileId);
  const ponIdx = meldsCopy.findIndex(
    (m) => m.type === "PON" /* PON */ && tileKind(m.tiles[0]) === kind
  );
  if (ponIdx !== -1) {
    meldsCopy[ponIdx] = {
      ...meldsCopy[ponIdx],
      type: "KAN_ADDED" /* KAN_ADDED */,
      tiles: [...meldsCopy[ponIdx].tiles, event.tileId]
    };
  }
  melds[event.seat] = meldsCopy;
  return {
    ...state,
    round: {
      ...round,
      hands,
      melds,
      currentTurn: event.seat,
      phase: "KAN" /* KAN */,
      isAfterKan: true,
      kanCount: round.kanCount + 1,
      turnStartTime: Date.now()
    }
  };
}
function handleTsumo2(state, event) {
  const scores = [...state.scores];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }
  return {
    ...state,
    scores,
    gamePhase: "ROUND_RESULT" /* ROUND_RESULT */,
    riichiSticks: 0,
    round: state.round ? { ...state.round, phase: "ROUND_END" /* ROUND_END */ } : null
  };
}
function handleRon2(state, event) {
  const scores = [...state.scores];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }
  return {
    ...state,
    scores,
    gamePhase: "ROUND_RESULT" /* ROUND_RESULT */,
    riichiSticks: 0,
    round: state.round ? { ...state.round, phase: "ROUND_END" /* ROUND_END */ } : null
  };
}
function handleDrawRound2(state, event) {
  const scores = [...state.scores];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    scores[i] += event.scoreChanges[i] || 0;
  }
  return {
    ...state,
    scores,
    gamePhase: "ROUND_RESULT" /* ROUND_RESULT */,
    round: state.round ? { ...state.round, phase: "ROUND_END" /* ROUND_END */ } : null
  };
}
function handleSkipClaim2(state, event) {
  if (!state.round) return state;
  const pendingClaims = state.round.pendingClaims.filter(
    (c) => c.seat !== event.seat
  );
  return {
    ...state,
    round: {
      ...state.round,
      pendingClaims
    }
  };
}
function createSanmaInitialState() {
  return {
    rules: { ...SANMA_DEFAULT_RULES },
    gamePhase: "WAITING" /* WAITING */,
    scores: [
      SANMA_DEFAULT_RULES.startPoints,
      SANMA_DEFAULT_RULES.startPoints,
      SANMA_DEFAULT_RULES.startPoints
    ],
    round: null,
    roundWind: 0 /* EAST */,
    roundNumber: 0,
    honba: 0,
    riichiSticks: 0,
    dealerSeat: 0,
    seed: 0,
    eventSequence: 0
  };
}
function advanceSanmaRound(state, dealerWon) {
  let { roundWind, roundNumber, honba, dealerSeat } = state;
  if (dealerWon) {
    honba++;
  } else {
    dealerSeat = (dealerSeat + 1) % PLAYER_COUNT;
    if (dealerSeat === 0) {
      roundNumber++;
      if (roundNumber >= PLAYER_COUNT) {
        roundNumber = 0;
        roundWind = roundWind + 1;
      }
    }
    honba++;
  }
  const maxWind = state.rules.roundType === "east" ? 1 /* SOUTH */ : 2 /* WEST */;
  if (roundWind >= maxWind) {
    return { ...state, gamePhase: "GAME_RESULT" /* GAME_RESULT */ };
  }
  return {
    ...state,
    roundWind,
    roundNumber,
    honba,
    dealerSeat,
    gamePhase: "PLAYING" /* PLAYING */,
    round: null
  };
}

// packages/mahjong-engine/src/sanma/machine.ts
var PLAYER_COUNT2 = 3;
var SanmaGameMachine = class {
  state;
  eventLog = [];
  constructor(state) {
    this.state = state ?? createSanmaInitialState();
  }
  getState() {
    return this.state;
  }
  getEventLog() {
    return this.eventLog;
  }
  /** Start a new game. */
  startGame(seed, rules) {
    const fullRules = {
      ...this.state.rules,
      ...rules
    };
    const events = [];
    const startEvent = {
      type: "GAME_START",
      seed,
      rules: fullRules
    };
    this.applyEvent(startEvent);
    events.push(startEvent);
    const roundEvents = this.startNewRound();
    events.push(...roundEvents);
    return events;
  }
  /** Start a new round. */
  startNewRound() {
    const events = [];
    const roundSeed = this.state.seed + this.state.eventSequence;
    const roundStart = {
      type: "ROUND_START",
      seed: roundSeed,
      dealerSeat: this.state.dealerSeat
    };
    this.applyEvent(roundStart);
    events.push(roundStart);
    const drawEvents = this.doDraw(this.state.dealerSeat);
    events.push(...drawEvents);
    return events;
  }
  /** Process a player action. */
  processAction(action) {
    if (action.action === "NUKIDORA") {
      return this.handleNukidora(action.seat, action.tileId);
    }
    const available = this.getAvailableActions(action.seat);
    if (!available.includes(action.action)) {
      return [];
    }
    switch (action.action) {
      case "DISCARD" /* DISCARD */:
        return this.handleDiscard(action.seat, action.tileId);
      case "TSUMO" /* TSUMO */:
        return this.handleTsumo(action.seat);
      case "RON" /* RON */:
        return this.handleRon(action.seat);
      case "RIICHI" /* RIICHI */:
        return this.handleRiichi(action.seat, action.tileId);
      case "PON" /* PON */:
        return this.handlePon(action.seat, action.tiles);
      case "KAN_OPEN" /* KAN_OPEN */:
        return this.handleKanOpen(action.seat, action.tiles);
      case "KAN_CLOSED" /* KAN_CLOSED */:
        return this.handleKanClosed(action.seat, action.tiles);
      case "KAN_ADDED" /* KAN_ADDED */:
        return this.handleKanAdded(action.seat, action.tileId);
      case "SKIP" /* SKIP */:
        return this.handleSkip(action.seat);
      default:
        return [];
    }
  }
  /** Get available actions for a player (no chi in sanma). */
  getAvailableActions(seat) {
    const round = this.state.round;
    if (!round || this.state.gamePhase !== "PLAYING" /* PLAYING */) return [];
    const actions = [];
    const hand = round.hands[seat];
    const handKinds = hand.map(tileKind);
    if (round.phase === "DISCARD" /* DISCARD */ && round.currentTurn === seat) {
      actions.push("DISCARD" /* DISCARD */);
      if (round.drawnTile !== null) {
        if (isWinningHand(handKinds)) {
          actions.push("TSUMO" /* TSUMO */);
        }
      }
      if (this.state.rules.hasNukidora && !round.riichi[seat]) {
        if (hand.some((t) => tileKind(t) === NORTH_WIND_KIND)) {
          actions.push("NUKIDORA");
        }
      }
      if (!round.riichi[seat] && isMenzen2(round, seat) && this.state.scores[seat] >= 1e3) {
        for (const tile of hand) {
          const remaining = hand.filter((t) => t !== tile).map(tileKind);
          if (isTenpai(remaining)) {
            actions.push("RIICHI" /* RIICHI */);
            break;
          }
        }
      }
      const kanGroups = findClosedKanGroups2(hand);
      if (kanGroups.length > 0 && !round.riichi[seat]) {
        actions.push("KAN_CLOSED" /* KAN_CLOSED */);
      }
      if (!round.riichi[seat]) {
        for (const meld of round.melds[seat]) {
          if (meld.type === "PON" /* PON */) {
            const ponKind = tileKind(meld.tiles[0]);
            if (hand.some((t) => tileKind(t) === ponKind)) {
              actions.push("KAN_ADDED" /* KAN_ADDED */);
              break;
            }
          }
        }
      }
    }
    if (round.phase === "CLAIM" /* CLAIM */ && round.lastDiscard) {
      const discard = round.lastDiscard;
      if (discard.seat === seat) return actions;
      const discardKind = tileKind(discard.tileId);
      const testHand = [...handKinds, discardKind];
      if (isWinningHand(testHand)) {
        actions.push("RON" /* RON */);
      }
      const kindCount = handKinds.filter((k) => k === discardKind).length;
      if (kindCount >= 2 && !round.riichi[seat]) {
        actions.push("PON" /* PON */);
      }
      if (kindCount >= 3 && !round.riichi[seat]) {
        actions.push("KAN_OPEN" /* KAN_OPEN */);
      }
      if (actions.length > 0) {
        actions.push("SKIP" /* SKIP */);
      }
    }
    return actions;
  }
  /** Auto-discard for timeout/disconnect. */
  autoDiscard(seat) {
    const round = this.state.round;
    if (!round || round.currentTurn !== seat || round.phase !== "DISCARD" /* DISCARD */) {
      return [];
    }
    const tileId = round.drawnTile ?? round.hands[seat][round.hands[seat].length - 1];
    if (tileId === void 0) return [];
    const event = { type: "AUTO_DISCARD", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }
  /** Auto-skip all pending claims. */
  autoSkipAllClaims() {
    const round = this.state.round;
    if (!round || round.phase !== "CLAIM" /* CLAIM */ || !round.lastDiscard) {
      return [];
    }
    const events = [];
    for (let iter = 0; iter < PLAYER_COUNT2; iter++) {
      const currentRound = this.state.round;
      if (!currentRound || currentRound.phase !== "CLAIM" /* CLAIM */ || !currentRound.lastDiscard)
        break;
      let skipped = false;
      for (let i = 1; i < PLAYER_COUNT2; i++) {
        const s = (currentRound.lastDiscard.seat + i) % PLAYER_COUNT2;
        const available = this.getAvailableActions(s);
        if (available.includes("SKIP" /* SKIP */)) {
          const skipEvents = this.handleSkip(s);
          events.push(...skipEvents);
          skipped = true;
          break;
        }
      }
      if (!skipped) break;
    }
    return events;
  }
  /** Advance to next round. */
  advanceToNextRound(dealerWon) {
    if (this.state.gamePhase !== "ROUND_RESULT" /* ROUND_RESULT */) {
      return [];
    }
    this.state = advanceSanmaRound(this.state, dealerWon);
    if (this.state.gamePhase === "GAME_RESULT" /* GAME_RESULT */) {
      const event = {
        type: "GAME_END",
        finalScores: [...this.state.scores]
      };
      this.applyEvent(event);
      return [event];
    }
    return this.startNewRound();
  }
  isRoundOver() {
    return this.state.gamePhase === "ROUND_RESULT" /* ROUND_RESULT */;
  }
  isGameOver() {
    return this.state.gamePhase === "FINISHED" /* FINISHED */ || this.state.gamePhase === "GAME_RESULT" /* GAME_RESULT */;
  }
  // ===== Private handlers =====
  applyEvent(event) {
    this.state = sanmaReducer(this.state, event);
    this.eventLog.push(event);
  }
  doDraw(seat) {
    const round = this.state.round;
    if (!round) return [];
    const result = drawTile(round.wall);
    if (!result) {
      return this.handleExhaustiveDraw();
    }
    this.state = {
      ...this.state,
      round: { ...round, wall: result.wall }
    };
    const event = {
      type: "DRAW_TILE",
      seat,
      tileId: result.tile
    };
    this.applyEvent(event);
    return [event];
  }
  doDrawFromDeadWall(seat) {
    const round = this.state.round;
    if (!round) return [];
    const result = drawFromDeadWall(round.wall);
    if (!result) return [];
    this.state = {
      ...this.state,
      round: { ...round, wall: result.wall }
    };
    const event = {
      type: "DRAW_TILE",
      seat,
      tileId: result.tile
    };
    this.applyEvent(event);
    return [event];
  }
  handleDiscard(seat, tileId) {
    const event = { type: "DISCARD", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }
  handleRiichi(seat, tileId) {
    const event = { type: "RIICHI", seat, tileId };
    this.applyEvent(event);
    return this.afterDiscard(seat, [event]);
  }
  handleNukidora(seat, tileId) {
    const round = this.state.round;
    if (!round) return [];
    if (tileKind(tileId) !== NORTH_WIND_KIND) return [];
    const events = [];
    const event = { type: "NUKIDORA", seat, tileId };
    this.applyEvent(event);
    events.push(event);
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);
    return events;
  }
  afterDiscard(discardSeat, events) {
    const round = this.state.round;
    if (!round) return events;
    let anyClaims = false;
    for (let i = 1; i < PLAYER_COUNT2; i++) {
      const seat = (discardSeat + i) % PLAYER_COUNT2;
      const available = this.getAvailableActions(seat);
      if (available.length > 0) {
        anyClaims = true;
      }
    }
    if (!anyClaims) {
      const nextSeat = (discardSeat + 1) % PLAYER_COUNT2;
      const drawEvents = this.doDraw(nextSeat);
      events.push(...drawEvents);
    }
    return events;
  }
  handleTsumo(seat) {
    const round = this.state.round;
    if (!round) return [];
    const hand = round.hands[seat];
    const winTile = round.drawnTile;
    const winCtx = {
      handTileIds: hand,
      melds: round.melds[seat],
      winTileId: winTile,
      isTsumo: true,
      isRiichi: round.riichi[seat],
      isDoubleRiichi: false,
      isIppatsu: round.ippatsu[seat],
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind2(seat, this.state.dealerSeat),
      isFirstDraw: round.isFirstTurn,
      isLastTileDraw: tilesRemaining(round.wall) === 0,
      isLastDiscard: false,
      isRinshan: round.isAfterKan,
      isChankan: false
    };
    const yakuResult = evaluateYaku(winCtx);
    if (yakuResult.yaku.length === 0) return [];
    const doraHan = countDora2(
      hand,
      round.melds[seat],
      round,
      this.state.rules.hasRedDora,
      round.riichi[seat]
    );
    const nukidoraCount = round.nukidora[seat].length;
    const totalHan = yakuResult.totalHan + doraHan.total + nukidoraCount;
    const isDealer = seat === this.state.dealerSeat;
    const fu = calculateFu({
      decomposition: null,
      melds: round.melds[seat],
      winTileKind: tileKind(winTile),
      isTsumo: true,
      isMenzen: isMenzen2(round, seat),
      isPinfu: yakuResult.yaku.some((y) => y.name === "\u5E73\u548C"),
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind2(seat, this.state.dealerSeat),
      isChiitoi: yakuResult.yaku.some((y) => y.name === "\u4E03\u5BFE\u5B50")
    });
    const basePoints = calculateBasePoints(totalHan, fu);
    const payment = calculatePayment(
      basePoints,
      isDealer,
      true,
      this.state.honba,
      this.state.riichiSticks
    );
    const scoreChanges = { 0: 0, 1: 0, 2: 0 };
    if (payment.tsumoAll !== void 0) {
      for (let i = 0; i < PLAYER_COUNT2; i++) {
        if (i !== seat) {
          scoreChanges[i] -= payment.tsumoAll;
          scoreChanges[seat] += payment.tsumoAll;
        }
      }
    } else if (payment.tsumoDealer !== void 0 && payment.tsumoNonDealer !== void 0) {
      for (let i = 0; i < PLAYER_COUNT2; i++) {
        if (i === seat) continue;
        const amount = i === this.state.dealerSeat ? payment.tsumoDealer : payment.tsumoNonDealer;
        scoreChanges[i] -= amount;
        scoreChanges[seat] += amount;
      }
    }
    scoreChanges[seat] += this.state.riichiSticks * 1e3;
    for (const s of round.riichiDeclaredThisRound) {
      scoreChanges[s] -= 1e3;
    }
    const allYaku = [...yakuResult.yaku, ...doraHan.yakuList];
    if (nukidoraCount > 0) {
      allYaku.push({ name: "\u5317\u30C9\u30E9", han: nukidoraCount });
    }
    const event = {
      type: "TSUMO",
      seat,
      yaku: allYaku,
      han: totalHan,
      fu,
      score: calculateTotalWinnings(payment, this.state.riichiSticks),
      scoreChanges
    };
    this.applyEvent(event);
    return [event];
  }
  handleRon(seat) {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];
    const discard = round.lastDiscard;
    const hand = round.hands[seat];
    const allTiles = [...hand, discard.tileId];
    const winCtx = {
      handTileIds: allTiles,
      melds: round.melds[seat],
      winTileId: discard.tileId,
      isTsumo: false,
      isRiichi: round.riichi[seat],
      isDoubleRiichi: false,
      isIppatsu: round.ippatsu[seat],
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind2(seat, this.state.dealerSeat),
      isFirstDraw: false,
      isLastTileDraw: false,
      isLastDiscard: tilesRemaining(round.wall) === 0,
      isRinshan: false,
      isChankan: false
    };
    const yakuResult = evaluateYaku(winCtx);
    if (yakuResult.yaku.length === 0) return [];
    const doraHan = countDora2(
      allTiles,
      round.melds[seat],
      round,
      this.state.rules.hasRedDora,
      round.riichi[seat]
    );
    const nukidoraCount = round.nukidora[seat].length;
    const totalHan = yakuResult.totalHan + doraHan.total + nukidoraCount;
    const isDealer = seat === this.state.dealerSeat;
    const fu = calculateFu({
      decomposition: null,
      melds: round.melds[seat],
      winTileKind: tileKind(discard.tileId),
      isTsumo: false,
      isMenzen: isMenzen2(round, seat),
      isPinfu: false,
      roundWind: this.state.roundWind,
      seatWind: relativeSeatWind2(seat, this.state.dealerSeat),
      isChiitoi: yakuResult.yaku.some((y) => y.name === "\u4E03\u5BFE\u5B50")
    });
    const basePoints = calculateBasePoints(totalHan, fu);
    const payment = calculatePayment(
      basePoints,
      isDealer,
      false,
      this.state.honba,
      this.state.riichiSticks
    );
    const scoreChanges = { 0: 0, 1: 0, 2: 0 };
    scoreChanges[discard.seat] -= payment.ron;
    scoreChanges[seat] += payment.ron + this.state.riichiSticks * 1e3;
    for (const s of round.riichiDeclaredThisRound) {
      scoreChanges[s] -= 1e3;
    }
    const allYaku = [...yakuResult.yaku, ...doraHan.yakuList];
    if (nukidoraCount > 0) {
      allYaku.push({ name: "\u5317\u30C9\u30E9", han: nukidoraCount });
    }
    const event = {
      type: "RON",
      winners: [
        {
          seat,
          yaku: allYaku,
          han: totalHan,
          fu,
          score: payment.ron + this.state.riichiSticks * 1e3
        }
      ],
      loserSeat: discard.seat,
      scoreChanges
    };
    this.applyEvent(event);
    return [event];
  }
  handlePon(seat, tiles) {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];
    const event = {
      type: "PON",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat
    };
    this.applyEvent(event);
    return [event];
  }
  handleKanOpen(seat, tiles) {
    const round = this.state.round;
    if (!round || !round.lastDiscard) return [];
    const events = [];
    const event = {
      type: "KAN_OPEN",
      seat,
      tiles,
      calledTile: round.lastDiscard.tileId,
      fromSeat: round.lastDiscard.seat
    };
    this.applyEvent(event);
    events.push(event);
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);
    return events;
  }
  handleKanClosed(seat, tiles) {
    const events = [];
    const event = {
      type: "KAN_CLOSED",
      seat,
      tiles
    };
    this.applyEvent(event);
    events.push(event);
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);
    return events;
  }
  handleKanAdded(seat, tileId) {
    const events = [];
    const event = {
      type: "KAN_ADDED",
      seat,
      tileId
    };
    this.applyEvent(event);
    events.push(event);
    const drawEvents = this.doDrawFromDeadWall(seat);
    events.push(...drawEvents);
    return events;
  }
  handleSkip(seat) {
    const events = [];
    const event = { type: "SKIP_CLAIM", seat };
    this.applyEvent(event);
    events.push(event);
    const round = this.state.round;
    if (!round || !round.lastDiscard) return events;
    let anyClaims = false;
    for (let i = 1; i < PLAYER_COUNT2; i++) {
      const s = (round.lastDiscard.seat + i) % PLAYER_COUNT2;
      if (s === seat) continue;
      const available = this.getAvailableActions(s);
      if (available.length > 0) {
        anyClaims = true;
        break;
      }
    }
    if (!anyClaims) {
      const nextSeat = (round.lastDiscard.seat + 1) % PLAYER_COUNT2;
      const drawEvents = this.doDraw(nextSeat);
      events.push(...drawEvents);
    }
    return events;
  }
  handleExhaustiveDraw() {
    const round = this.state.round;
    if (!round) return [];
    const tenpaiPlayers = [];
    for (let i = 0; i < PLAYER_COUNT2; i++) {
      const handKinds = round.hands[i].map(tileKind);
      if (isTenpai(handKinds)) {
        tenpaiPlayers.push(i);
      }
    }
    const scoreChanges = { 0: 0, 1: 0, 2: 0 };
    const tenpaiCount = tenpaiPlayers.length;
    if (tenpaiCount > 0 && tenpaiCount < PLAYER_COUNT2) {
      const totalPenalty = 3e3;
      const penaltyPerNoten = totalPenalty / (PLAYER_COUNT2 - tenpaiCount);
      const bonusPerTenpai = totalPenalty / tenpaiCount;
      for (let i = 0; i < PLAYER_COUNT2; i++) {
        if (tenpaiPlayers.includes(i)) {
          scoreChanges[i] = bonusPerTenpai;
        } else {
          scoreChanges[i] = -penaltyPerNoten;
        }
      }
    }
    const event = {
      type: "DRAW_ROUND",
      reason: "EXHAUSTIVE_DRAW" /* EXHAUSTIVE_DRAW */,
      tenpaiPlayers,
      scoreChanges
    };
    this.applyEvent(event);
    return [event];
  }
};
function isMenzen2(round, seat) {
  return !round.melds[seat].some((m) => m.type !== "KAN_CLOSED" /* KAN_CLOSED */);
}
function relativeSeatWind2(seat, dealerSeat) {
  return (seat - dealerSeat + PLAYER_COUNT2) % PLAYER_COUNT2;
}
function findClosedKanGroups2(hand) {
  const counts = countByKind(hand);
  const groups = [];
  for (let k = 0; k < 34; k++) {
    if (counts[k] >= 4) groups.push(k);
  }
  return groups;
}
function countDora2(handTiles, melds, round, hasRedDora, _isRiichi) {
  const allTiles = [...handTiles];
  for (const m of melds) {
    allTiles.push(...m.tiles);
  }
  const indicators = getDoraIndicators(round.wall);
  let doraCount = 0;
  for (const indicator of indicators) {
    const doraKind = doraFromIndicator(tileKind(indicator));
    doraCount += allTiles.filter((t) => tileKind(t) === doraKind).length;
  }
  let redCount = 0;
  if (hasRedDora) {
    redCount = allTiles.filter(isRedDora).length;
  }
  const yakuList = [];
  if (doraCount > 0) yakuList.push({ name: "\u30C9\u30E9", han: doraCount });
  if (redCount > 0) yakuList.push({ name: "\u8D64\u30C9\u30E9", han: redCount });
  return { total: doraCount + redCount, yakuList };
}
export {
  ALL_YAKU_CHECKERS,
  EXCLUDED_MAN_KINDS,
  GameMachine,
  NORTH_WIND_KIND,
  SANMA_DEFAULT_RULES,
  SANMA_TILE_KINDS,
  SANMA_TOTAL_TILES,
  SanmaGameMachine,
  SeededRNG,
  advanceRound,
  advanceSanmaRound,
  allTileIds,
  analyzeDiscards,
  botDecideAction,
  calculateBasePoints,
  calculateFu,
  calculatePayment,
  calculateScoreChanges,
  calculateShanten,
  calculateTotalWinnings,
  calculateUmaOka,
  calculateWallBreakPosition,
  chankan,
  chanta,
  chiihou,
  chiitoitsu,
  chinitsu,
  chinroutou,
  chuurenPoutou,
  countByKind,
  createInitialState,
  createSanmaInitialState,
  createSanmaWall,
  createWall,
  daisangen,
  daisuushii,
  decomposeHand,
  doraFromIndicator,
  doubleRiichi,
  drawFromDeadWall,
  drawTile,
  evaluateYaku,
  findWaitingTiles,
  gameReducer,
  getDoraIndicators,
  getUraDoraIndicators,
  haitei,
  honitsu,
  honroutou,
  houtei,
  iipeikou,
  ikkitsuukan,
  ippatsu,
  isDragonTile,
  isGreenTile,
  isHonorTile,
  isNumberTile,
  isRedDora,
  isSevenPairs,
  isSimple,
  isTenpai,
  isTerminal,
  isTerminalOrHonor,
  isThirteenOrphans,
  isWindTile,
  isWinningHand,
  junchan,
  kokushiMusou,
  makeTileId,
  menzenTsumo,
  pinfu,
  riichi,
  rinshan,
  rollDice,
  runBotActions,
  ryanpeikou,
  ryuuiisou,
  sanankou,
  sankantsu,
  sanmaReducer,
  sanshokuDoujun,
  sanshokuDoukou,
  shousangen,
  shousuushii,
  sortTileIds,
  sortTileKinds,
  suuankou,
  suukantsu,
  tanyao,
  tenhou,
  tileCopy,
  tileKind,
  tileKindToString,
  tileNumber,
  tileSuit,
  tilesRemaining,
  toitoi,
  tsuuiisou,
  yakuhaiChun,
  yakuhaiHaku,
  yakuhaiHatsu,
  yakuhaiRoundWind,
  yakuhaiSeatWind
};

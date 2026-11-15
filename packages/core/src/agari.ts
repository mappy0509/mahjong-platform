import { KINDS, YAOCHU_KINDS, type Kind } from './tiles.ts';

/** 手の内（副露を除く）の面子分解。sets は刻子(chi=false)か順子(chi=true、kind は最小の牌)。 */
export interface Decomp {
  pair: Kind;
  sets: { kind: Kind; chi: boolean }[];
}

function setDecomps(c: number[], from: number): { kind: Kind; chi: boolean }[][] {
  let i = from;
  while (i < KINDS && c[i] === 0) i++;
  if (i >= KINDS) return [[]];
  const out: { kind: Kind; chi: boolean }[][] = [];
  if (c[i] >= 3) {
    c[i] -= 3;
    for (const rest of setDecomps(c, i)) out.push([{ kind: i, chi: false }, ...rest]);
    c[i] += 3;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    for (const rest of setDecomps(c, i)) out.push([{ kind: i, chi: true }, ...rest]);
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
  return out;
}

/** 通常形（n面子＋1雀頭）の全分解。c の合計は 3n+2。 */
export function decompose(c: number[]): Decomp[] {
  const out: Decomp[] = [];
  const work = c.slice();
  for (let p = 0; p < KINDS; p++) {
    if (work[p] < 2) continue;
    work[p] -= 2;
    for (const sets of setDecomps(work, 0)) out.push({ pair: p, sets });
    work[p] += 2;
  }
  return out;
}

function canFormSets(c: number[], from: number): boolean {
  let i = from;
  while (i < KINDS && c[i] === 0) i++;
  if (i >= KINDS) return true;
  if (c[i] >= 3) {
    c[i] -= 3;
    const ok = canFormSets(c, i);
    c[i] += 3;
    if (ok) return true;
  }
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    const ok = canFormSets(c, i);
    c[i]++; c[i + 1]++; c[i + 2]++;
    if (ok) return true;
  }
  return false;
}

export function isChiitoi(c: number[]): boolean {
  let pairs = 0;
  for (let i = 0; i < KINDS; i++) {
    if (c[i] === 2) pairs++;
    else if (c[i] !== 0) return false;
  }
  return pairs === 7;
}

export function isKokushi(c: number[]): boolean {
  let total = 0;
  let pair = false;
  for (let i = 0; i < KINDS; i++) total += c[i];
  if (total !== 14) return false;
  for (const k of YAOCHU_KINDS) {
    if (c[k] === 0) return false;
    if (c[k] === 2) pair = true;
    if (c[k] > 2) return false;
  }
  return pair;
}

/**
 * 和了形か。c は手の内（和了牌を含む、副露を除く）の枚数。meldCount は副露（暗槓含む）の数。
 * 手の内の合計は 14 - 3*meldCount でなければならない。
 */
export function isAgari(c: number[], meldCount: number): boolean {
  let total = 0;
  for (let i = 0; i < KINDS; i++) total += c[i];
  if (total !== 14 - 3 * meldCount) return false;
  if (meldCount === 0 && (isChiitoi(c) || isKokushi(c))) return true;
  const work = c.slice();
  for (let p = 0; p < KINDS; p++) {
    if (work[p] < 2) continue;
    work[p] -= 2;
    const ok = canFormSets(work, 0);
    work[p] += 2;
    if (ok) return true;
  }
  return false;
}

/**
 * 待ち牌。c は手の内 13 - 3*meldCount 枚。allowed を渡すと、その牌種だけを候補にする（3人麻雀用）。
 * 自分で4枚持っている牌は待ちに数えない。
 */
export function waitsOf(c: number[], meldCount: number, allowed?: boolean[]): Kind[] {
  const out: Kind[] = [];
  const work = c.slice();
  for (let k = 0; k < KINDS; k++) {
    if (allowed && !allowed[k]) continue;
    if (work[k] >= 4) continue;
    work[k]++;
    if (isAgari(work, meldCount)) out.push(k);
    work[k]--;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 向聴数（ボットとヒント表示用）
// ---------------------------------------------------------------------------

function regularShanten(c: number[], meldCount: number): number {
  const need = 4 - meldCount;
  let best = 8;
  const work = c.slice();
  const dfs = (i: number, m: number, t: number, pair: boolean) => {
    while (i < KINDS && work[i] === 0) i++;
    if (i >= KINDS) {
      let tt = t;
      if (m + tt > need) tt = need - m;
      const s = 2 * need - 2 * m - tt - (pair ? 1 : 0);
      if (s < best) best = s;
      return;
    }
    // 枝刈り: これ以上良くならない
    if (m < need) {
      if (work[i] >= 3) {
        work[i] -= 3;
        dfs(i, m + 1, t, pair);
        work[i] += 3;
      }
      if (i < 27 && i % 9 <= 6 && work[i + 1] > 0 && work[i + 2] > 0) {
        work[i]--; work[i + 1]--; work[i + 2]--;
        dfs(i, m + 1, t, pair);
        work[i]++; work[i + 1]++; work[i + 2]++;
      }
    }
    if (work[i] >= 2) {
      work[i] -= 2;
      if (!pair) dfs(i, m, t, true);
      dfs(i, m, t + 1, pair);
      work[i] += 2;
    }
    if (i < 27) {
      if (i % 9 <= 7 && work[i + 1] > 0) {
        work[i]--; work[i + 1]--;
        dfs(i, m, t + 1, pair);
        work[i]++; work[i + 1]++;
      }
      if (i % 9 <= 6 && work[i + 2] > 0) {
        work[i]--; work[i + 2]--;
        dfs(i, m, t + 1, pair);
        work[i]++; work[i + 2]++;
      }
    }
    const keep = work[i];
    work[i] = 0;
    dfs(i + 1, m, t, pair);
    work[i] = keep;
  };
  dfs(0, 0, 0, false);
  return best;
}

function chiitoiShanten(c: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < KINDS; i++) {
    if (c[i] >= 1) kinds++;
    if (c[i] >= 2) pairs++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

function kokushiShanten(c: number[]): number {
  let kinds = 0;
  let pair = 0;
  for (const k of YAOCHU_KINDS) {
    if (c[k] >= 1) kinds++;
    if (c[k] >= 2) pair = 1;
  }
  return 13 - kinds - pair;
}

/** 向聴数（-1 = 和了、0 = 聴牌）。c は手の内 13 or 14 - 3*meldCount 枚。 */
export function shanten(c: number[], meldCount: number): number {
  let s = regularShanten(c, meldCount);
  if (meldCount === 0) {
    s = Math.min(s, chiitoiShanten(c), kokushiShanten(c));
  }
  return s;
}

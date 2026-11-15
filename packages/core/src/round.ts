import { isAgari, isKokushi, waitsOf, decompose } from './agari.ts';
import type { Rules } from './rules.ts';
import { calcPayments, evaluateWin, isMenzen, type Meld, type WinInput, type WinResult } from './score.ts';
import {
  EAST, KINDS, NORTH, countsOf, isAkaTile, isDragon, isWind, isYaochu, sortTiles,
  type Kind, type Tile,
} from './tiles.ts';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export interface RiverTile {
  tile: Tile;
  tsumogiri: boolean;
  /** この牌で立直を宣言した */
  riichi: boolean;
  /** 鳴かれた場合、鳴いた席 */
  calledBy?: number;
}

export interface PlayerState {
  hand: Tile[];
  drawn: Tile | null;
  melds: Meld[];
  river: RiverTile[];
  nuki: Tile[];
  riichi: 0 | 1 | 2;
  /** 立直宣言牌が通るのを待っている（まだ供託を出していない） */
  riichiPending: boolean;
  ippatsu: boolean;
  furitenTemp: boolean;
  furitenRiichi: boolean;
  waits: Kind[];
  /** 喰い替えで切れない牌種（鳴いた直後の1打だけ） */
  kuikae: Kind[];
  pao: { daisangen?: number; daisuushi?: number };
}

export type Action =
  | { type: 'discard'; tile: Tile; riichi?: boolean }
  | { type: 'tsumo' }
  | { type: 'ankan'; kind: Kind }
  | { type: 'kakan'; tile: Tile }
  | { type: 'kyuushu' }
  | { type: 'nuki' }
  | { type: 'pass' }
  | { type: 'ron' }
  | { type: 'pon'; tiles: Tile[] }
  | { type: 'chi'; tiles: Tile[] }
  | { type: 'minkan' };

export interface TurnOptions {
  kind: 'turn';
  discard: Tile[];
  riichi: Tile[];
  tsumo: boolean;
  ankan: Kind[];
  kakan: Tile[];
  kyuushu: boolean;
  nuki: boolean;
}

export interface ClaimOptions {
  kind: 'claim';
  tile: Tile;
  from: number;
  ron: boolean;
  pon: Tile[][];
  chi: Tile[][];
  kan: boolean;
}

export type Options = TurnOptions | ClaimOptions;

export type DrawReason = 'exhaustive' | 'kyuushu' | 'suufon' | 'suucha' | 'suukan' | 'sanchahou';

export interface WinDetail {
  seat: number;
  from: number | null;
  hand: Tile[];
  melds: Meld[];
  winTile: Tile;
  result: WinResult;
  deltas: number[];
  uraIndicators: Tile[];
  pao: number | null;
}

export type RoundEvent =
  | { t: 'start'; dealer: number; roundWind: number; kyoku: number; honba: number; kyotaku: number; scores: number[]; hands: (Tile[] | null)[]; dora: Tile; left: number }
  | { t: 'draw'; seat: number; tile: Tile | null; rinshan: boolean; left: number }
  | { t: 'discard'; seat: number; tile: Tile; tsumogiri: boolean; riichi: boolean }
  | { t: 'riichi'; seat: number; double: boolean }
  | { t: 'riichiAccepted'; seat: number; scores: number[]; kyotaku: number }
  | { t: 'call'; seat: number; from: number; meld: Meld }
  | { t: 'kan'; seat: number; meld: Meld; kanType: 'ankan' | 'kakan' }
  | { t: 'nuki'; seat: number; tile: Tile }
  | { t: 'dora'; indicator: Tile }
  | { t: 'agari'; wins: WinDetail[]; deltas: number[]; scores: number[]; kyotaku: number }
  | { t: 'ryuukyoku'; reason: DrawReason; tenpai: boolean[]; hands: (Tile[] | null)[]; nagashi: number[]; deltas: number[]; scores: number[] };

export interface RoundResult {
  type: 'agari' | 'draw';
  reason?: DrawReason;
  /** 親が連荘するか */
  renchan: boolean;
  winners: number[];
  loser: number | null;
  deltas: number[];
  scores: number[];
  /** 次局へ持ち越す供託 */
  kyotaku: number;
  /** 親以外の和了で本場がリセットされるか */
  resetHonba: boolean;
}

export interface RoundInit {
  rules: Rules;
  dealer: number;
  /** 0=東場 1=南場 2=西場 3=北場 */
  roundWind: number;
  /** 局番号（0始まり） */
  kyoku: number;
  honba: number;
  kyotaku: number;
  scores: number[];
  /** 洗牌済みの山（4人=136枚、3人=108枚） */
  wall: Tile[];
}

interface ClaimState {
  kind: 'discard' | 'kakan' | 'ankan' | 'nuki';
  from: number;
  tile: Tile;
  options: Record<number, ClaimOptions>;
  responses: Record<number, Action>;
}

export interface RoundState {
  rules: Rules;
  n: number;
  dealer: number;
  roundWind: number;
  kyoku: number;
  honba: number;
  kyotaku: number;
  scores: number[];
  wall: Tile[];
  ptr: number;
  liveEnd: number;
  replacements: number;
  doraCount: number;
  pendingDora: number;
  kans: number;
  kanBy: number[];
  players: PlayerState[];
  phase: 'turn' | 'claim' | 'end';
  turn: number;
  afterCall: boolean;
  rinshan: boolean;
  /** 鳴き・槓・北抜きがまだ一度もない（第一巡の判定用） */
  uninterrupted: boolean;
  claim: ClaimState | null;
  result: RoundResult | null;
}

export type ActResult = { ok: true; events: RoundEvent[] } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// 山
// ---------------------------------------------------------------------------

/** 使用する全牌（3人麻雀は萬子2〜8を除く）。 */
export function allTiles(players: 3 | 4): Tile[] {
  const out: Tile[] = [];
  for (let t = 0; t < 136; t++) {
    const k = t >> 2;
    if (players === 3 && k >= 1 && k <= 7) continue;
    out.push(t);
  }
  return out;
}

/** rand は [0,1) の乱数。Fisher–Yates。 */
export function shuffledWall(players: 3 | 4, rand: () => number): Tile[] {
  const w = allTiles(players);
  for (let i = w.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = w[i]; w[i] = w[j]; w[j] = tmp;
  }
  return w;
}

/** テスト用の再現可能な乱数（mulberry32）。本番の洗牌には crypto を使うこと。 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Round
// ---------------------------------------------------------------------------

export class Round {
  s: RoundState;
  events: RoundEvent[] = [];
  private allowed: boolean[] | undefined;

  constructor(init: RoundInit | { state: RoundState }) {
    if ('state' in init) {
      this.s = init.state;
      this.allowed = this.makeAllowed();
      return;
    }
    const n = init.rules.players;
    const expect = n === 4 ? 136 : 108;
    if (init.wall.length !== expect) throw new Error(`wall must have ${expect} tiles`);
    const players: PlayerState[] = [];
    for (let i = 0; i < n; i++) {
      players.push({
        hand: sortTiles(init.wall.slice(i * 13, i * 13 + 13)),
        drawn: null, melds: [], river: [], nuki: [],
        riichi: 0, riichiPending: false, ippatsu: false,
        furitenTemp: false, furitenRiichi: false, waits: [], kuikae: [], pao: {},
      });
    }
    this.s = {
      rules: init.rules, n,
      dealer: init.dealer, roundWind: init.roundWind, kyoku: init.kyoku,
      honba: init.honba, kyotaku: init.kyotaku, scores: init.scores.slice(),
      wall: init.wall.slice(), ptr: 13 * n, liveEnd: init.wall.length - 14, replacements: 0,
      doraCount: 1, pendingDora: 0, kans: 0, kanBy: new Array(n).fill(0),
      players, phase: 'turn', turn: init.dealer, afterCall: false, rinshan: false,
      uninterrupted: true, claim: null, result: null,
    };
    this.allowed = this.makeAllowed();
    for (let i = 0; i < n; i++) this.updateWaits(i);
    this.emit({
      t: 'start', dealer: init.dealer, roundWind: init.roundWind, kyoku: init.kyoku,
      honba: init.honba, kyotaku: init.kyotaku, scores: this.s.scores.slice(),
      hands: players.map((p) => p.hand.slice()), dora: this.doraIndicators()[0], left: this.remaining(),
    });
    this.drawFor(init.dealer, false);
  }

  // ---- 基本情報 ----

  private makeAllowed(): boolean[] | undefined {
    if (this.s.n !== 3) return undefined;
    const a = new Array<boolean>(KINDS).fill(true);
    for (let k = 1; k <= 7; k++) a[k] = false;
    return a;
  }

  remaining(): number {
    return this.s.liveEnd - this.s.ptr;
  }

  doraIndicators(): Tile[] {
    const N = this.s.wall.length;
    const out: Tile[] = [];
    for (let i = 0; i < this.s.doraCount; i++) out.push(this.s.wall[N - 5 - 2 * i]);
    return out;
  }

  uraIndicators(): Tile[] {
    const N = this.s.wall.length;
    const out: Tile[] = [];
    for (let i = 0; i < this.s.doraCount; i++) out.push(this.s.wall[N - 6 - 2 * i]);
    return out;
  }

  seatWind(seat: number): Kind {
    return EAST + ((seat - this.s.dealer + this.s.n) % this.s.n);
  }

  private next(seat: number): number {
    return (seat + 1) % this.s.n;
  }

  private emit(e: RoundEvent) {
    this.events.push(e);
  }

  private concealed(seat: number): Tile[] {
    const p = this.s.players[seat];
    return p.drawn === null ? p.hand : [...p.hand, p.drawn];
  }

  private updateWaits(seat: number) {
    const p = this.s.players[seat];
    p.waits = waitsOf(countsOf(p.hand), p.melds.length, this.allowed);
  }

  isFuriten(seat: number): boolean {
    const p = this.s.players[seat];
    if (p.furitenTemp || p.furitenRiichi) return true;
    if (p.waits.length === 0) return false;
    for (const r of p.river) if (p.waits.includes(r.tile >> 2)) return true;
    return false;
  }

  private winInput(seat: number, winTile: Tile, tsumo: boolean, f: { chankan?: boolean; lastTile?: boolean }): WinInput {
    const p = this.s.players[seat];
    const first = this.s.uninterrupted && p.river.length === 0 && tsumo && !this.s.rinshan;
    return {
      hand: tsumo ? this.concealed(seat) : [...p.hand, winTile],
      melds: p.melds,
      winTile, tsumo,
      riichi: p.riichiPending ? 0 : p.riichi,
      ippatsu: p.ippatsu,
      rinshan: tsumo && this.s.rinshan,
      chankan: !!f.chankan,
      lastTile: !!f.lastTile,
      tenhou: first && seat === this.s.dealer,
      chiihou: first && seat !== this.s.dealer,
      seatWind: this.seatWind(seat),
      roundWind: EAST + this.s.roundWind,
      doraIndicators: this.doraIndicators(),
      uraIndicators: this.uraIndicators(),
      nuki: p.nuki.length,
      rules: this.s.rules,
    };
  }

  private canTsumo(seat: number): boolean {
    const p = this.s.players[seat];
    if (p.drawn === null || this.s.afterCall) return false;
    if (!isAgari(countsOf(this.concealed(seat)), p.melds.length)) return false;
    return evaluateWin(this.winInput(seat, p.drawn, true, { lastTile: this.remaining() === 0 })) !== null;
  }

  private canRon(seat: number, tile: Tile, kind: ClaimState['kind']): boolean {
    const p = this.s.players[seat];
    if (!p.waits.includes(tile >> 2)) return false;
    if (this.isFuriten(seat)) return false;
    const res = evaluateWin(
      this.winInput(seat, tile, false, { chankan: kind === 'kakan', lastTile: kind === 'discard' && this.remaining() === 0 }),
    );
    if (!res) return false;
    if (kind === 'ankan') return res.yaku.some((y) => y.id === 'kokushi' || y.id === 'kokushi13');
    return true;
  }

  private kanAllowed(): boolean {
    return this.s.kans < 4 && this.remaining() > 0;
  }

  // ---- 選択肢 ----

  /** いま行動を求められている席 */
  actors(): number[] {
    if (this.s.phase === 'turn') return [this.s.turn];
    if (this.s.phase === 'claim' && this.s.claim) {
      const c = this.s.claim;
      return Object.keys(c.options).map(Number).filter((q) => !(q in c.responses));
    }
    return [];
  }

  options(seat: number): Options | null {
    const s = this.s;
    if (s.phase === 'claim' && s.claim) {
      if (seat in s.claim.responses) return null;
      return s.claim.options[seat] ?? null;
    }
    if (s.phase !== 'turn' || s.turn !== seat) return null;
    const p = s.players[seat];
    const tiles = this.concealed(seat);
    const locked = p.riichi > 0;
    const opt: TurnOptions = {
      kind: 'turn', discard: [], riichi: [], tsumo: this.canTsumo(seat), ankan: [], kakan: [], kyuushu: false, nuki: false,
    };
    if (locked) {
      opt.discard = p.drawn !== null ? [p.drawn] : [];
    } else {
      opt.discard = tiles.filter((t) => !p.kuikae.includes(t >> 2));
    }
    if (s.afterCall) return opt;

    // 立直
    if (!locked && isMenzen(p.melds) && s.scores[seat] >= 1000 && this.remaining() >= 4) {
      const c = countsOf(tiles);
      const okKinds = new Set<Kind>();
      for (let k = 0; k < KINDS; k++) {
        if (!c[k]) continue;
        c[k]--;
        if (waitsOf(c, p.melds.length, this.allowed).length > 0) okKinds.add(k);
        c[k]++;
      }
      opt.riichi = tiles.filter((t) => okKinds.has(t >> 2));
    }

    // 暗槓・加槓
    if (this.kanAllowed()) {
      const c = countsOf(tiles);
      for (let k = 0; k < KINDS; k++) {
        if (c[k] !== 4) continue;
        if (!locked) opt.ankan.push(k);
        else if (p.drawn !== null && p.drawn >> 2 === k && this.riichiAnkanOk(seat, k)) opt.ankan.push(k);
      }
      if (!locked) {
        for (const t of tiles) {
          if (p.melds.some((m) => m.type === 'pon' && m.tiles[0] >> 2 === t >> 2)) opt.kakan.push(t);
        }
      }
    }

    // 九種九牌
    if (s.rules.abortiveDraws && s.uninterrupted && p.river.length === 0) {
      const kinds = new Set(tiles.map((t) => t >> 2).filter(isYaochu));
      if (kinds.size >= 9) opt.kyuushu = true;
    }

    // 北抜き
    if (s.n === 3 && this.remaining() > 0) {
      if (locked) opt.nuki = p.drawn !== null && p.drawn >> 2 === NORTH;
      else opt.nuki = tiles.some((t) => t >> 2 === NORTH);
    }
    return opt;
  }

  /** 立直後の暗槓: 待ちが変わらず、どの和了形でもその牌が暗刻になっていること。 */
  private riichiAnkanOk(seat: number, kind: Kind): boolean {
    const p = this.s.players[seat];
    const before = p.waits;
    const c = countsOf(p.hand);
    if (c[kind] !== 3) return false;
    for (const w of before) {
      c[w]++;
      const ds = decompose(c);
      c[w]--;
      if (ds.length === 0) return false; // 七対子・国士形は不可
      for (const d of ds) if (!d.sets.some((x) => !x.chi && x.kind === kind)) return false;
    }
    c[kind] -= 3;
    const after = waitsOf(c, p.melds.length + 1, this.allowed);
    c[kind] += 3;
    return after.length === before.length && after.every((k, i) => k === before[i]);
  }

  private claimOptionsFor(q: number, from: number, tile: Tile): ClaimOptions | null {
    const s = this.s;
    const p = s.players[q];
    const k = tile >> 2;
    const opt: ClaimOptions = { kind: 'claim', tile, from, ron: this.canRon(q, tile, 'discard'), pon: [], chi: [], kan: false };
    if (this.remaining() > 0 && p.riichi === 0) {
      const same = p.hand.filter((t) => t >> 2 === k);
      if (same.length >= 2) {
        opt.pon = this.variants([same, same], true);
        if (same.length === 3 && this.kanAllowed()) opt.kan = true;
      }
      if (s.n === 4 && q === this.next(from) && k < 27) {
        const num = k % 9;
        const pats: [number, number][] = [];
        if (num >= 2) pats.push([k - 2, k - 1]);
        if (num >= 1 && num <= 7) pats.push([k - 1, k + 1]);
        if (num <= 6) pats.push([k + 1, k + 2]);
        for (const [a, b] of pats) {
          const ta = p.hand.filter((t) => t >> 2 === a);
          const tb = p.hand.filter((t) => t >> 2 === b);
          if (!ta.length || !tb.length) continue;
          const forbidden = this.kuikaeKinds(k, a, b);
          for (const pair of this.variants([ta, tb], false)) {
            const rest = p.hand.filter((t) => t !== pair[0] && t !== pair[1]);
            if (rest.some((t) => !forbidden.includes(t >> 2))) opt.chi.push(pair);
          }
        }
      }
      // ポン後に切れる牌が無い場合は除く
      if (opt.pon.length) {
        opt.pon = opt.pon.filter((pair) => p.hand.some((t) => t !== pair[0] && t !== pair[1] && t >> 2 !== k));
      }
    }
    if (!opt.ron && !opt.pon.length && !opt.chi.length && !opt.kan) return null;
    return opt;
  }

  /** 赤の有無が異なる組み合わせだけを列挙する。same=true は同じ牌種から2枚選ぶ場合。 */
  private variants(groups: [Tile[], Tile[]], same: boolean): Tile[][] {
    const out: Tile[][] = [];
    const seen = new Set<string>();
    const [ga, gb] = groups;
    for (let i = 0; i < ga.length; i++) {
      for (let j = same ? i + 1 : 0; j < gb.length; j++) {
        const a = ga[i], b = gb[j];
        const key = same ? [isAkaTile(a), isAkaTile(b)].sort().join() : `${isAkaTile(a)},${isAkaTile(b)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([a, b]);
      }
    }
    return out;
  }

  private kuikaeKinds(called: Kind, a: Kind, b: Kind): Kind[] {
    const out = [called];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    if (called < lo && hi % 9 < 8) out.push(hi + 1);
    if (called > hi && lo % 9 > 0) out.push(lo - 1);
    return out;
  }

  /** 時間切れのときにサーバーが代わりに投入する行動 */
  defaultAction(seat: number): Action | null {
    const o = this.options(seat);
    if (!o) return null;
    if (o.kind === 'claim') return { type: 'pass' };
    const p = this.s.players[seat];
    if (p.drawn !== null && o.discard.includes(p.drawn)) return { type: 'discard', tile: p.drawn };
    if (o.discard.length) return { type: 'discard', tile: o.discard[o.discard.length - 1] };
    return null;
  }

  // ---- 行動 ----

  act(seat: number, a: Action): ActResult {
    const mark = this.events.length;
    const err = this.apply(seat, a);
    if (err) return { ok: false, error: err };
    return { ok: true, events: this.events.slice(mark) };
  }

  private apply(seat: number, a: Action): string | null {
    const s = this.s;
    if (s.phase === 'end') return 'round is over';
    if (seat < 0 || seat >= s.n || !Number.isInteger(seat)) return 'bad seat';
    const o = this.options(seat);
    if (!o) return 'not your turn';

    if (o.kind === 'claim') {
      const c = s.claim!;
      switch (a.type) {
        case 'pass': break;
        case 'ron': if (!o.ron) return 'cannot ron'; break;
        case 'minkan': if (!o.kan) return 'cannot kan'; break;
        case 'pon':
        case 'chi': {
          const list = a.type === 'pon' ? o.pon : o.chi;
          if (!Array.isArray(a.tiles) || a.tiles.length !== 2) return 'bad tiles';
          const p = s.players[seat];
          const [x, y] = a.tiles;
          if (x === y || !p.hand.includes(x) || !p.hand.includes(y)) return 'tiles not in hand';
          // 同じ牌種・同じ赤の構成の選択肢があるか
          const sig = (t: Tile[]) => t.map((z) => `${z >> 2}${isAkaTile(z) ? 'r' : ''}`).sort().join();
          if (!list.some((opt) => sig(opt) === sig(a.tiles))) return `cannot ${a.type}`;
          break;
        }
        default: return 'invalid action';
      }
      c.responses[seat] = a;
      this.tryResolve();
      return null;
    }

    switch (a.type) {
      case 'discard': {
        if (!o.discard.includes(a.tile)) return 'cannot discard that tile';
        if (a.riichi && !o.riichi.includes(a.tile)) return 'cannot riichi with that tile';
        this.doDiscard(seat, a.tile, !!a.riichi);
        return null;
      }
      case 'tsumo': {
        if (!o.tsumo) return 'cannot tsumo';
        this.finishAgari([seat], null, 'discard');
        return null;
      }
      case 'ankan': {
        if (!o.ankan.includes(a.kind)) return 'cannot ankan';
        this.doAnkan(seat, a.kind);
        return null;
      }
      case 'kakan': {
        if (!o.kakan.includes(a.tile)) return 'cannot kakan';
        this.doKakan(seat, a.tile);
        return null;
      }
      case 'kyuushu': {
        if (!o.kyuushu) return 'cannot declare kyuushu';
        this.abort('kyuushu', seat);
        return null;
      }
      case 'nuki': {
        if (!o.nuki) return 'cannot nuki';
        this.doNuki(seat);
        return null;
      }
      default:
        return 'invalid action';
    }
  }

  private takeFromConcealed(seat: number, tile: Tile) {
    const p = this.s.players[seat];
    if (p.drawn !== null) {
      p.hand.push(p.drawn);
      p.drawn = null;
    }
    const i = p.hand.indexOf(tile);
    if (i < 0) throw new Error('tile not in hand');
    p.hand.splice(i, 1);
    p.hand = sortTiles(p.hand);
  }

  private drawFor(seat: number, replacement: boolean) {
    const s = this.s;
    if (!replacement && this.remaining() === 0) {
      this.exhaustiveDraw();
      return;
    }
    let tile: Tile;
    if (replacement) {
      const N = s.wall.length;
      if (s.replacements < 4) {
        tile = s.wall[N - 1 - s.replacements];
        s.liveEnd--;
      } else {
        s.liveEnd--;
        tile = s.wall[s.liveEnd];
      }
      s.replacements++;
      s.rinshan = true;
    } else {
      tile = s.wall[s.ptr++];
      s.rinshan = false;
    }
    s.players[seat].drawn = tile;
    s.turn = seat;
    s.phase = 'turn';
    s.afterCall = false;
    s.claim = null;
    this.emit({ t: 'draw', seat, tile, rinshan: replacement, left: this.remaining() });
  }

  private flipDora(count: number) {
    const s = this.s;
    for (let i = 0; i < count; i++) {
      if (!s.rules.kanDora || s.doraCount >= 5) continue;
      s.doraCount++;
      const ind = this.doraIndicators();
      this.emit({ t: 'dora', indicator: ind[ind.length - 1] });
    }
  }

  private flipPendingDora() {
    const n = this.s.pendingDora;
    this.s.pendingDora = 0;
    this.flipDora(n);
  }

  private doDiscard(seat: number, tile: Tile, riichi: boolean) {
    const s = this.s;
    const p = s.players[seat];
    const tsumogiri = p.drawn === tile;
    if (riichi) {
      p.riichi = s.uninterrupted && p.river.length === 0 ? 2 : 1;
      p.riichiPending = true;
      this.emit({ t: 'riichi', seat, double: p.riichi === 2 });
    } else if (p.riichi > 0) {
      p.ippatsu = false;
    }
    this.takeFromConcealed(seat, tile);
    p.river.push({ tile, tsumogiri, riichi });
    p.kuikae = [];
    p.furitenTemp = false;
    this.updateWaits(seat);
    s.rinshan = false;
    s.afterCall = false;
    this.emit({ t: 'discard', seat, tile, tsumogiri, riichi });
    this.flipPendingDora();

    const options: Record<number, ClaimOptions> = {};
    for (let i = 1; i < s.n; i++) {
      const q = (seat + i) % s.n;
      const o = this.claimOptionsFor(q, seat, tile);
      if (o) options[q] = o;
    }
    if (Object.keys(options).length > 0) {
      s.phase = 'claim';
      s.claim = { kind: 'discard', from: seat, tile, options, responses: {} };
    } else {
      this.afterDiscard(seat, tile, null, null);
    }
  }

  /** 捨て牌にロンが掛からなかった後の処理。caller があれば鳴きを実行する。 */
  private afterDiscard(from: number, tile: Tile, caller: number | null, call: Action | null) {
    const s = this.s;
    const k = tile >> 2;
    this.markFuriten(from, k);
    const d = s.players[from];
    if (d.riichiPending) {
      d.riichiPending = false;
      d.ippatsu = s.rules.ippatsu;
      s.scores[from] -= 1000;
      s.kyotaku++;
      this.emit({ t: 'riichiAccepted', seat: from, scores: s.scores.slice(), kyotaku: s.kyotaku });
    }
    if (s.rules.abortiveDraws) {
      if (s.n === 4 && s.uninterrupted && caller === null && s.players.every((p) => p.river.length === 1)) {
        const k0 = s.players[0].river[0].tile >> 2;
        if (isWind(k0) && s.players.every((p) => p.river[0].tile >> 2 === k0)) return this.abort('suufon', null);
      }
      if (s.n === 4 && s.players.every((p) => p.riichi > 0 && !p.riichiPending)) return this.abort('suucha', null);
      if (s.kans === 4 && Math.max(...s.kanBy) < 4) return this.abort('suukan', null);
    }
    if (caller !== null && call) {
      this.doCall(caller, from, tile, call);
      return;
    }
    this.drawFor(this.next(from), false);
  }

  private markFuriten(except: number, kind: Kind) {
    const s = this.s;
    for (let q = 0; q < s.n; q++) {
      if (q === except) continue;
      const p = s.players[q];
      if (!p.waits.includes(kind)) continue;
      if (p.riichi > 0) p.furitenRiichi = true;
      else p.furitenTemp = true;
    }
  }

  private clearIppatsu() {
    for (const p of this.s.players) p.ippatsu = false;
  }

  private doCall(q: number, from: number, tile: Tile, a: Action) {
    const s = this.s;
    const p = s.players[q];
    const river = s.players[from].river;
    river[river.length - 1].calledBy = q;
    s.uninterrupted = false;
    this.clearIppatsu();
    const k = tile >> 2;
    let own: Tile[];
    let type: Meld['type'];
    if (a.type === 'minkan') {
      own = p.hand.filter((t) => t >> 2 === k);
      type = 'minkan';
    } else if (a.type === 'pon' || a.type === 'chi') {
      // 同じ赤構成の実牌に解決する
      own = a.tiles.slice();
      type = a.type;
    } else {
      throw new Error('bad call');
    }
    for (const t of own) p.hand.splice(p.hand.indexOf(t), 1);
    const meld: Meld = { type, tiles: sortTiles([...own, tile]), called: tile, from };
    p.melds.push(meld);
    this.checkPao(q, from, k);
    this.emit({ t: 'call', seat: q, from, meld });
    if (type === 'minkan') {
      s.kans++;
      s.kanBy[q]++;
      s.pendingDora++;
      this.drawFor(q, true);
      return;
    }
    p.kuikae = type === 'pon' ? [k] : this.kuikaeKinds(k, own[0] >> 2, own[1] >> 2);
    p.drawn = null;
    s.turn = q;
    s.phase = 'turn';
    s.afterCall = true;
    s.claim = null;
  }

  private checkPao(q: number, from: number, kind: Kind) {
    const p = this.s.players[q];
    const pons = p.melds.filter((m) => m.type !== 'chi').map((m) => m.tiles[0] >> 2);
    if (isDragon(kind) && pons.filter(isDragon).length === 3) p.pao.daisangen = from;
    if (isWind(kind) && pons.filter(isWind).length === 4) p.pao.daisuushi = from;
  }

  private doAnkan(seat: number, kind: Kind) {
    const s = this.s;
    const p = s.players[seat];
    this.flipPendingDora();
    const tiles = this.concealed(seat).filter((t) => t >> 2 === kind);
    for (const t of tiles) this.takeFromConcealed(seat, t);
    const meld: Meld = { type: 'ankan', tiles: sortTiles(tiles) };
    p.melds.push(meld);
    s.uninterrupted = false;
    this.updateWaits(seat);
    this.emit({ t: 'kan', seat, meld, kanType: 'ankan' });
    if (s.rules.kokushiAnkanRon && this.openChankan(seat, tiles[0], 'ankan')) return;
    this.completeKan(seat, 'ankan');
  }

  private doKakan(seat: number, tile: Tile) {
    const s = this.s;
    const p = s.players[seat];
    this.flipPendingDora();
    this.takeFromConcealed(seat, tile);
    const meld = p.melds.find((m) => m.type === 'pon' && m.tiles[0] >> 2 === tile >> 2)!;
    meld.type = 'kakan';
    meld.tiles = sortTiles([...meld.tiles, tile]);
    meld.added = tile;
    s.uninterrupted = false;
    this.updateWaits(seat);
    this.emit({ t: 'kan', seat, meld, kanType: 'kakan' });
    if (this.openChankan(seat, tile, 'kakan')) return;
    this.completeKan(seat, 'kakan');
  }

  private doNuki(seat: number) {
    const s = this.s;
    const p = s.players[seat];
    const tiles = this.concealed(seat);
    const tile = p.drawn !== null && p.drawn >> 2 === NORTH ? p.drawn : tiles.find((t) => t >> 2 === NORTH)!;
    this.takeFromConcealed(seat, tile);
    p.nuki.push(tile);
    s.uninterrupted = false;
    this.updateWaits(seat);
    this.emit({ t: 'nuki', seat, tile });
    if (this.openChankan(seat, tile, 'nuki')) return;
    this.completeKan(seat, 'nuki');
  }

  /** 槓・北抜きに対するロンの受付。受付が発生したら true。 */
  private openChankan(seat: number, tile: Tile, kind: 'kakan' | 'ankan' | 'nuki'): boolean {
    const s = this.s;
    const options: Record<number, ClaimOptions> = {};
    for (let i = 1; i < s.n; i++) {
      const q = (seat + i) % s.n;
      if (this.canRon(q, tile, kind)) {
        options[q] = { kind: 'claim', tile, from: seat, ron: true, pon: [], chi: [], kan: false };
      }
    }
    if (Object.keys(options).length === 0) return false;
    s.phase = 'claim';
    s.claim = { kind, from: seat, tile, options, responses: {} };
    return true;
  }

  private completeKan(seat: number, kind: 'kakan' | 'ankan' | 'nuki') {
    const s = this.s;
    this.clearIppatsu();
    if (kind !== 'nuki') {
      s.kans++;
      s.kanBy[seat]++;
      if (kind === 'ankan') this.flipDora(1);
      else s.pendingDora++;
    }
    this.drawFor(seat, true);
  }

  private tryResolve() {
    const s = this.s;
    const c = s.claim!;
    const seats = Object.keys(c.options).map(Number);
    const pending = seats.filter((q) => !(q in c.responses));
    if (pending.some((q) => c.options[q].ron)) return;
    const dist = (q: number) => (q - c.from + s.n) % s.n;
    const rons = seats.filter((q) => c.responses[q]?.type === 'ron').sort((a, b) => dist(a) - dist(b));
    if (rons.length > 0) {
      if (s.rules.tripleRonAbort && rons.length >= 3) {
        this.abort('sanchahou', null);
        return;
      }
      this.finishAgari(rons, c.from, c.kind);
      return;
    }
    if (pending.some((q) => c.options[q].pon.length > 0 || c.options[q].kan)) return;
    let caller = seats.find((q) => c.responses[q]?.type === 'pon' || c.responses[q]?.type === 'minkan');
    if (caller === undefined) {
      if (pending.length > 0) return;
      caller = seats.find((q) => c.responses[q]?.type === 'chi');
    }
    const call = caller !== undefined ? c.responses[caller] : null;
    s.claim = null;
    if (c.kind === 'discard') {
      this.afterDiscard(c.from, c.tile, caller ?? null, call);
    } else {
      this.markFuriten(c.from, c.tile >> 2);
      this.completeKan(c.from, c.kind);
    }
  }

  // ---- 局の終了 ----

  private finishAgari(winners: number[], loser: number | null, kind: ClaimState['kind']) {
    const s = this.s;
    const total = new Array<number>(s.n).fill(0);
    const wins: WinDetail[] = [];
    const lastTile = this.remaining() === 0;
    const claimTile = s.claim?.tile;
    if (loser !== null && s.players[loser].riichiPending) {
      // 立直宣言牌で放銃: 立直は不成立（供託は出さない）
      s.players[loser].riichiPending = false;
      s.players[loser].riichi = 0;
    }
    winners.forEach((w, idx) => {
      const p = s.players[w];
      const tsumo = loser === null;
      const winTile = tsumo ? p.drawn! : claimTile!;
      const inp = this.winInput(w, winTile, tsumo, {
        chankan: kind === 'kakan',
        lastTile: tsumo ? lastTile : kind === 'discard' && lastTile,
      });
      const result = evaluateWin(inp)!;
      let paoSeat = -1;
      let paoBase = 0;
      if (s.rules.pao && result.paoYaku.length) {
        for (const id of result.paoYaku) {
          const seat = id === 'daisangen' ? p.pao.daisangen : p.pao.daisuushi;
          if (seat === undefined) continue;
          const y = result.yaku.find((x) => x.id === id)!;
          paoSeat = seat;
          paoBase += 8000 * (y.han / 13);
        }
      }
      const pao = paoSeat >= 0 ? { seat: paoSeat, base: paoBase } : null;
      const deltas = calcPayments({
        base: result.base, n: s.n, winner: w, dealer: s.dealer, loser,
        honba: idx === 0 ? s.honba : 0, rules: s.rules, pao,
      });
      if (idx === 0) {
        deltas[w] += s.kyotaku * 1000;
      }
      for (let i = 0; i < s.n; i++) total[i] += deltas[i];
      wins.push({
        seat: w, from: loser, hand: sortTiles(inp.hand), melds: p.melds, winTile, result, deltas,
        uraIndicators: p.riichi > 0 && s.rules.uraDora ? this.uraIndicators() : [],
        pao: pao ? pao.seat : null,
      });
    });
    // 供託の分は誰の点数からも引かれない（卓上の棒）
    for (let i = 0; i < s.n; i++) s.scores[i] += total[i];
    s.kyotaku = 0;
    const dealerWon = winners.includes(s.dealer);
    s.phase = 'end';
    s.claim = null;
    s.result = {
      type: 'agari', renchan: dealerWon, winners, loser, deltas: total, scores: s.scores.slice(),
      kyotaku: 0, resetHonba: !dealerWon,
    };
    this.emit({ t: 'agari', wins, deltas: total, scores: s.scores.slice(), kyotaku: 0 });
  }

  private exhaustiveDraw() {
    const s = this.s;
    const tenpai = s.players.map((p) => p.waits.length > 0);
    const deltas = new Array<number>(s.n).fill(0);
    const nagashi: number[] = [];
    if (s.rules.nagashiMangan) {
      for (let q = 0; q < s.n; q++) {
        const r = s.players[q].river;
        if (r.length > 0 && r.every((x) => isYaochu(x.tile >> 2) && x.calledBy === undefined)) nagashi.push(q);
      }
    }
    if (nagashi.length > 0) {
      for (const q of nagashi) {
        const d = calcPayments({ base: 2000, n: s.n, winner: q, dealer: s.dealer, loser: null, honba: 0, rules: s.rules });
        for (let i = 0; i < s.n; i++) deltas[i] += d[i];
      }
    } else {
      const t = tenpai.filter(Boolean).length;
      if (t > 0 && t < s.n) {
        const pot = (s.n - 1) * 1000;
        for (let q = 0; q < s.n; q++) deltas[q] += tenpai[q] ? pot / t : -pot / (s.n - t);
      }
    }
    for (let i = 0; i < s.n; i++) s.scores[i] += deltas[i];
    s.phase = 'end';
    s.claim = null;
    s.result = {
      type: 'draw', reason: 'exhaustive', renchan: tenpai[s.dealer], winners: [], loser: null,
      deltas, scores: s.scores.slice(), kyotaku: s.kyotaku, resetHonba: false,
    };
    this.emit({
      t: 'ryuukyoku', reason: 'exhaustive', tenpai,
      hands: s.players.map((p, i) => (tenpai[i] ? p.hand.slice() : null)),
      nagashi, deltas, scores: s.scores.slice(),
    });
  }

  private abort(reason: DrawReason, revealSeat: number | null) {
    const s = this.s;
    const deltas = new Array<number>(s.n).fill(0);
    s.phase = 'end';
    s.claim = null;
    s.result = {
      type: 'draw', reason, renchan: true, winners: [], loser: null,
      deltas, scores: s.scores.slice(), kyotaku: s.kyotaku, resetHonba: false,
    };
    this.emit({
      t: 'ryuukyoku', reason, tenpai: s.players.map(() => false),
      hands: s.players.map((_, i) => (i === revealSeat ? sortTiles(this.concealed(i)) : null)),
      nagashi: [], deltas, scores: s.scores.slice(),
    });
  }
}

/** 他家に見せてはいけない情報を伏せたイベントを返す。 */
export function redactEvent(e: RoundEvent, seat: number): RoundEvent {
  if (e.t === 'start') return { ...e, hands: e.hands.map((h, i) => (i === seat ? h : null)) };
  if (e.t === 'draw' && e.seat !== seat) return { ...e, tile: null };
  return e;
}

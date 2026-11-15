import {
  Game, botAction, redactEvent, viewFor,
  type Action, type ClientMsg, type GameInfo, type GameSummary, type Prompt, type Round, type RoundEvent,
  type RoundResult, type Rules, type ServerMsg, type TableInfo,
} from '@mj/core';

/**
 * 1卓 = 1アクター。対局の正はこのオブジェクトのメモリ上にある。
 * 時計・タイマー・乱数・送信・保存は外から渡す（Node 常駐でも Durable Objects でも動かせるようにするため）。
 */

export interface Conn {
  send(msg: ServerMsg): void;
}

export interface TableHooks {
  /** 対局開始時（保存用）。seats は席順の userId（ボットは null） */
  onGameStart?(t: Table): void | Promise<void>;
  onRoundEnd?(t: Table, result: RoundResult, events: RoundEvent[]): void | Promise<void>;
  onGameEnd?(t: Table, summary: GameSummary): void | Promise<void>;
}

export interface TableDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(h: unknown): void;
  /** [0,1) の乱数。本番は crypto 由来のものを渡す */
  rand(): number;
  hooks?: TableHooks;
  log?(msg: string): void;
}

interface Seat {
  seat: number;
  userId: string | null;
  name: string;
  bot: boolean;
  ready: boolean;
  /** 時間切れが出たら true。本人が操作するまで短い時間で自動処理する */
  afk: boolean;
  /** 残りの追加時間（ms） */
  bank: number;
  conns: Set<Conn>;
}

interface ActivePrompt {
  seq: number;
  deadline: number;
  startedAt: number;
  base: number;
  timer: unknown;
  /** 選択の余地がない場面（立直後のツモ切り）。時間切れでも放置扱いにしない */
  forced: boolean;
}

const AFK_MS = 1200;
/** ボットの思考時間の倍率（検証を速く回すときに小さくする） */
const BOT_SPEED = Number((globalThis as any).process?.env?.BOT_SPEED ?? 1);
const GRACE_MS = 400;
const ROUND_END_WAIT_MS = 15000;
const ROUND_END_MIN_MS = 2500;

export class Table {
  readonly id: string;
  readonly rules: Rules;
  state: 'waiting' | 'playing' | 'finished' = 'waiting';
  seats: Seat[];
  game: Game | null = null;
  round: Round | null = null;
  /** 保存用: 現在の局の全イベント */
  private prompts = new Map<number, ActivePrompt>();
  private seq = 0;
  private spectators = new Map<string, Set<Conn>>();
  private nextTimer: unknown = null;
  private nextAt = 0;
  private nextConfirmed = new Set<number>();
  private roundEndedAt = 0;
  private lastSummary: GameSummary | null = null;
  private lastResult: RoundResult | null = null;

  /** fixedDealer: 起家を席0に固定する（クラブ卓。DB側の同点順位が席番号順のため合わせる） */
  constructor(id: string, rules: Rules, private deps: TableDeps, private opts: { fixedDealer?: boolean } = {}) {
    this.id = id;
    this.rules = rules;
    this.seats = Array.from({ length: rules.players }, (_, i) => ({
      seat: i, userId: null, name: '', bot: false, ready: false, afk: false,
      bank: rules.timeBank * 1000, conns: new Set<Conn>(),
    }));
  }

  // ---- 席 ----

  seatOf(userId: string): number {
    return this.seats.findIndex((s) => s.userId === userId);
  }

  /** 空席に座る。すでに座っていればその席を返す。満席なら -1。 */
  sit(userId: string, name: string, seat?: number): number {
    const cur = this.seatOf(userId);
    if (cur >= 0) return cur;
    if (this.state !== 'waiting') return -1;
    const target = seat !== undefined && this.seats[seat] && !this.seats[seat].userId && !this.seats[seat].bot
      ? this.seats[seat]
      : this.seats.find((s) => !s.userId && !s.bot);
    if (!target) return -1;
    target.userId = userId;
    target.name = name;
    target.ready = false;
    this.broadcastTable();
    return target.seat;
  }

  leave(userId: string) {
    if (this.state !== 'waiting') return;
    const i = this.seatOf(userId);
    if (i < 0) return;
    const s = this.seats[i];
    s.userId = null; s.name = ''; s.ready = false;
    this.broadcastTable();
  }

  /** 空席をボットで埋める */
  fillBots(names: string[] = ['CPU 東風', 'CPU 南雲', 'CPU 西嶺', 'CPU 北斗']) {
    for (const s of this.seats) {
      if (!s.userId && !s.bot) {
        s.bot = true;
        s.name = names[s.seat] ?? `CPU ${s.seat + 1}`;
        s.ready = true;
      }
    }
    this.broadcastTable();
    this.maybeStart();
  }

  info(): TableInfo {
    return {
      id: this.id, rules: this.rules, state: this.state,
      seats: this.seats.map((s) => ({
        seat: s.seat, userId: s.userId, name: s.name, bot: s.bot,
        connected: s.bot || s.conns.size > 0, ready: s.ready,
      })),
    };
  }

  gameInfo(): GameInfo {
    const g = this.game!;
    return {
      roundWind: g.s.roundWind, kyoku: g.kyoku(), honba: g.s.honba, kyotaku: g.s.kyotaku,
      dealer: g.s.dealer, scores: (this.round?.s.scores ?? g.s.scores).slice(), handsPlayed: g.s.handsPlayed,
    };
  }

  // ---- 接続 ----

  connect(userId: string, conn: Conn) {
    const i = this.seatOf(userId);
    if (i >= 0) {
      this.seats[i].conns.add(conn);
    } else {
      let set = this.spectators.get(userId);
      if (!set) this.spectators.set(userId, (set = new Set()));
      set.add(conn);
    }
    conn.send({ type: 'welcome', userId, seat: i, table: this.info(), now: this.deps.now() });
    if (this.state !== 'waiting' && this.game) this.sendSync(i, conn);
    this.broadcastTable();
  }

  disconnect(userId: string, conn: Conn) {
    const i = this.seatOf(userId);
    if (i >= 0) this.seats[i].conns.delete(conn);
    this.spectators.get(userId)?.delete(conn);
    this.broadcastTable();
    // 切断した席が手番を持っていたら、短い時間で自動処理に切り替える
    if (i >= 0 && this.seats[i].conns.size === 0 && this.state === 'playing') {
      const p = this.prompts.get(i);
      if (p) this.armTimeout(i, p, Math.min(p.deadline, this.deps.now() + AFK_MS));
    }
  }

  private sendSync(seat: number, conn: Conn) {
    if (this.round) {
      conn.send({ type: 'sync', view: viewFor(this.round, seat), game: this.gameInfo(), prompt: this.promptFor(seat), now: this.deps.now() });
    } else if (this.lastResult) {
      conn.send({
        type: 'roundEnd', result: this.lastResult, game: this.gameInfo(), final: this.lastSummary,
        nextAt: this.nextAt, now: this.deps.now(),
      });
    }
  }

  private sendTo(seat: number, msg: ServerMsg) {
    for (const c of this.seats[seat].conns) c.send(msg);
  }

  private broadcast(msg: ServerMsg) {
    for (const s of this.seats) for (const c of s.conns) c.send(msg);
    for (const set of this.spectators.values()) for (const c of set) c.send(msg);
  }

  private broadcastTable() {
    this.broadcast({ type: 'table', table: this.info() });
  }

  // ---- メッセージ ----

  onMessage(userId: string, msg: ClientMsg, conn?: Conn) {
    const i = this.seatOf(userId);
    switch (msg.type) {
      case 'ping':
        conn?.send({ type: 'pong', t: msg.t, now: this.deps.now() });
        return;
      case 'ready':
        if (i < 0 || this.state !== 'waiting') return;
        this.seats[i].ready = true;
        this.broadcastTable();
        this.maybeStart();
        return;
      case 'stamp':
        if (i < 0 || typeof msg.id !== 'string' || msg.id.length > 32) return;
        this.broadcast({ type: 'stamp', seat: i, id: msg.id });
        return;
      case 'next':
        if (i < 0 || !this.nextTimer) return;
        this.nextConfirmed.add(i);
        this.maybeNext();
        return;
      case 'action': {
        if (i < 0 || this.state !== 'playing' || !this.round) return;
        const p = this.prompts.get(i);
        if (!p || p.seq !== msg.seq) {
          conn?.send({ type: 'error', code: 'stale', message: '古い操作です' });
          return;
        }
        this.seats[i].afk = false;
        const err = this.applyAction(i, msg.action, false);
        if (err) conn?.send({ type: 'error', code: 'invalid', message: err });
        return;
      }
      default:
        return;
    }
  }

  // ---- 進行 ----

  /** 準備完了を待たずに始める（来ない人がいる卓）。空席があれば始めない。 */
  forceStart() {
    if (this.state !== 'waiting') return;
    if (!this.seats.every((s) => s.userId || s.bot)) return;
    for (const s of this.seats) s.ready = true;
    this.maybeStart();
  }

  private maybeStart() {
    if (this.state !== 'waiting') return;
    if (!this.seats.every((s) => (s.userId || s.bot) && s.ready)) return;
    this.state = 'playing';
    const startDealer = this.opts.fixedDealer ? 0 : Math.floor(this.deps.rand() * this.rules.players);
    this.game = new Game(this.rules, startDealer);
    this.broadcastTable();
    this.runHook(() => this.deps.hooks?.onGameStart?.(this));
    this.beginRound();
  }

  private beginRound() {
    this.nextTimer = null;
    this.nextConfirmed.clear();
    this.lastResult = null;
    this.round = this.game!.startRound(this.deps.rand);
    this.afterChange(this.round.events.slice());
  }

  /** 状態が変わった後: 次の行動者に持ち時間を割り当て、全員にイベントと盤面を送る */
  private afterChange(events: RoundEvent[]) {
    const round = this.round!;
    const actors = round.s.phase === 'end' ? [] : round.actors();
    for (const [seat, p] of this.prompts) {
      if (!actors.includes(seat)) {
        this.deps.clearTimer(p.timer);
        this.prompts.delete(seat);
      }
    }
    for (const seat of actors) if (!this.prompts.has(seat)) this.openPrompt(seat);

    const now = this.deps.now();
    const game = this.gameInfo();
    for (const s of this.seats) {
      if (s.conns.size === 0) continue;
      const msg: ServerMsg = {
        type: 'events', events: events.map((e) => redactEvent(e, s.seat)), view: viewFor(round, s.seat),
        game, prompt: this.promptFor(s.seat), now,
      };
      for (const c of s.conns) c.send(msg);
    }
    if (this.spectators.size) {
      const msg: ServerMsg = { type: 'events', events: events.map((e) => redactEvent(e, -1)), view: viewFor(round, -1), game, prompt: null, now };
      for (const set of this.spectators.values()) for (const c of set) c.send(msg);
    }
    if (round.s.phase === 'end') this.onRoundEnd();
  }

  private promptFor(seat: number): Prompt | null {
    if (seat < 0 || !this.round) return null;
    const p = this.prompts.get(seat);
    const options = this.round.options(seat);
    if (!p || !options) return null;
    return { seq: p.seq, options, deadline: p.deadline, base: p.base, bank: this.seats[seat].bank };
  }

  private openPrompt(seat: number) {
    const s = this.seats[seat];
    const now = this.deps.now();
    const options = this.round!.options(seat)!;
    const seq = ++this.seq;
    let wait: number;
    let base = 0;
    // 立直後のツモ切りしか選べない場面
    const forced = options.kind === 'turn' && options.discard.length === 1 && !options.tsumo && !options.ankan.length && !options.nuki;
    if (s.bot) {
      // ボットは人間らしい間で打つ
      wait = (options.kind === 'claim' ? 300 + this.deps.rand() * 400 : 450 + this.deps.rand() * 550) * BOT_SPEED;
    } else if (s.conns.size === 0) {
      wait = AFK_MS;
    } else if (forced) {
      wait = 900;
    } else {
      // 一度時間切れした席も基本時間は毎回もらえる（追加時間は使い切り）
      base = this.rules.timeBase * 1000;
      wait = base + s.bank;
    }
    const p: ActivePrompt = { seq, deadline: now + wait, startedAt: now, base, timer: null, forced };
    this.prompts.set(seat, p);
    this.armTimeout(seat, p, p.deadline);
  }

  private armTimeout(seat: number, p: ActivePrompt, deadline: number) {
    if (p.timer) this.deps.clearTimer(p.timer);
    p.deadline = deadline;
    const s = this.seats[seat];
    const delay = Math.max(0, deadline - this.deps.now()) + (s.bot ? 0 : GRACE_MS);
    p.timer = this.deps.setTimer(() => {
      if (this.prompts.get(seat) !== p || !this.round) return;
      const a: Action | null = s.bot ? botAction(this.round, seat) : this.round.defaultAction(seat);
      if (!s.bot && !p.forced && s.conns.size > 0) s.afk = true;
      if (a) {
        const err = this.applyAction(seat, a, true);
        if (err) {
          this.deps.log?.(`table ${this.id}: auto action rejected (${err}); falling back`);
          const d = this.round?.defaultAction(seat);
          if (d) this.applyAction(seat, d, true);
        }
      }
    }, delay);
  }

  private applyAction(seat: number, action: Action, auto: boolean): string | null {
    const round = this.round!;
    const p = this.prompts.get(seat);
    const res = round.act(seat, action);
    if (!res.ok) return res.error;
    if (p) {
      this.deps.clearTimer(p.timer);
      this.prompts.delete(seat);
      const s = this.seats[seat];
      if (!s.bot && p.base > 0) {
        const used = this.deps.now() - p.startedAt - p.base;
        if (used > 0) s.bank = Math.max(0, s.bank - used);
        if (auto) s.bank = 0;
      }
    }
    this.afterChange(res.events);
    return null;
  }

  private onRoundEnd() {
    const round = this.round!;
    const game = this.game!;
    const result = round.s.result!;
    const events = round.events.slice();
    for (const p of this.prompts.values()) this.deps.clearTimer(p.timer);
    this.prompts.clear();
    const finished = game.finishRound();
    this.round = null;
    this.lastResult = result;
    this.runHook(() => this.deps.hooks?.onRoundEnd?.(this, result, events));
    const now = this.deps.now();
    this.roundEndedAt = now;
    if (finished) {
      this.state = 'finished';
      this.lastSummary = game.summary();
      this.nextAt = 0;
      this.broadcast({ type: 'roundEnd', result, game: this.gameInfo(), final: this.lastSummary, nextAt: 0, now });
      this.broadcastTable();
      this.runHook(() => this.deps.hooks?.onGameEnd?.(this, this.lastSummary!));
      return;
    }
    this.nextAt = now + ROUND_END_WAIT_MS;
    this.broadcast({ type: 'roundEnd', result, game: this.gameInfo(), final: null, nextAt: this.nextAt, now });
    this.nextTimer = this.deps.setTimer(() => this.beginRound(), ROUND_END_WAIT_MS);
    this.maybeNext();
  }

  /** 接続中の人間が全員「次へ」を押したら、待たずに次局へ */
  private maybeNext() {
    if (!this.nextTimer) return;
    const humans = this.seats.filter((s) => !s.bot && s.conns.size > 0);
    if (humans.length > 0 && !humans.every((s) => this.nextConfirmed.has(s.seat))) return;
    const wait = Math.max(0, this.roundEndedAt + (humans.length ? 0 : ROUND_END_MIN_MS) - this.deps.now());
    this.deps.clearTimer(this.nextTimer);
    this.nextTimer = this.deps.setTimer(() => this.beginRound(), wait);
  }

  private runHook(fn: () => void | Promise<void> | undefined) {
    try {
      const r = fn();
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch((e) => this.deps.log?.(`table ${this.id}: hook failed: ${e}`));
      }
    } catch (e) {
      this.deps.log?.(`table ${this.id}: hook failed: ${e}`);
    }
  }

  /** 対局を破棄する（サーバー停止時など） */
  dispose() {
    for (const p of this.prompts.values()) this.deps.clearTimer(p.timer);
    this.prompts.clear();
    if (this.nextTimer) this.deps.clearTimer(this.nextTimer);
    this.nextTimer = null;
  }
}

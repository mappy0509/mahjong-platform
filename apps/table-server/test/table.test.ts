import { describe, expect, it } from 'vitest';
import { botAction, defaultRules, seededRandom, type ClientMsg, type Prompt, type ServerMsg } from '@mj/core';
import { Table, type Conn } from '../src/table.ts';

/** 仮想時計。タイマーを時刻順に実行する。 */
class Clock {
  t = 0;
  private q: { at: number; fn: () => void; id: number; dead?: boolean }[] = [];
  private id = 0;
  now = () => this.t;
  setTimer = (fn: () => void, ms: number) => {
    const e = { at: this.t + Math.max(0, ms), fn, id: ++this.id };
    this.q.push(e);
    return e;
  };
  clearTimer = (h: unknown) => { if (h) (h as { dead?: boolean }).dead = true; };
  /** 次のタイマーを1つ実行。無ければ false */
  step(): boolean {
    this.q = this.q.filter((e) => !e.dead);
    if (!this.q.length) return false;
    this.q.sort((a, b) => a.at - b.at || a.id - b.id);
    const e = this.q.shift()!;
    this.t = Math.max(this.t, e.at);
    e.fn();
    return true;
  }
}

/** 人間役のクライアント。届いた prompt に対して、乱数で遅延・切断・不正送信を混ぜる。 */
class Human implements Conn {
  prompt: Prompt | null = null;
  seat = -1;
  received: ServerMsg[] = [];
  finalSeen = false;
  connected = true;
  errors: string[] = [];
  constructor(public id: string, private table: Table, private clock: Clock, private rand: () => number, private chaos: boolean) {}
  send(msg: ServerMsg) {
    this.received.push(msg);
    if (msg.type === 'welcome') this.seat = msg.seat;
    if (msg.type === 'error') this.errors.push(msg.code);
    if (msg.type === 'events' || msg.type === 'sync') {
      // 自分の手牌以外が見えていないこと
      for (const p of msg.view.players) if (p.seat !== this.seat && (p.hand !== undefined || p.drawn !== undefined)) throw new Error('leak: other hand visible');
      if (msg.type === 'events') for (const e of msg.events) {
        if (e.t === 'draw' && e.seat !== this.seat && e.tile !== null) throw new Error('leak: other draw visible');
        if (e.t === 'start' && e.hands.some((h, i) => i !== this.seat && h !== null)) throw new Error('leak: other start hand visible');
      }
      this.prompt = msg.prompt;
      if (msg.prompt) this.schedule(msg.prompt);
    }
    if (msg.type === 'roundEnd') {
      this.prompt = null;
      if (msg.final) this.finalSeen = true;
      else this.clock.setTimer(() => this.say({ type: 'next' }), 500 + this.rand() * 2000);
    }
  }
  say(msg: ClientMsg) { if (this.connected) this.table.onMessage(this.id, msg, this); }
  private schedule(p: Prompt) {
    const r = this.rand();
    if (this.chaos && r < 0.03) return; // 放置（時間切れに任せる）
    if (this.chaos && r < 0.05) { // 切断して少し後に戻る
      this.connected = false;
      this.table.disconnect(this.id, this);
      this.clock.setTimer(() => { this.connected = true; this.table.connect(this.id, this); }, 500 + this.rand() * 6000);
      return;
    }
    this.clock.setTimer(() => {
      if (this.prompt !== p || !this.table.round) return;
      if (this.chaos && this.rand() < 0.05) this.say({ type: 'action', seq: p.seq - 1, action: { type: 'pass' } }); // 古い番号
      if (this.chaos && this.rand() < 0.05) this.say({ type: 'action', seq: p.seq, action: { type: 'discard', tile: 999 } }); // 不正
      const a = botAction(this.table.round, this.seat);
      if (a) {
        this.say({ type: 'action', seq: p.seq, action: a });
        if (this.chaos && this.rand() < 0.1) this.say({ type: 'action', seq: p.seq, action: a }); // 二重送信
      }
    }, 100 + this.rand() * (this.chaos ? 4000 : 800));
  }
}

function run(seed: number, players: 3 | 4, humans: number, chaos: boolean) {
  const clock = new Clock();
  const rand = seededRandom(seed);
  let gameEnd = 0;
  let rounds = 0;
  const table = new Table('t', defaultRules(players, 'east'), {
    ...clock, rand,
    hooks: { onGameEnd: () => { gameEnd++; }, onRoundEnd: () => { rounds++; } },
  });
  const hs: Human[] = [];
  for (let i = 0; i < humans; i++) {
    const h = new Human(`u${i}`, table, clock, seededRandom(seed * 31 + i), chaos);
    table.sit(h.id, `人間${i}`);
    table.connect(h.id, h);
    hs.push(h);
  }
  for (const h of hs) h.say({ type: 'ready' });
  table.fillBots();
  let steps = 0;
  while (table.state !== 'finished') {
    if (!clock.step()) throw new Error(`stalled at t=${clock.t} state=${table.state}`);
    if (++steps > 200000) throw new Error('too many steps');
    const r = table.round;
    if (r) {
      const sum = r.s.scores.reduce((a, b) => a + b, 0) + r.s.kyotaku * 1000;
      if (sum !== table.rules.startPoints * players) throw new Error('score sum broken');
    }
  }
  return { table, hs, gameEnd, rounds, clock };
}

describe('対局サーバー', () => {
  it('ボットだけで東風戦が完走する', () => {
    const { gameEnd, rounds, table } = run(1, 4, 0, false);
    expect(gameEnd).toBe(1);
    expect(rounds).toBeGreaterThanOrEqual(4);
    expect(table.state).toBe('finished');
  });

  it('人間4人（素直な操作）で完走し、他家の手牌は一度も届かない', () => {
    for (let seed = 10; seed < 16; seed++) {
      const { hs, gameEnd } = run(seed, 4, 4, false);
      expect(gameEnd).toBe(1);
      for (const h of hs) { expect(h.finalSeen).toBe(true); expect(h.errors).toEqual([]); }
    }
  }, 60000);

  it('放置・切断・再接続・二重送信・古い番号・不正な牌を混ぜても、止まらず完走する', () => {
    for (let seed = 100; seed < 130; seed++) {
      const { gameEnd, table } = run(seed, seed % 3 === 0 ? 3 : 4, 2 + (seed % 3), true);
      expect(gameEnd).toBe(1);
      expect(table.state).toBe('finished');
    }
  }, 180000);

  it('時間切れは基本時間＋追加時間で発動し、ツモ切りになる', () => {
    const clock = new Clock();
    const table = new Table('t', defaultRules(4, 'east'), { ...clock, rand: seededRandom(5) });
    const msgs: ServerMsg[] = [];
    const conn: Conn = { send: (m) => msgs.push(m) };
    table.sit('u', 'あ');
    table.connect('u', conn);
    table.onMessage('u', { type: 'ready' }, conn);
    table.fillBots();
    // 自分の番が来るまで進める
    const myPrompt = () => {
      const last = [...msgs].reverse().find((m) => m.type === 'events' || m.type === 'sync');
      return last && (last.type === 'events' || last.type === 'sync') ? last.prompt : null;
    };
    let guard = 0;
    while (!(myPrompt()?.options.kind === 'turn')) { if (!clock.step() || ++guard > 5000) throw new Error('no prompt'); }
    const p = myPrompt()!;
    const rules = table.rules;
    expect(p.deadline - clock.t).toBe((rules.timeBase + rules.timeBank) * 1000);
    const seat = table.seatOf('u');
    const before = table.round!.s.players[seat].river.length;
    while (table.round && table.round.s.players[seat].river.length === before) { if (!clock.step()) throw new Error('stalled'); }
    expect(clock.t).toBeGreaterThanOrEqual(p.deadline);
    expect(table.round!.s.players[seat].river[before].tsumogiri).toBe(true);
    expect(table.seats[seat].bank).toBe(0);
    expect(table.seats[seat].afk).toBe(true);
  });
});

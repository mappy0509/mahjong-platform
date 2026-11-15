import { create } from 'zustand';
import type {
  Action, ClientMsg, GameInfo, GameSummary, Prompt, RoundEvent, RoundResult, RoundView, ServerMsg, TableInfo, Tile,
  WinDetail,
} from '@mj/core';
import { sound } from '@/lib/sound';
import { applyEvent, viewFromStart } from './reduce';
import type { TableScene } from './TableScene';

// ---------------------------------------------------------------------------
// 演出の合図（HUD側の FxLayer が受け取る）
// ---------------------------------------------------------------------------

export type Fx =
  | { type: 'callout'; kind: 'pon' | 'chi' | 'kan' | 'riichi' | 'nuki'; rel: number; x: number; y: number; text: string }
  | { type: 'strike'; kind: 'ron' | 'tsumo'; rel: number; tier: number; x: number; y: number }
  | { type: 'dealin' }
  | { type: 'banner'; text: string; sub?: string }
  | { type: 'dora' }
  | { type: 'stamp'; rel: number; id: string };

type FxListener = (e: Fx) => void;
const listeners = new Set<FxListener>();
export const fx = {
  on(cb: FxListener) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  emit(e: Fx) { for (const cb of listeners) cb(e); },
};

/** 和了の格（演出の強さ）: 0=満貫未満 1=満貫 2=跳満 3=倍満 4=三倍満 5=役満 */
export function tierOf(w: WinDetail): number {
  const r = w.result;
  if (r.yakuman > 0) return 5;
  if (r.base >= 6000) return 4;
  if (r.base >= 4000) return 3;
  if (r.base >= 3000) return 2;
  if (r.base >= 2000) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// 画面が読む状態
// ---------------------------------------------------------------------------

export interface RoundEndInfo {
  result: RoundResult;
  game: GameInfo;
  final: GameSummary | null;
  nextAt: number;
  /** 流局のときの理由と聴牌 */
  draw?: { reason: string; tenpai: boolean[] };
  before: number[];
}

interface State {
  status: 'idle' | 'connecting' | 'open' | 'closed';
  error: string | null;
  tableId: string;
  userId: string;
  seat: number;
  table: TableInfo | null;
  view: RoundView | null;
  game: GameInfo | null;
  prompt: Prompt | null;
  /** サーバー時計 − 手元の時計（ms） */
  offset: number;
  selected: Tile | null;
  hovered: Tile | null;
  riichiMode: boolean;
  winShow: { wins: WinDetail[]; index: number } | null;
  roundEnd: RoundEndInfo | null;
  final: GameSummary | null;
  autoWin: boolean;
  noCall: boolean;
  volume: number;
  set(p: Partial<State>): void;
}

export const useGame = create<State>((set) => ({
  status: 'idle', error: null, tableId: '', userId: '', seat: -1, table: null, view: null, game: null, prompt: null,
  offset: 0, selected: null, hovered: null, riichiMode: false, winShow: null, roundEnd: null, final: null,
  autoWin: false, noCall: false, volume: 0.7,
  set: (p) => set(p),
}));

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DRAW_REASON: Record<string, string> = {
  exhaustive: '流局', kyuushu: '九種九牌', suufon: '四風連打', suucha: '四家立直', suukan: '四槓散了', sanchahou: '三家和',
};

// ---------------------------------------------------------------------------
// 進行役: 受信した出来事を順番に再生する
// ---------------------------------------------------------------------------

export class GameController {
  private ws: WebSocket | null = null;
  private queue: ServerMsg[] = [];
  private running = false;
  private scene: TableScene | null = null;
  private display: RoundView | null = null;
  private closed = false;
  private retry = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private winResolve: (() => void) | null = null;
  private scoresBefore: number[] = [];
  private lastDraw: { reason: string; tenpai: boolean[] } | undefined;

  constructor(private url: string, private tableId: string, private token: string, private name: string) {
    useGame.getState().set({ tableId, status: 'connecting', error: null, view: null, prompt: null, roundEnd: null, final: null, winShow: null, table: null, seat: -1 });
    this.open();
  }

  attach(scene: TableScene) {
    this.scene = scene;
    const v = useGame.getState().view;
    if (v) scene.setView(v, useGame.getState().seat, false);
    this.refreshSelectable();
  }

  private open() {
    if (this.closed) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      useGame.getState().set({ status: 'open', error: null });
      this.send({ type: 'hello', tableId: this.tableId, token: this.token, name: this.name });
      this.pingTimer = setInterval(() => this.send({ type: 'ping', t: Date.now() }), 5000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      // 時計のずれは届いた瞬間に測る（再生待ちの間に古くなるため）
      if ('now' in msg && typeof msg.now === 'number' && msg.type !== 'pong') useGame.getState().set({ offset: msg.now - Date.now() });
      this.queue.push(msg);
      void this.pump();
    };
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.closed) return;
      useGame.getState().set({ status: 'closed' });
      // 自動で再接続（盤面はサーバーが丸ごと送り直す）
      const wait = Math.min(5000, 500 * Math.pow(1.6, this.retry++));
      setTimeout(() => this.open(), wait);
    };
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  dispose() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.winResolve?.();
  }

  // ---- 操作 ----

  act(action: Action) {
    const st = useGame.getState();
    if (!st.prompt) return;
    this.send({ type: 'action', seq: st.prompt.seq, action });
    st.set({ prompt: null, selected: null, riichiMode: false });
    this.scene?.setSelected(null);
    this.scene?.setSelectable(null);
  }

  ready() { this.send({ type: 'ready' }); }
  next() { this.send({ type: 'next' }); useGame.getState().set({ roundEnd: null }); }
  stamp(id: string) { this.send({ type: 'stamp', id }); }
  closeWinShow() { this.winResolve?.(); }

  /** 手牌の牌を押した */
  tapTile(tile: Tile, touch: boolean) {
    const st = useGame.getState();
    const o = st.prompt?.options;
    if (!o || o.kind !== 'turn') return;
    sound.unlock();
    if (st.riichiMode) {
      if (o.riichi.includes(tile)) this.act({ type: 'discard', tile, riichi: true });
      return;
    }
    if (!o.discard.includes(tile)) return;
    if (touch && st.selected !== tile) {
      st.set({ selected: tile });
      this.scene?.setSelected(tile);
      sound.play('select');
      return;
    }
    this.act({ type: 'discard', tile });
  }

  setRiichiMode(on: boolean) {
    useGame.getState().set({ riichiMode: on, selected: null });
    this.scene?.setSelected(null);
    this.refreshSelectable();
  }

  refreshSelectable() {
    const st = useGame.getState();
    const o = st.prompt?.options;
    if (!this.scene) return;
    if (!o || o.kind !== 'turn') { this.scene.setSelectable(null); return; }
    if (st.riichiMode) this.scene.setSelectable(o.riichi, true);
    else this.scene.setSelectable(o.discard, o.discard.length < (st.view?.players[st.seat]?.handCount ?? 0));
  }

  // ---- 再生 ----

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const msg = this.queue.shift()!;
        await this.handle(msg);
      }
    } finally {
      this.running = false;
    }
  }

  private setPrompt(prompt: Prompt | null) {
    const st = useGame.getState();
    // 後ろにまだ出来事が溜まっているなら、古い選択肢は出さない
    const stale = this.queue.some((m) => m.type === 'events' || m.type === 'sync' || m.type === 'roundEnd');
    const p = stale ? null : prompt;
    // 自動設定: 鳴きなし／自動和了
    if (p) {
      const o = p.options;
      if (o.kind === 'claim') {
        if (o.ron && st.autoWin) { st.set({ prompt: p }); this.act({ type: 'ron' }); return; }
        if (!o.ron && st.noCall) { st.set({ prompt: p }); this.act({ type: 'pass' }); return; }
      } else if (o.tsumo && st.autoWin) { st.set({ prompt: p }); this.act({ type: 'tsumo' }); return; }
      // 立直後で、ツモ切りしか選べないときは自動で切る
      if (o.kind === 'turn' && o.discard.length === 1 && !o.tsumo && !o.ankan.length && !o.nuki && (st.view?.players[st.seat]?.riichi ?? 0) > 0) {
        st.set({ prompt: null });
        const tile = o.discard[0];
        setTimeout(() => { this.send({ type: 'action', seq: p.seq, action: { type: 'discard', tile } }); }, 380);
        return;
      }
    }
    st.set({ prompt: p, selected: null, riichiMode: false });
    this.scene?.setSelected(null);
    this.refreshSelectable();
    if (p && p.options.kind === 'turn') sound.play('turn');
  }

  private async handle(msg: ServerMsg) {
    const st = useGame.getState();
    switch (msg.type) {
      case 'welcome':
        st.set({ userId: msg.userId, seat: msg.seat, table: msg.table });
        if (msg.table.state === 'waiting' && msg.seat >= 0) this.ready();
        return;
      case 'table':
        st.set({ table: msg.table });
        return;
      case 'pong':
        st.set({ offset: msg.now - Date.now() + (Date.now() - msg.t) / 2 });
        return;
      case 'error':
        if (msg.code !== 'stale' && msg.code !== 'invalid') st.set({ error: msg.message });
        return;
      case 'stamp':
        fx.emit({ type: 'stamp', rel: this.scene?.rel(msg.seat) ?? 0, id: msg.id });
        return;
      case 'sync': {
        this.display = msg.view;
        this.scene?.setReveal(null);
        this.scene?.setView(msg.view, st.seat, false);
        st.set({ view: msg.view, game: msg.game, roundEnd: null, winShow: null });
        this.scoresBefore = msg.game.scores.slice();
        this.setPrompt(msg.prompt);
        return;
      }
      case 'events': {
        st.set({ game: msg.game });
        // 溜まりすぎたら演出を省いて追いつく
        const fast = this.queue.filter((m) => m.type === 'events').length > 4;
        for (const e of msg.events) await this.playEvent(e, fast);
        this.display = msg.view;
        if (msg.view.phase !== 'end') this.scene?.setView(msg.view, useGame.getState().seat, true);
        useGame.getState().set({ view: msg.view });
        this.setPrompt(msg.prompt);
        return;
      }
      case 'roundEnd': {
        useGame.getState().set({
          game: msg.game, prompt: null,
          roundEnd: { result: msg.result, game: msg.game, final: msg.final, nextAt: msg.nextAt, draw: this.lastDraw, before: this.scoresBefore },
          final: msg.final,
        });
        this.lastDraw = undefined;
        if (msg.final) sound.play('end');
        return;
      }
    }
  }

  private async playEvent(e: RoundEvent, fast: boolean) {
    const st = useGame.getState();
    const seat = st.seat;
    const scene = this.scene;
    if (e.t === 'start') {
      const n = st.table?.rules.players ?? e.hands.length;
      this.display = viewFromStart(e, seat, n);
      this.scoresBefore = e.scores.slice();
      st.set({ view: this.display, roundEnd: null, winShow: null, prompt: null });
      scene?.setReveal(null);
      // いったん何も無い卓にしてから配る
      scene?.setView({ ...this.display, players: this.display.players.map((p) => ({ ...p, handCount: 0, hand: p.hand ? [] : undefined })) }, seat, false);
      const names = ['東', '南', '西', '北'];
      const nums = ['一', '二', '三', '四'];
      fx.emit({ type: 'banner', text: `${names[e.roundWind]}${nums[e.kyoku]}局`, sub: e.honba ? `${e.honba} 本場` : undefined });
      sound.play('start');
      if (!fast) await sleep(700);
      scene?.setView(this.display, seat, true, 26);
      sound.play('deal');
      if (!fast) await sleep(900);
      return;
    }
    if (!this.display) return;
    const before = this.display;
    this.display = applyEvent(before, e, seat);
    const show = () => { scene?.setView(this.display!, seat, !fast); useGame.getState().set({ view: this.display }); };
    switch (e.t) {
      case 'draw':
        show();
        if (e.seat === seat) sound.play('draw');
        if (!fast) await sleep(e.seat === seat ? 150 : 110);
        return;
      case 'discard':
        show();
        sound.play('discard');
        if (!fast) await sleep(270);
        return;
      case 'riichi': {
        const p = scene?.screenPosOfSeat(e.seat) ?? { x: 0, y: 0 };
        fx.emit({ type: 'callout', kind: 'riichi', rel: scene?.rel(e.seat) ?? 0, x: p.x, y: p.y, text: e.double ? 'ダブル立直' : '立直' });
        sound.play('riichi');
        if (!fast) await sleep(750);
        return;
      }
      case 'riichiAccepted':
        show();
        return;
      case 'call': {
        show();
        const p = scene?.screenPosOfSeat(e.seat) ?? { x: 0, y: 0 };
        const kind = e.meld.type === 'chi' ? 'chi' : e.meld.type === 'pon' ? 'pon' : 'kan';
        fx.emit({ type: 'callout', kind, rel: scene?.rel(e.seat) ?? 0, x: p.x, y: p.y, text: kind === 'chi' ? 'チー' : kind === 'pon' ? 'ポン' : 'カン' });
        sound.play(kind === 'kan' ? 'kan' : 'call');
        if (!fast) await sleep(620);
        return;
      }
      case 'kan': {
        show();
        const p = scene?.screenPosOfSeat(e.seat) ?? { x: 0, y: 0 };
        fx.emit({ type: 'callout', kind: 'kan', rel: scene?.rel(e.seat) ?? 0, x: p.x, y: p.y, text: 'カン' });
        sound.play('kan');
        if (!fast) await sleep(680);
        return;
      }
      case 'nuki': {
        show();
        const p = scene?.screenPosOfSeat(e.seat) ?? { x: 0, y: 0 };
        fx.emit({ type: 'callout', kind: 'nuki', rel: scene?.rel(e.seat) ?? 0, x: p.x, y: p.y, text: '北' });
        sound.play('call');
        if (!fast) await sleep(480);
        return;
      }
      case 'dora':
        show();
        fx.emit({ type: 'dora' });
        sound.play('dora');
        if (!fast) await sleep(420);
        return;
      case 'agari': {
        useGame.getState().set({ prompt: null });
        scene?.setSelectable(null);
        for (let i = 0; i < e.wins.length; i++) {
          const w = e.wins[i];
          const tier = tierOf(w);
          const kind = w.from === null ? 'tsumo' : 'ron';
          const pos = (w.from !== null ? scene?.screenPosOfTile(w.winTile) : null) ?? scene?.screenPosOfSeat(w.seat) ?? { x: 0, y: 0 };
          fx.emit({ type: 'strike', kind, rel: scene?.rel(w.seat) ?? 0, tier, x: pos.x, y: pos.y });
          sound.play(kind);
          scene?.impact(0.6 + tier * 0.35);
          if (w.from === seat) { fx.emit({ type: 'dealin' }); sound.play('dealin'); }
          await sleep(650);
          // 手牌を開く（和了牌は手牌の右に離して置くため、いったん抜く）
          const concealed = w.hand.filter((t) => t !== w.winTile);
          scene?.setReveal(w.seat, [...concealed, w.winTile]);
          if (this.display) {
            // ツモ牌・自分の手牌の表示を公開用に切り替える
            const d: RoundView = structuredClone(this.display);
            const pv = d.players[w.seat];
            pv.hasDrawn = false; pv.hand = undefined; pv.drawn = undefined; pv.handCount = concealed.length + 1;
            this.display = d;
            scene?.setView(d, seat, true);
          }
          await sleep(900 + tier * 260);
          if (tier >= 5) sound.play('yakuman');
          else if (tier >= 3) sound.play('winBig');
          else sound.play('win', { tier });
          if (tier >= 2) scene?.impact(0.5 + tier * 0.3);
          useGame.getState().set({ winShow: { wins: e.wins, index: i } });
          await new Promise<void>((resolve) => { this.winResolve = resolve; });
          this.winResolve = null;
          useGame.getState().set({ winShow: null });
        }
        return;
      }
      case 'ryuukyoku': {
        useGame.getState().set({ prompt: null });
        scene?.setSelectable(null);
        this.lastDraw = { reason: DRAW_REASON[e.reason] ?? '流局', tenpai: e.tenpai };
        fx.emit({ type: 'banner', text: DRAW_REASON[e.reason] ?? '流局', sub: e.nagashi.length ? '流し満貫' : undefined });
        sound.play('ryuukyoku');
        e.hands.forEach((h, i) => { if (h && i !== seat) scene?.setReveal(i, h); });
        if (this.display) scene?.setView(this.display, seat, true);
        await sleep(1900);
        return;
      }
    }
  }
}

'use client';
import { useEffect, useMemo, useState } from 'react';
import { countsOf, doraFromIndicator, waitsOf, type Action, type ClaimOptions, type Tile, type TurnOptions } from '@mj/core';
import { useGame, type GameController } from '@/game/client';
import { sound } from '@/lib/sound';
import { TileImg, tileOfKind } from './TileImg';

const WINDS = ['東', '南', '西', '北'];
const NUMS = ['一', '二', '三', '四'];
const STAMPS = ['よろしく！', 'ナイス！', 'うーん…', 'ぐぬぬ', 'それだ！', 'ありがとう'];

/** 相対位置（0=自分 1=右 2=対面 3=左） */
function relOf(seat: number, my: number, n: number): number {
  const d = (seat - Math.max(0, my) + n) % n;
  return n === 3 ? [0, 1, 3][d] : d;
}

// ---------------------------------------------------------------------------
// 左上: 局・ドラ・残り
// ---------------------------------------------------------------------------
export function InfoPanel() {
  const view = useGame((s) => s.view);
  if (!view) return null;
  const sanma = view.n === 3;
  return (
    <div className="pointer-events-none absolute left-[max(10px,env(safe-area-inset-left))] top-[max(8px,env(safe-area-inset-top))] z-20 rounded-xl border border-gold/40 bg-ink/80 px-[1.4vh] py-[1vh] shadow-[0_8px_30px_rgba(0,0,0,.6)] backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[clamp(15px,3.6vh,28px)] font-extrabold tracking-widest text-gold2">{WINDS[view.roundWind]}{NUMS[view.kyoku]}局</span>
        <span className="text-[clamp(10px,2vh,14px)] text-slate-300">{view.honba}本場</span>
        <span className="text-[clamp(10px,2vh,14px)] text-slate-300">供託 {view.kyotaku}</span>
      </div>
      <div className="mt-[.6vh] flex items-center gap-2">
        <span className="text-[clamp(9px,1.8vh,12px)] tracking-widest text-slate-400">ドラ</span>
        <span className="flex gap-[2px]">
          {Array.from({ length: 5 }, (_, i) => (view.dora[i] !== undefined
            ? <span key={i} title={`ドラ: ${doraFromIndicator(view.dora[i] >> 2, sanma)}`}><TileImg tile={view.dora[i]} w={clampW(3.4)} /></span>
            : <TileImg key={i} back w={clampW(3.4)} />))}
        </span>
        <span className="tabular ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[clamp(10px,2vh,14px)] text-slate-200">残 {view.left}</span>
      </div>
    </div>
  );
}

function clampW(vh: number): number {
  if (typeof window === 'undefined') return 24;
  return Math.max(16, Math.min(34, Math.round((window.innerHeight * vh) / 100)));
}

// ---------------------------------------------------------------------------
// 名札
// ---------------------------------------------------------------------------
export function Plates() {
  const view = useGame((s) => s.view);
  const table = useGame((s) => s.table);
  const my = useGame((s) => s.seat);
  if (!view || !table) return null;
  const pos: Record<number, string> = {
    0: 'left-[max(12px,env(safe-area-inset-left))] bottom-[25%]',
    1: 'right-[max(12px,env(safe-area-inset-right))] top-[42%]',
    2: 'left-[24%] top-[max(8px,env(safe-area-inset-top))]',
    3: 'left-[max(12px,env(safe-area-inset-left))] top-[30%]',
  };
  return (
    <>
      {view.players.map((p) => {
        const rel = relOf(p.seat, my, view.n);
        const info = table.seats[p.seat];
        const active = view.phase !== 'end' && view.turn === p.seat;
        const dealer = p.seat === view.dealer;
        return (
          <div key={p.seat} className={`pointer-events-none absolute z-20 ${pos[rel]}`}>
            <div className={`flex items-center gap-2 rounded-full border bg-ink/85 py-[.5vh] pl-[.5vh] pr-[1.6vh] shadow-[0_6px_22px_rgba(0,0,0,.6)] backdrop-blur transition-all ${active ? 'border-gold shadow-[0_0_22px_rgba(231,194,106,.65)]' : 'border-white/15'}`}>
              <span className={`font-display flex h-[clamp(24px,5.4vh,40px)] w-[clamp(24px,5.4vh,40px)] items-center justify-center rounded-full text-[clamp(13px,3vh,22px)] font-extrabold ${dealer ? 'bg-ruby text-white' : 'bg-panel2 text-slate-200'}`}>{WINDS[p.wind - 27]}</span>
              <span className="min-w-0">
                <span className="block max-w-[14vw] truncate text-[clamp(10px,2.1vh,15px)] font-bold leading-tight">{info?.name || `席${p.seat + 1}`}{info && !info.connected && <span className="ml-1 text-ruby">切断</span>}</span>
                <span className={`tabular block text-[clamp(12px,2.7vh,20px)] font-black leading-tight ${active ? 'text-gold2' : 'text-white'}`}>{p.score.toLocaleString('ja-JP')}</span>
              </span>
              {p.riichi > 0 && <span className="ml-1 rounded bg-sky/25 px-1.5 py-0.5 text-[clamp(9px,1.8vh,12px)] font-black text-sky">立直</span>}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// 持ち時間
// ---------------------------------------------------------------------------
function useRemaining(): { sec: number; inBank: boolean; frac: number } | null {
  const prompt = useGame((s) => s.prompt);
  const offset = useGame((s) => s.offset);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!prompt) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [prompt]);
  if (!prompt) return null;
  const left = Math.max(0, prompt.deadline - (now + offset));
  const total = Math.max(1, prompt.base + prompt.bank);
  const inBank = left <= prompt.bank && prompt.bank > 0 && prompt.base > 0;
  const sec = Math.ceil((inBank || prompt.base === 0 ? left : left - prompt.bank) / 1000);
  return { sec, inBank, frac: Math.min(1, left / total) };
}

// ---------------------------------------------------------------------------
// 操作ボタン
// ---------------------------------------------------------------------------
type Btn = { key: string; label: string; cls: string; onClick: () => void };

const BTN: Record<string, string> = {
  win: 'from-[#ffe9a6] via-[#ffc93d] to-[#e08a12] text-[#3a1d00] shadow-[0_5px_0_#8a4b00,0_0_30px_rgba(255,200,60,.75)]',
  ron: 'from-[#ff9aa8] via-[#f0344e] to-[#a80d2a] text-white shadow-[0_5px_0_#5e0616,0_0_30px_rgba(240,52,78,.75)]',
  riichi: 'from-[#bfe6ff] via-[#4aaeff] to-[#1b5fc4] text-white shadow-[0_5px_0_#0e3478,0_0_26px_rgba(74,174,255,.7)]',
  call: 'from-[#9ff3d2] via-[#2fbf9b] to-[#0d7a5c] text-white shadow-[0_5px_0_#07483a,0_0_22px_rgba(47,191,155,.6)]',
  kan: 'from-[#e2c4ff] via-[#a25cf5] to-[#5c1fb5] text-white shadow-[0_5px_0_#34107a,0_0_22px_rgba(162,92,245,.6)]',
  pass: 'from-[#56636f] via-[#3a4651] to-[#252e36] text-slate-100 shadow-[0_5px_0_#151b20]',
};

export function ActionBar({ ctl }: { ctl: GameController }) {
  const prompt = useGame((s) => s.prompt);
  const riichiMode = useGame((s) => s.riichiMode);
  const [choice, setChoice] = useState<{ label: string; items: { tiles: Tile[]; action: Action }[]; called?: Tile } | null>(null);
  const rem = useRemaining();
  useEffect(() => { setChoice(null); }, [prompt?.seq]);
  useEffect(() => {
    if (rem && rem.sec <= 5 && rem.sec > 0 && prompt && prompt.base > 0) sound.play('tick');
  }, [rem?.sec]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!prompt) return null;
  const o = prompt.options;
  const btns: Btn[] = [];
  const go = (a: Action) => { sound.unlock(); sound.play('click'); ctl.act(a); };

  if (o.kind === 'turn') {
    const t = o as TurnOptions;
    if (t.tsumo) btns.push({ key: 'tsumo', label: 'ツモ', cls: BTN.win, onClick: () => go({ type: 'tsumo' }) });
    if (t.riichi.length) btns.push({ key: 'riichi', label: riichiMode ? 'やめる' : 'リーチ', cls: riichiMode ? BTN.pass : BTN.riichi, onClick: () => { sound.play('click'); ctl.setRiichiMode(!riichiMode); } });
    if (t.ankan.length + t.kakan.length > 0) {
      const items = [
        ...t.ankan.map((k) => ({ tiles: [0, 1, 2, 3].map((i) => k * 4 + i), action: { type: 'ankan', kind: k } as Action })),
        ...t.kakan.map((tile) => ({ tiles: [tile], action: { type: 'kakan', tile } as Action })),
      ];
      btns.push({ key: 'kan', label: 'カン', cls: BTN.kan, onClick: () => (items.length === 1 ? go(items[0].action) : setChoice({ label: 'どの牌でカンしますか', items })) });
    }
    if (t.nuki) btns.push({ key: 'nuki', label: '北', cls: BTN.call, onClick: () => go({ type: 'nuki' }) });
    if (t.kyuushu) btns.push({ key: 'kyuushu', label: '九種九牌', cls: BTN.pass, onClick: () => go({ type: 'kyuushu' }) });
  } else {
    const c = o as ClaimOptions;
    if (c.ron) btns.push({ key: 'ron', label: 'ロン', cls: BTN.ron, onClick: () => go({ type: 'ron' }) });
    if (c.kan) btns.push({ key: 'kan', label: 'カン', cls: BTN.kan, onClick: () => go({ type: 'minkan' }) });
    if (c.pon.length) {
      const items = c.pon.map((tiles) => ({ tiles, action: { type: 'pon', tiles } as Action }));
      btns.push({ key: 'pon', label: 'ポン', cls: BTN.call, onClick: () => (items.length === 1 ? go(items[0].action) : setChoice({ label: 'どの牌でポンしますか', items, called: c.tile })) });
    }
    if (c.chi.length) {
      const items = c.chi.map((tiles) => ({ tiles, action: { type: 'chi', tiles } as Action }));
      btns.push({ key: 'chi', label: 'チー', cls: BTN.call, onClick: () => (items.length === 1 ? go(items[0].action) : setChoice({ label: 'どの形でチーしますか', items, called: c.tile })) });
    }
    btns.push({ key: 'pass', label: 'パス', cls: BTN.pass, onClick: () => go({ type: 'pass' }) });
  }

  const warn = rem !== null && (rem.inBank || rem.sec <= 3);
  return (
    <div className="absolute bottom-[23%] right-[max(14px,env(safe-area-inset-right))] z-30 flex flex-col items-end gap-[1.2vh]">
      {choice && (
        <div className="rounded-xl border border-gold/50 bg-ink/95 p-[1.2vh] shadow-[0_10px_40px_rgba(0,0,0,.8)]" style={{ animation: 'rs-in .18s ease-out both' }}>
          <div className="mb-[.8vh] text-[clamp(10px,2vh,14px)] text-slate-300">{choice.label}</div>
          <div className="flex gap-[1.2vh]">
            {choice.items.map((it, i) => (
              <button key={i} onClick={() => go(it.action)} className="flex items-end gap-px rounded-lg border border-white/15 bg-white/5 p-[.9vh] transition hover:border-gold hover:bg-gold/15 active:scale-95">
                {[...it.tiles, ...(choice.called !== undefined ? [choice.called] : [])].sort((a, b) => a - b).map((t) => <TileImg key={t} tile={t} w={clampW(4.6)} glow={t === choice.called} />)}
              </button>
            ))}
            <button onClick={() => setChoice(null)} className="rounded-lg border border-white/15 px-[1.4vh] text-[clamp(11px,2.2vh,15px)] text-slate-300 hover:bg-white/10">戻る</button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-[1.2vh]">
        {rem !== null && prompt.base + prompt.bank > 0 && (
          <div className={`tabular flex h-[clamp(34px,7.6vh,56px)] min-w-[clamp(34px,7.6vh,56px)] items-center justify-center rounded-full border-2 px-2 text-[clamp(14px,3.4vh,24px)] font-black ${warn ? 'border-ruby bg-ruby/25 text-white' : 'border-gold/70 bg-ink/85 text-gold2'}`} style={warn ? { animation: 'rs-pulse .6s infinite' } : undefined}>
            {rem.inBank ? `+${rem.sec}` : rem.sec}
          </div>
        )}
        {btns.map((b) => (
          <button key={b.key} onClick={b.onClick}
            className={`font-display rounded-2xl bg-gradient-to-b px-[clamp(14px,3.4vh,30px)] py-[clamp(7px,1.7vh,14px)] text-[clamp(17px,4.4vh,34px)] font-extrabold tracking-[.12em] transition active:translate-y-[3px] active:brightness-90 ${b.cls}`}
            style={{ animation: 'rs-in .16s ease-out both' }}>
            {b.label}
          </button>
        ))}
      </div>
      {o.kind === 'turn' && riichiMode && <div className="rounded bg-sky/20 px-2 py-1 text-[clamp(10px,2vh,14px)] text-sky">立直で切る牌を選んでください</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 待ち・フリテン表示
// ---------------------------------------------------------------------------
export function WaitsHint() {
  const view = useGame((s) => s.view);
  const my = useGame((s) => s.seat);
  const hovered = useGame((s) => s.hovered);
  const selected = useGame((s) => s.selected);
  const prompt = useGame((s) => s.prompt);
  const focus = selected ?? hovered;
  const me = view?.players[my];

  const data = useMemo(() => {
    if (!view || !me?.hand) return null;
    const sanma = view.n === 3;
    const allowed = sanma ? Array.from({ length: 34 }, (_, k) => !(k >= 1 && k <= 7)) : undefined;
    // 見えている枚数（自分の手・全員の河と副露・ドラ表示）
    const seen = new Array<number>(34).fill(0);
    const add = (t: Tile) => seen[t >> 2]++;
    me.hand.forEach(add);
    if (me.drawn != null) add(me.drawn);
    for (const p of view.players) { p.river.forEach((r) => add(r.tile)); p.melds.forEach((m) => m.tiles.forEach(add)); p.nuki.forEach(add); }
    view.dora.forEach(add);
    // 鳴かれた牌は河と副露の両方で数えているので引く
    for (const p of view.players) p.river.forEach((r) => { if (r.calledBy !== undefined) seen[r.tile >> 2]--; });

    let waits: number[] = [];
    let label = '待ち';
    const turn = prompt?.options.kind === 'turn';
    if (turn && focus != null) {
      const tiles = [...me.hand, ...(me.drawn != null ? [me.drawn] : [])].filter((t) => t !== focus);
      waits = waitsOf(countsOf(tiles), me.melds.length, allowed);
      label = '切ると待ち';
    } else if (!turn || me.drawn == null) {
      waits = view.waits;
    }
    if (!waits.length) return null;
    return { label, waits: waits.map((k) => ({ k, left: Math.max(0, 4 - seen[k]) })) };
  }, [view, me, focus, prompt]);

  if (!data && !view?.furiten) return null;
  return (
    <div className="pointer-events-none absolute bottom-[23%] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/15 bg-ink/85 px-[1.4vh] py-[.8vh] shadow-[0_8px_26px_rgba(0,0,0,.6)] backdrop-blur">
      {view?.furiten && <span className="rounded bg-ruby/30 px-2 py-0.5 text-[clamp(10px,2vh,14px)] font-black text-ruby">フリテン</span>}
      {data && (
        <>
          <span className="text-[clamp(10px,2vh,14px)] text-slate-300">{data.label}</span>
          {data.waits.map((w) => (
            <span key={w.k} className="flex flex-col items-center gap-[2px]">
              <TileImg tile={tileOfKind(w.k)} w={clampW(4)} dim={w.left === 0} />
              <span className={`tabular text-[clamp(9px,1.7vh,12px)] ${w.left === 0 ? 'text-slate-500' : 'text-gold2'}`}>{w.left}枚</span>
            </span>
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 右上: 設定・スタンプ
// ---------------------------------------------------------------------------
export function Menu({ ctl, onLeave }: { ctl: GameController; onLeave: () => void }) {
  const [open, setOpen] = useState<'none' | 'menu' | 'stamp'>('none');
  const autoWin = useGame((s) => s.autoWin);
  const noCall = useGame((s) => s.noCall);
  const volume = useGame((s) => s.volume);
  const set = useGame((s) => s.set);
  const Toggle = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
    <button onClick={() => { sound.play('click'); onClick(); }} className={`rounded-lg border px-[1.4vh] py-[.8vh] text-[clamp(10px,2.1vh,14px)] font-bold transition ${on ? 'border-gold bg-gold/25 text-gold2' : 'border-white/15 bg-ink/80 text-slate-300'}`}>{label}</button>
  );
  return (
    <div className="absolute right-[max(10px,env(safe-area-inset-right))] top-[max(8px,env(safe-area-inset-top))] z-30 flex flex-col items-end gap-[1vh]">
      <div className="flex gap-[1vh]">
        <Toggle on={autoWin} label="自動和了" onClick={() => set({ autoWin: !autoWin })} />
        <Toggle on={noCall} label="鳴きなし" onClick={() => set({ noCall: !noCall })} />
        <Toggle on={open === 'stamp'} label="スタンプ" onClick={() => setOpen(open === 'stamp' ? 'none' : 'stamp')} />
        <Toggle on={open === 'menu'} label="設定" onClick={() => setOpen(open === 'menu' ? 'none' : 'menu')} />
      </div>
      {open === 'stamp' && (
        <div className="grid grid-cols-2 gap-[.8vh] rounded-xl border border-white/15 bg-ink/95 p-[1.2vh]">
          {STAMPS.map((s) => <button key={s} onClick={() => { ctl.stamp(s); setOpen('none'); }} className="rounded-lg bg-white/10 px-3 py-[.8vh] text-[clamp(11px,2.2vh,15px)] font-bold hover:bg-gold/25">{s}</button>)}
        </div>
      )}
      {open === 'menu' && (
        <div className="w-[min(60vw,260px)] space-y-[1.4vh] rounded-xl border border-white/15 bg-ink/95 p-[1.6vh] text-[clamp(11px,2.2vh,15px)]">
          <label className="block">
            <span className="text-slate-300">音量</span>
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => { const v = Number(e.target.value); set({ volume: v }); sound.unlock(); sound.setVolume(v); }} className="mt-1 w-full accent-[#e7c26a]" />
          </label>
          <button onClick={onLeave} className="w-full rounded-lg border border-ruby/60 py-[.9vh] font-bold text-ruby hover:bg-ruby/15">卓を離れる</button>
        </div>
      )}
    </div>
  );
}

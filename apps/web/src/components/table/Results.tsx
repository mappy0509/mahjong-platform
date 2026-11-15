'use client';
import { useEffect, useMemo, useState } from 'react';
import type { GameSummary, Meld, TableInfo, WinDetail } from '@mj/core';
import { tierOf, useGame, type RoundEndInfo } from '@/game/client';
import { sound } from '@/lib/sound';
import { TIER_COLORS } from './FxLayer';
import { TileImg } from './TileImg';

const WINDS = ['東', '南', '西', '北'];
const fmt = (n: number) => n.toLocaleString('ja-JP');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

function useCountUp(target: number, start: boolean, ms = 900): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!start) { setV(0); return; }
    const t0 = performance.now();
    let raf = 0;
    let lastTick = 0;
    const step = (now: number) => {
      const x = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - x, 3);
      setV(Math.round((target * e) / 100) * 100);
      if (now - lastTick > 60 && x < 1) { sound.play('score'); lastTick = now; }
      if (x < 1) raf = requestAnimationFrame(step);
      else setV(target);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, start, ms]);
  return v;
}

function MeldTiles({ m, seat, n, w }: { m: Meld; seat: number; n: number; w: number }) {
  if (m.type === 'ankan') {
    return <span className="flex items-end gap-px"><TileImg back w={w} /><TileImg tile={m.tiles[1]} w={w} /><TileImg tile={m.tiles[2]} w={w} /><TileImg back w={w} /></span>;
  }
  const own = m.tiles.filter((t) => t !== m.called && t !== m.added);
  const d = ((m.from ?? 0) - seat + n) % n;
  const rel = n === 3 ? (d === 1 ? 1 : 3) : d;
  const idx = rel === 3 ? 0 : rel === 2 ? 1 : own.length;
  const list: { t: number; side?: boolean }[] = own.map((t) => ({ t }));
  list.splice(idx, 0, { t: m.called!, side: true });
  if (m.added !== undefined) list.splice(idx, 0, { t: m.added, side: true });
  return <span className="flex items-end gap-px">{list.map((x, i) => <TileImg key={i} tile={x.t} w={w} side={x.side} />)}</span>;
}

/** 和了の詳細（手牌・役・点数）。格が高いほど派手になる。 */
export function WinShow({ win, table, onClose }: { win: WinDetail; table: TableInfo | null; onClose: () => void }) {
  const tier = tierOf(win);
  const [c1, c2] = TIER_COLORS[tier];
  const r = win.result;
  const n = table?.rules.players ?? 4;
  const name = (s: number) => table?.seats[s]?.name || `席${s + 1}`;
  const view = useGame((s) => s.view);
  const yaku = r.yaku;
  const [shown, setShown] = useState(0);
  const done = shown >= yaku.length;
  const gain = win.deltas[win.seat];
  const total = useCountUp(gain, done, 700 + tier * 200);
  const concealed = useMemo(() => win.hand.filter((t) => t !== win.winTile), [win]);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  const tileW = Math.max(22, Math.min(46, Math.floor(Math.min(vw / 24, vh / 11))));

  useEffect(() => {
    setShown(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const gap = yaku.length > 6 ? 170 : 260;
    yaku.forEach((_, i) => timers.push(setTimeout(() => { setShown(i + 1); sound.play('yaku'); }, 650 + i * gap)));
    const auto = setTimeout(onClose, 650 + yaku.length * gap + (tier >= 5 ? 9000 : 6000));
    return () => { timers.forEach(clearTimeout); clearTimeout(auto); };
  }, [win]); // eslint-disable-line react-hooks/exhaustive-deps

  const payText = (() => {
    if (win.from !== null) return `${name(win.from)} から`;
    const payers = win.deltas.map((d, i) => ({ d, i })).filter((x) => x.d < 0).map((x) => -x.d);
    const uniq = [...new Set(payers)].sort((a, b) => a - b);
    return uniq.length === 1 ? `${fmt(uniq[0])} オール` : `${uniq.map(fmt).join(' / ')}`;
  })();
  const dora = view?.dora ?? [];
  const hanText = r.yakuman ? r.limit : `${r.han}翻 ${r.fu}符`;
  // 手役そのものの点（本場・供託を除く）と、実際に受け取った点の差を注記する
  const isDealer = view ? view.dealer === win.seat : false;
  const ceil100 = (x: number) => Math.ceil(x / 100) * 100;
  const handValue = win.from !== null
    ? ceil100(r.base * (isDealer ? 6 : 4))
    : isDealer ? ceil100(r.base * 2) * (n - 1) : ceil100(r.base * 2) + ceil100(r.base) * (n - 2);
  const extra = gain - handValue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onPointerDown={() => (done ? onClose() : setShown(yaku.length))}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-[3px]" />
      {tier >= 1 && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[240vmax] w-[240vmax] -translate-x-1/2 -translate-y-1/2 opacity-40"
          style={{ background: `repeating-conic-gradient(from 0deg, ${c1}33 0deg 4deg, transparent 4deg 14deg)`, maskImage: 'radial-gradient(circle, #000 0%, transparent 55%)', WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 55%)', animation: `rs-rays ${tier >= 5 ? 14 : 40}s linear infinite` }} />
      )}
      <div className="relative w-[min(96vw,1040px)] rounded-2xl border p-[clamp(10px,2.4vh,26px)]"
        style={{ borderColor: `${c1}88`, background: 'linear-gradient(180deg, rgba(18,26,33,.96), rgba(9,13,17,.97))', boxShadow: `0 0 0 1px #000, 0 30px 90px rgba(0,0,0,.8), 0 0 ${40 + tier * 26}px ${c1}55`, animation: 'rs-in .35s ease-out both' }}>
        <div className="flex items-baseline justify-between gap-4">
          <div className="font-display text-[clamp(16px,3.6vh,30px)] font-extrabold tracking-wider">
            <span className="mr-3 rounded px-2 py-0.5 text-[.7em]" style={{ background: c2, color: '#fff' }}>{win.from === null ? 'ツモ' : 'ロン'}</span>
            {name(win.seat)}
          </div>
          <div className="text-[clamp(11px,2.2vh,16px)] text-slate-400">{payText}{win.pao !== null && `（責任払い: ${name(win.pao)}）`}</div>
        </div>

        <div className="mt-[1.6vh] flex flex-wrap items-end gap-x-[1.4vw] gap-y-2" style={{ perspective: 600 }}>
          <span className="flex items-end gap-px">
            {concealed.map((t, i) => <span key={t} style={{ animation: `rs-tile .3s ${i * 28}ms ease-out both` }}><TileImg tile={t} w={tileW} /></span>)}
          </span>
          <span style={{ animation: `rs-tile .35s ${concealed.length * 28 + 120}ms ease-out both` }}><TileImg tile={win.winTile} w={tileW} glow /></span>
          {win.melds.map((m, i) => <MeldTiles key={i} m={m} seat={win.seat} n={n} w={tileW} />)}
        </div>

        <div className="mt-[1.6vh] flex items-center gap-[2vw] text-[clamp(10px,2vh,14px)] text-slate-400">
          <span className="flex items-center gap-2">ドラ<span className="flex gap-px">{dora.map((t) => <TileImg key={t} tile={t} w={Math.round(tileW * 0.62)} />)}</span></span>
          {win.uraIndicators.length > 0 && <span className="flex items-center gap-2">裏ドラ<span className="flex gap-px">{win.uraIndicators.map((t) => <TileImg key={t} tile={t} w={Math.round(tileW * 0.62)} />)}</span></span>}
        </div>

        <div className="mt-[1.6vh] flex items-stretch gap-[2vw]">
          <div className="grid flex-1 content-start gap-x-[2vw] gap-y-[.5vh]" style={{ gridTemplateColumns: yaku.length > 5 ? '1fr 1fr' : '1fr' }}>
            {yaku.slice(0, shown).map((y, i) => (
              <div key={i} className="flex items-baseline justify-between border-b border-white/10 pb-[.3vh] text-[clamp(13px,2.9vh,22px)]" style={{ animation: 'rs-row .28s ease-out both' }}>
                <span className="font-display font-semibold tracking-wide" style={{ color: y.han >= 13 ? c1 : '#f3f6f8' }}>{y.name}</span>
                <span className="tabular ml-4 text-[.82em]" style={{ color: c1 }}>{y.han >= 13 ? (y.han >= 26 ? 'ダブル役満' : '役満') : `${y.han}翻`}</span>
              </div>
            ))}
          </div>
          <div className="flex w-[36%] min-w-[170px] flex-col items-end justify-end gap-[.6vh]" style={{ minHeight: tier >= 1 ? 'clamp(96px, 24vh, 220px)' : undefined }}>
            {done && tier >= 1 && (
              <div className="font-display mr-[1vw] whitespace-nowrap font-extrabold leading-none" style={{ fontSize: `clamp(26px, ${6.5 + tier * 1.5}vh, ${64 + tier * 16}px)`, color: c1, textShadow: `0 3px 0 ${c2}, 0 0 30px ${c1}, 0 0 70px ${c1}`, animation: 'rs-stamp .6s cubic-bezier(.2,1.3,.3,1) both', transformOrigin: 'center' }}>
                {r.limit}
              </div>
            )}
            {done && !r.yakuman && <div className="text-[clamp(12px,2.6vh,18px)] text-slate-300" style={{ animation: 'rs-in .3s both' }}>{hanText}</div>}
            {done && extra > 0 && win.pao === null && <div className="text-[clamp(10px,2vh,14px)] text-slate-400">本場・供託 +{fmt(extra)} を含む</div>}
            {done && (
              <div className="tabular font-display rs-shine text-[clamp(30px,9vh,84px)] font-extrabold leading-none" style={{ ['--c1' as any]: c1 }}>
                {fmt(total)}<span className="ml-1 text-[.4em]">点</span>
              </div>
            )}
          </div>
        </div>
        <div className="mt-[1.2vh] text-right text-[clamp(10px,1.9vh,13px)] text-slate-500" style={{ animation: 'rs-pulse 1.6s infinite' }}>画面をタップで次へ</div>
      </div>
    </div>
  );
}

/** 局の結果（点数の移動） */
export function RoundEndPanel({ info, table, mySeat, onNext }: { info: RoundEndInfo; table: TableInfo | null; mySeat: number; onNext: () => void }) {
  const offset = useGame((s) => s.offset);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const n = info.result.scores.length;
  const order = Array.from({ length: n }, (_, i) => (Math.max(0, mySeat) + i) % n);
  const left = Math.max(0, Math.ceil((info.nextAt - (now + offset)) / 1000));
  const ranks = [...info.result.scores.keys()].sort((a, b) => info.result.scores[b] - info.result.scores[a]);
  const title = info.result.type === 'agari' ? '和了' : (info.draw?.reason ?? '流局');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55">
      <div className="w-[min(92vw,640px)] rounded-2xl border border-gold/50 bg-gradient-to-b from-panel to-ink p-[clamp(12px,3vh,26px)] shadow-[0_30px_90px_rgba(0,0,0,.8)]" style={{ animation: 'rs-in .3s ease-out both' }}>
        <div className="font-display text-center text-[clamp(18px,4.4vh,32px)] font-extrabold tracking-[.3em] text-gold2">{title}</div>
        <div className="mt-[1.6vh] space-y-[.8vh]">
          {order.map((s, i) => {
            const d = info.result.deltas[s];
            return (
              <div key={s} className={`flex items-center gap-3 rounded-lg px-3 py-[.9vh] ${s === mySeat ? 'bg-white/10' : 'bg-white/[.04]'}`} style={{ animation: `rs-row .3s ${i * 70}ms ease-out both` }}>
                <span className="font-display w-12 whitespace-nowrap text-center text-[clamp(13px,2.8vh,20px)] text-slate-400">{ranks.indexOf(s) + 1}位</span>
                <span className="flex-1 truncate text-[clamp(13px,2.8vh,20px)] font-bold">{table?.seats[s]?.name || `席${s + 1}`}{info.draw && info.result.reason === 'exhaustive' && <span className={`ml-2 rounded px-1.5 py-0.5 text-[.65em] ${info.draw.tenpai[s] ? 'bg-jade/30 text-jade' : 'bg-white/10 text-slate-400'}`}>{info.draw.tenpai[s] ? '聴牌' : 'ノーテン'}</span>}</span>
                <span className={`tabular w-24 text-right text-[clamp(13px,2.8vh,20px)] font-bold ${d > 0 ? 'text-jade' : d < 0 ? 'text-ruby' : 'text-slate-500'}`}>{d !== 0 ? signed(d) : '—'}</span>
                <span className="tabular w-24 text-right text-[clamp(15px,3.2vh,24px)] font-black">{fmt(info.result.scores[s])}</span>
              </div>
            );
          })}
        </div>
        <button onClick={() => { sound.play('click'); onNext(); }} className="mt-[2vh] w-full rounded-xl bg-gradient-to-b from-gold2 to-gold py-[1.4vh] text-[clamp(14px,3vh,20px)] font-black text-ink shadow-[0_4px_0_#8a6a22] active:translate-y-[2px] active:shadow-[0_2px_0_#8a6a22]">
          次の局へ{info.nextAt > 0 && left > 0 ? `（${left}）` : ''}
        </button>
      </div>
    </div>
  );
}

/** 終局の順位 */
export function FinalPanel({ summary, table, mySeat, onHome }: { summary: GameSummary; table: TableInfo | null; mySeat: number; onHome: () => void }) {
  const medals = ['#ffd76a', '#cfd8e3', '#d99a5b', '#7b8794'];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2 opacity-25" style={{ background: 'repeating-conic-gradient(from 0deg, #e7c26a44 0deg 4deg, transparent 4deg 14deg)', maskImage: 'radial-gradient(circle, #000 0%, transparent 55%)', WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 55%)', animation: 'rs-rays 50s linear infinite' }} />
      <div className="relative w-[min(92vw,680px)]" style={{ animation: 'rs-in .4s ease-out both' }}>
        <div className="font-display text-center text-[clamp(26px,7vh,56px)] font-extrabold tracking-[.4em] text-gold2" style={{ textShadow: '0 0 30px rgba(231,194,106,.8)' }}>終局</div>
        <div className="mt-[2vh] space-y-[1vh]">
          {summary.standings.map((st, i) => (
            <div key={st.seat} className={`flex items-center gap-4 rounded-xl border px-4 py-[1.3vh] ${st.seat === mySeat ? 'border-gold/70 bg-gold/10' : 'border-white/10 bg-white/[.04]'}`} style={{ animation: `rs-row .4s ${200 + i * 160}ms ease-out both` }}>
              <span className="font-display w-14 text-center text-[clamp(18px,4.6vh,36px)] font-extrabold" style={{ color: medals[i] }}>{st.rank}<span className="text-[.5em]">位</span></span>
              <span className="flex-1 truncate text-[clamp(14px,3.2vh,24px)] font-bold">{table?.seats[st.seat]?.name || `席${st.seat + 1}`}</span>
              <span className="tabular w-28 text-right text-[clamp(13px,2.8vh,20px)] text-slate-300">{fmt(st.score)}</span>
              <span className={`tabular w-24 text-right text-[clamp(16px,3.8vh,28px)] font-black ${st.points > 0 ? 'text-jade' : st.points < 0 ? 'text-ruby' : 'text-slate-400'}`}>{st.points > 0 ? '+' : ''}{st.points.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <button onClick={() => { sound.play('click'); onHome(); }} className="mt-[3vh] w-full rounded-xl bg-gradient-to-b from-gold2 to-gold py-[1.6vh] text-[clamp(14px,3vh,20px)] font-black text-ink shadow-[0_4px_0_#8a6a22] active:translate-y-[2px]">
          ロビーへ戻る
        </button>
      </div>
    </div>
  );
}

export { WINDS };

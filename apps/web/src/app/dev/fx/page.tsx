'use client';
import { useState } from 'react';
import { evaluateWin, defaultRules, tilesFromString, calcPayments, type Meld, type TableInfo, type WinDetail } from '@mj/core';
import { fx, useGame } from '@/game/client';
import { FxLayer } from '@/components/table/FxLayer';
import { WinShow } from '@/components/table/Results';
import { sound } from '@/lib/sound';

/** 開発用: 演出と和了画面を単体で確認する */
const rules = defaultRules(4);
const table: TableInfo = { id: 'x', rules, state: 'playing', seats: ['あなた', '南雲', '西嶺', '北斗'].map((name, seat) => ({ seat, userId: null, name, bot: seat > 0, connected: true, ready: true })) };

function mkWin(hand: string, win: string, o: { tsumo?: boolean; riichi?: 0 | 1 | 2; melds?: Meld[]; dora?: string; ura?: string; ippatsu?: boolean; tenhou?: boolean } = {}): WinDetail {
  const used = new Set<number>();
  for (const m of o.melds ?? []) m.tiles.forEach((t) => used.add(t));
  const h = tilesFromString(hand, used);
  const w = tilesFromString(win, used)[0];
  const dora = tilesFromString(o.dora ?? '9s', used);
  const ura = tilesFromString(o.ura ?? '9p', used);
  const result = evaluateWin({
    hand: [...h, w], melds: o.melds ?? [], winTile: w, tsumo: !!o.tsumo, riichi: o.riichi ?? 0, ippatsu: !!o.ippatsu,
    rinshan: false, chankan: false, lastTile: false, tenhou: !!o.tenhou, chiihou: false, seatWind: 27, roundWind: 27,
    doraIndicators: dora, uraIndicators: ura, nuki: 0, rules,
  })!;
  const deltas = calcPayments({ base: result.base, n: 4, winner: 0, dealer: 0, loser: o.tsumo ? null : 2, honba: 0, rules });
  useGame.getState().set({ view: { dora } as any });
  return { seat: 0, from: o.tsumo ? null : 2, hand: [...h, w], melds: o.melds ?? [], winTile: w, result, deltas, uraIndicators: o.riichi ? ura : [], pao: null };
}

const SAMPLES: { label: string; make: () => WinDetail }[] = [
  { label: '通常', make: () => mkWin('234m567p78s345s22z', '9s', { riichi: 1 }) },
  { label: '満貫', make: () => mkWin('234m567p78s345s22z', '9s', { riichi: 1, tsumo: true, ippatsu: true, dora: '1z' }) },
  { label: '跳満', make: () => mkWin('123456789m11z23p', '1p', { riichi: 1, tsumo: true, dora: '9m' }) },
  { label: '倍満', make: () => mkWin('1112345678m55m9m', '9m', { riichi: 1, tsumo: true }) },
  { label: '三倍満', make: () => mkWin('1112345678999m'.slice(0, 13) + 'm', '5m', { riichi: 1, tsumo: true, ippatsu: true }) },
  { label: '役満', make: () => mkWin('111m999p111s22z55z', '5z', { tsumo: true }) },
  { label: 'ダブル役満', make: () => mkWin('19m19p19s1234567z', '1m', { tsumo: true }) },
];

export default function Page() {
  const [win, setWin] = useState<WinDetail | null>(null);
  const cx = () => window.innerWidth / 2, cy = () => window.innerHeight / 2;
  const B = ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={() => { sound.unlock(); onClick(); }} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-bold hover:bg-gold/25">{children}</button>
  );
  return (
    <main className="min-h-screen bg-gradient-to-b from-[#12352f] to-[#07130f] p-6">
      <h1 className="font-display text-2xl text-gold2">演出の確認</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        <B onClick={() => { fx.emit({ type: 'callout', kind: 'pon', rel: 1, x: cx() + 200, y: cy(), text: 'ポン' }); sound.play('call'); }}>ポン</B>
        <B onClick={() => { fx.emit({ type: 'callout', kind: 'chi', rel: 3, x: cx() - 200, y: cy(), text: 'チー' }); sound.play('call'); }}>チー</B>
        <B onClick={() => { fx.emit({ type: 'callout', kind: 'kan', rel: 2, x: cx(), y: cy() - 120, text: 'カン' }); sound.play('kan'); }}>カン</B>
        <B onClick={() => { fx.emit({ type: 'callout', kind: 'riichi', rel: 0, x: cx(), y: cy() + 60, text: '立直' }); sound.play('riichi'); }}>立直</B>
        <B onClick={() => { fx.emit({ type: 'banner', text: '東一局', sub: '1 本場' }); sound.play('start'); }}>局開始</B>
        <B onClick={() => { fx.emit({ type: 'banner', text: '流局' }); sound.play('ryuukyoku'); }}>流局</B>
        <B onClick={() => { fx.emit({ type: 'dealin' }); sound.play('dealin'); }}>放銃</B>
        <B onClick={() => fx.emit({ type: 'stamp', rel: 1, id: 'ナイス！' })}>スタンプ</B>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4, 5].map((t) => (
          <B key={t} onClick={() => { fx.emit({ type: 'strike', kind: t % 2 ? 'tsumo' : 'ron', rel: 0, tier: t, x: cx(), y: cy() + 100 }); sound.play(t % 2 ? 'tsumo' : 'ron'); }}>一撃 格{t}</B>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {SAMPLES.map((s) => (
          <B key={s.label} onClick={() => { const w = s.make(); setWin(w); const t = w.result.yakuman ? 'yakuman' : w.result.base >= 4000 ? 'winBig' : 'win'; sound.play(t as any); }}>和了画面: {s.label}</B>
        ))}
      </div>
      <FxLayer />
      {win && <WinShow win={win} table={table} onClose={() => setWin(null)} />}
    </main>
  );
}

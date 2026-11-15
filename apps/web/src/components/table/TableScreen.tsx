'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameController, useGame } from '@/game/client';
import { TableScene } from '@/game/TableScene';
import { sound } from '@/lib/sound';
import { FxLayer } from './FxLayer';
import { ActionBar, InfoPanel, Menu, Plates, WaitsHint } from './Hud';
import { FinalPanel, RoundEndPanel, WinShow } from './Results';

/** 開発用: ?ts=8788 で別ポートの対局サーバーにつなぐ */
function devPort(): string | null {
  const p = new URLSearchParams(location.search).get('ts');
  return p && /^\d{2,5}$/.test(p) ? p : null;
}

export function tableServerWs(): string {
  const dp = devPort();
  if (dp) return `ws://${location.hostname}:${dp}/ws`;
  if (process.env.NEXT_PUBLIC_TABLE_SERVER_WS) return process.env.NEXT_PUBLIC_TABLE_SERVER_WS;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787/ws`;
}
export function tableServerHttp(): string {
  const dp = devPort();
  if (dp) return `http://${location.hostname}:${dp}`;
  if (process.env.NEXT_PUBLIC_TABLE_SERVER_URL) return process.env.NEXT_PUBLIC_TABLE_SERVER_URL;
  return `${location.protocol}//${location.hostname}:8787`;
}

function guestToken(): string {
  let id = localStorage.getItem('mj_guest');
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('mj_guest', id);
  }
  return `guest:${id}`;
}

export function TableScreen({ tableId }: { tableId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctl, setCtl] = useState<GameController | null>(null);
  const router = useRouter();
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const table = useGame((s) => s.table);
  const seat = useGame((s) => s.seat);
  const view = useGame((s) => s.view);
  const winShow = useGame((s) => s.winShow);
  const roundEnd = useGame((s) => s.roundEnd);
  const final = useGame((s) => s.final);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    let disposed = false;
    let controller: GameController | null = null;
    const scene = new TableScene(canvasRef.current!, {
      onTile: (tile, touch) => controller?.tapTile(tile, touch),
      onHover: (tile) => useGame.getState().set({ hovered: tile }),
    });
    (window as any).__scene = scene;
    (async () => {
      let token = '';
      let name = localStorage.getItem('mj_name') || 'あなた';
      try {
        const r = await fetch('/api/auth/ws-token', { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); token = j.token; name = j.name ?? name; }
      } catch { /* 未ログインはゲストで入る */ }
      if (!token) token = guestToken();
      await scene.ready;
      if (disposed) return;
      controller = new GameController(tableServerWs(), tableId, token, name);
      controller.attach(scene);
      (window as any).__ctl = controller;
      (window as any).__game = useGame;
      setCtl(controller);
    })();
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock);
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth * 1.05 && window.innerWidth < 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      disposed = true;
      controller?.dispose();
      scene.dispose();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('resize', onResize);
    };
  }, [tableId]);

  const leave = () => (window.history.length > 1 && document.referrer.startsWith(location.origin) ? router.back() : router.push('/'));
  const waiting = table?.state === 'waiting' || (!view && !error);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05080b]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {ctl && view && !waiting && (
        <>
          <InfoPanel />
          <Plates />
          <WaitsHint />
          <ActionBar ctl={ctl} />
          <Menu ctl={ctl} onLeave={leave} />
        </>
      )}
      <FxLayer />
      {ctl && winShow && <WinShow win={winShow.wins[winShow.index]} table={table} onClose={() => ctl.closeWinShow()} />}
      {ctl && roundEnd && !winShow && !final && <RoundEndPanel info={roundEnd} table={table} mySeat={seat} onNext={() => ctl.next()} />}
      {final && !winShow && <FinalPanel summary={final} table={table} mySeat={seat} onHome={leave} />}

      {waiting && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[min(90vw,460px)] rounded-2xl border border-gold/40 bg-panel/95 p-6 text-center">
            <div className="font-display text-2xl font-extrabold tracking-[.3em] text-gold2">対局準備中</div>
            <div className="mt-4 space-y-2">
              {(table?.seats ?? []).map((s) => (
                <div key={s.seat} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2 text-sm">
                  <span className="font-bold">{s.name || '空席'}</span>
                  <span className={s.ready ? 'text-jade' : 'text-slate-500'}>{s.name ? (s.ready ? '準備完了' : s.connected ? '入室' : '未接続') : '待機中'}</span>
                </div>
              ))}
            </div>
            {error && <div className="mt-4 rounded bg-ruby/20 px-3 py-2 text-sm text-ruby">{error}</div>}
            <button onClick={leave} className="mt-5 text-sm text-slate-400 underline">戻る</button>
          </div>
        </div>
      )}
      {status === 'closed' && !waiting && (
        <div className="absolute left-1/2 top-3 z-[70] -translate-x-1/2 rounded-full border border-ruby/60 bg-ink/95 px-5 py-2 text-sm font-bold text-ruby shadow-lg">接続が切れました。再接続しています…</div>
      )}
      {error && !waiting && (
        <div className="absolute left-1/2 top-14 z-[70] -translate-x-1/2 rounded-lg border border-ruby/60 bg-ink/95 px-4 py-2 text-sm text-ruby">{error}</div>
      )}
      {portrait && (
        <div className="absolute inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-ink text-center">
          <div className="font-display text-2xl font-extrabold tracking-widest text-gold2">端末を横向きにしてください</div>
          <div className="text-sm text-slate-400">対局画面は横画面専用です</div>
        </div>
      )}
    </div>
  );
}

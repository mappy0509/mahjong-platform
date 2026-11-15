'use client';
import { useEffect, useRef, useState } from 'react';
import { fx, type Fx } from '@/game/client';
import './fx.css';

/** 格ごとの配色（主色・副色）: 0=通常 1=満貫 2=跳満 3=倍満 4=三倍満 5=役満 */
export const TIER_COLORS: [string, string][] = [
  ['#ffd76a', '#b8791a'],
  ['#ffc23d', '#d9541e'],
  ['#5ad2ff', '#2a5cff'],
  ['#c77dff', '#6a1fd0'],
  ['#ff4d6d', '#8f0a2a'],
  ['#fff1a8', '#ff9d1f'],
];
const CALL_COLORS: Record<string, [string, string]> = {
  pon: ['#3ee0a8', '#0d7a58'], chi: ['#6ad3ff', '#1f5fae'], kan: ['#c68bff', '#5a1fb5'], nuki: ['#ffd76a', '#a8761a'], riichi: ['#5ab8ff', '#1c4f8f'],
};

interface Item { id: number; e: Fx; }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; g: number; }

let seq = 0;

export function FxLayer() {
  const [items, setItems] = useState<Item[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparks = useRef<Spark[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    const burst = (x: number, y: number, n: number, colors: string[], speed: number, rain = false) => {
      const w = window.innerWidth, h = window.innerHeight;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.25 + Math.random());
        sparks.current.push(
          rain
            ? { x: Math.random() * w, y: -20 - Math.random() * h * 0.6, vx: (Math.random() - 0.5) * 60, vy: 180 + Math.random() * 260, life: 0, max: 2.6 + Math.random() * 1.6, size: 2 + Math.random() * 4, color: colors[i % colors.length], g: 40 }
            : { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25, life: 0, max: 0.7 + Math.random() * 0.9, size: 1.5 + Math.random() * 3.5, color: colors[i % colors.length], g: 520 },
        );
      }
      if (!raf.current) raf.current = requestAnimationFrame(tick);
    };
    let last = performance.now();
    const tick = (now: number) => {
      const c = canvasRef.current;
      if (!c) { raf.current = 0; return; }
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.floor(window.innerWidth * dpr)) { c.width = Math.floor(window.innerWidth * dpr); c.height = Math.floor(window.innerHeight * dpr); }
      const ctx = c.getContext('2d')!;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = 'lighter';
      const arr = sparks.current;
      for (let i = arr.length - 1; i >= 0; i--) {
        const s = arr[i];
        s.life += dt;
        if (s.life >= s.max) { arr.splice(i, 1); continue; }
        s.vy += s.g * dt;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const k = 1 - s.life / s.max;
        ctx.globalAlpha = k;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        // 進行方向に伸びた光の粒
        const len = Math.min(26, Math.hypot(s.vx, s.vy) * 0.03);
        const ang = Math.atan2(s.vy, s.vx);
        ctx.ellipse(s.x, s.y, s.size + len, s.size * k + 0.4, ang, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (arr.length) raf.current = requestAnimationFrame(tick);
      else { raf.current = 0; ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
    };

    const off = fx.on((e) => {
      const id = ++seq;
      let ttl = 1000;
      if (e.type === 'callout') {
        ttl = e.kind === 'riichi' ? 1100 : 980;
        const c = CALL_COLORS[e.kind];
        burst(e.x, e.y, e.kind === 'riichi' ? 46 : 26, [c[0], '#ffffff'], 420);
      } else if (e.type === 'strike') {
        ttl = 1500 + e.tier * 260;
        const c = TIER_COLORS[e.tier];
        const cx = window.innerWidth / 2, cy = window.innerHeight * 0.46;
        burst(e.x, e.y, 60 + e.tier * 45, [c[0], c[1], '#ffffff'], 700 + e.tier * 160);
        setTimeout(() => burst(cx, cy, 50 + e.tier * 60, [c[0], '#ffffff'], 900 + e.tier * 200), 140);
        if (e.tier >= 3) setTimeout(() => burst(cx, cy, 120 + e.tier * 40, [c[0], c[1], '#fff'], 1300), 420);
        if (e.tier >= 5) burst(0, 0, 260, ['#fff1a8', '#ffd76a', '#ff9d1f', '#ffffff'], 0, true);
      } else if (e.type === 'dealin') ttl = 1500;
      else if (e.type === 'banner') ttl = 1500;
      else if (e.type === 'stamp') ttl = 2200;
      else if (e.type === 'dora') {
        burst(140, 70, 22, ['#fff1a8', '#ffd76a'], 260);
        return;
      }
      setItems((s) => [...s, { id, e }]);
      setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), ttl);
    });
    return () => { off(); cancelAnimationFrame(raf.current); raf.current = 0; };
  }, []);

  return (
    <div className="fx-root">
      {items.map(({ id, e }) => {
        if (e.type === 'callout' && e.kind === 'riichi') {
          return (
            <div key={id} className="fx-riichi" style={{ top: `${Math.min(78, Math.max(22, (e.y / window.innerHeight) * 100))}%` }}>
              <div className="band" /><div className="streak" /><div className="txt">{e.text}</div><div className="stick" />
            </div>
          );
        }
        if (e.type === 'callout') {
          const c = CALL_COLORS[e.kind];
          return <div key={id} className="fx-callout" style={{ left: e.x, top: e.y, ['--fx' as any]: c[0], ['--fx2' as any]: c[1] }}>{e.text}</div>;
        }
        if (e.type === 'strike') {
          const c = TIER_COLORS[e.tier];
          const word = e.kind === 'ron' ? 'ロン' : 'ツモ';
          return (
            <div key={id} className="fx-strike" style={{ ['--fx' as any]: c[0], ['--fx2' as any]: c[1], ['--ox' as any]: `${e.x}px`, ['--oy' as any]: `${e.y}px`, ['--dur' as any]: `${1.5 + e.tier * 0.26}s` }}>
              <div className="dark" />
              {e.tier >= 3 && <div className="flame" />}
              <div className="rays" />
              <div className="flash" />
              <div className="ring" /><div className="ring" />{e.tier >= 1 && <div className="ring" />}
              {e.tier >= 2 && [12, 38, 66, 84].slice(0, e.tier).map((l, i) => <div key={i} className="bolt" style={{ left: `${l}%`, animationDelay: `${0.08 + i * 0.11}s` }} />)}
              <div className="slash" />{e.tier >= 1 && <div className="slash b" />}
              <div className="word">{[...word].map((ch, i) => <span key={i}>{ch}</span>)}</div>
            </div>
          );
        }
        if (e.type === 'dealin') return <div key={id} className="fx-dealin"><div className="crack" /></div>;
        if (e.type === 'banner') return <div key={id} className="fx-banner">{e.sub && <div className="s">{e.sub}</div>}<div className="line" /><div className="t">{e.text}</div><div className="line" /></div>;
        if (e.type === 'stamp') {
          const pos = [{ left: '26%', top: '70%' }, { left: '84%', top: '46%' }, { left: '60%', top: '14%' }, { left: '16%', top: '38%' }][e.rel];
          return <div key={id} className="fx-stamp" style={pos}>{e.id}</div>;
        }
        return null;
      })}
      <canvas ref={canvasRef} className="fx-canvas" />
    </div>
  );
}

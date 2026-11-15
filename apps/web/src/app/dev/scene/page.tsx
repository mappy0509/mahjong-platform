'use client';
import { useEffect, useRef } from 'react';
import { Round, botAction, defaultRules, seededRandom, shuffledWall, viewFor } from '@mj/core';
import { TableScene } from '@/game/TableScene';

/** 開発用: 3Dの卓だけを表示する。?steps=80&n=4&seed=3 */
export default function Page() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const n = (Number(q.get('n') ?? 4) === 3 ? 3 : 4) as 3 | 4;
    const steps = Number(q.get('steps') ?? 70);
    const seed = Number(q.get('seed') ?? 3);
    const rules = defaultRules(n);
    const rand = seededRandom(seed);
    const round = new Round({ rules, dealer: 0, roundWind: 0, kyoku: 0, honba: 1, kyotaku: 0, scores: new Array(n).fill(rules.startPoints), wall: shuffledWall(n, rand) });
    for (let i = 0; i < steps && round.s.phase !== 'end'; i++) {
      const seat = round.actors()[0];
      const a = botAction(round, seat);
      if (a) round.act(seat, a);
    }
    const scene = new TableScene(ref.current!, {});
    (window as any).scene = scene;
    scene.ready.then(() => {
      scene.setView(viewFor(round, 0), 0, false);
      scene.setSelectable(round.s.players[0].hand, false);
    });
    return () => scene.dispose();
  }, []);
  return <canvas ref={ref} className="fixed inset-0 h-full w-full" />;
}

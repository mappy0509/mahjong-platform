"use client";
import { useRouter } from 'next/navigation';
import { createPractice } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Notice } from '@/components/ui';

const MODES = [
  { players: 4, length: 'south', label: '四人 半荘', sub: '東南戦' },
  { players: 4, length: 'east', label: '四人 東風', sub: '東場のみ' },
  { players: 3, length: 'south', label: '三人 半荘', sub: '北抜き' },
  { players: 3, length: 'east', label: '三人 東風', sub: '北抜き' },
] as const;

/** CPU と対局（未ログインでも遊べる。ポイントは動かない）。 */
export function Practice({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const act = useAction();
  return (
    <div>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {MODES.map((m) => {
          const key = `${m.players}${m.length}`;
          return (
            <Button
              key={key}
              tone={m.players === 4 && m.length === 'south' ? 'gold' : 'line'}
              busy={act.busy === key}
              disabled={!!act.busy}
              className="!min-h-[56px] flex-col !gap-0"
              onClick={() =>
                act.run(key, async () => {
                  const id = await createPractice(m.players, m.length);
                  router.push(`/table/${id}`);
                  // 遷移が終わるまでボタンを戻さない
                  await new Promise((r) => setTimeout(r, 4000));
                })
              }
            >
              <span className="font-display text-base tracking-[0.2em]">{m.label}</span>
              <span className="text-[10px] font-normal tracking-widest opacity-70">{m.sub}</span>
            </Button>
          );
        })}
      </div>
      {act.error ? <div className="mt-2"><Notice onClose={act.clear}>{act.error}</Notice></div> : null}
    </div>
  );
}

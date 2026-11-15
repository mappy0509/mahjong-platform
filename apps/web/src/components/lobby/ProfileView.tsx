"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, fmt } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import type { GameRow } from '@/lib/types';
import { Button, Delta, Empty, Field, Frame, Loading, Notice } from '@/components/ui';
import { Brand } from './Brand';
import { HistoryTable } from './RankingTab';

interface Profile {
  profile: { id: string; display_name: string; created_at: string; is_admin: boolean };
  stats: { games: number; total_delta: number; total_fee: number; avg_rank: number | null; tops: number };
}

export function ProfileView() {
  const prof = useLoad<Profile>('/profile');
  const hist = useLoad<{ games: GameRow[] }>('/history?limit=100');
  const [name, setName] = useState('');
  const act = useAction();
  useEffect(() => { if (prof.data) setName(prof.data.profile.display_name); }, [prof.data]);
  const s = prof.data?.stats;

  return (
    <main className="room px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto max-w-5xl">
        <header className="mb-3 flex items-center justify-between">
          <Brand />
          <Link href="/" className="btn btn-line btn-sm">← ホーム</Link>
        </header>
        {prof.error ? <Notice>{prof.error}</Notice> : null}
        <div className="room-in grid gap-3 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-3">
            <Frame title="プロフィール">
              {!prof.data ? <Loading /> : (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act.run('save', async () => { await api('/profile', { method: 'PATCH', body: { displayName: name } }); await prof.reload(); }, '表示名を変更しました');
                  }}
                >
                  <Field label="表示名" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required hint="卓・ランキングに表示されます（24文字まで）" />
                  {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
                  {act.done ? <Notice kind="ok" onClose={act.clear}>{act.done}</Notice> : null}
                  <Button type="submit" tone="gold" busy={act.busy === 'save'} disabled={name.trim() === prof.data.profile.display_name} className="w-full">変更する</Button>
                </form>
              )}
            </Frame>
            <Frame title="通算">
              {!s ? <Loading /> : (
                <dl className="grid grid-cols-2 gap-3">
                  <Stat label="対局数" value={fmt(s.games)} />
                  <Stat label="平均順位" value={s.avg_rank === null ? '—' : Number(s.avg_rank).toFixed(2)} />
                  <Stat label="トップ" value={s.games ? `${fmt(s.tops)}回（${((s.tops / s.games) * 100).toFixed(0)}%）` : '—'} />
                  <div><dt className="text-[10px] tracking-widest text-[#8fa1ad]">収支（全クラブ）</dt><dd className="text-xl"><Delta value={s.total_delta} /></dd></div>
                </dl>
              )}
              <p className="mt-2 text-xs text-[#6f828f]">直近200局までの集計です。</p>
            </Frame>
          </div>
          <Frame title="対局履歴">
            {hist.error ? <Notice>{hist.error}</Notice> : null}
            {hist.loading && !hist.data ? <Loading /> : null}
            {hist.data && hist.data.games.length === 0 ? <Empty>まだ対局履歴がありません</Empty> : null}
            {hist.data && hist.data.games.length > 0 ? <HistoryTable games={hist.data.games} showClub /> : null}
          </Frame>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-widest text-[#8fa1ad]">{label}</dt>
      <dd className="tabular text-xl font-bold">{value}</dd>
    </div>
  );
}

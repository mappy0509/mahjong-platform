"use client";
import { useState } from 'react';
import { dateTime, fmt } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import type { ClubData, GameRow } from '@/lib/types';
import { Delta, Empty, Frame, Loading, Notice, Segmented } from '@/components/ui';

interface Rank { user_id: string; display_name: string; alias: string | null; games: number; total_delta: number; total_score: number; avg_rank: number; top_rate: number }
type Period = 'all' | '30d' | '7d' | 'today';
const RANK_KANJI = ['一', '二', '三', '四'];

export function RankingTab({ club, userId }: { club: ClubData; userId: string }) {
  const [period, setPeriod] = useState<Period>('30d');
  const rank = useLoad<{ ranking: Rank[] }>(`/clubs/${club.club.id}/ranking?period=${period}`);
  const hist = useLoad<{ games: GameRow[] }>(`/history?clubId=${club.club.id}&limit=50`);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Frame
        title="ランキング"
        aside={
          <div className="w-64">
            <Segmented label="" value={period} onChange={setPeriod}
              options={[{ value: 'today', label: '今日' }, { value: '7d', label: '7日' }, { value: '30d', label: '30日' }, { value: 'all', label: '全期間' }]} />
          </div>
        }
      >
        {rank.error ? <Notice>{rank.error}</Notice> : null}
        {rank.loading && !rank.data ? <Loading /> : null}
        {rank.data && rank.data.ranking.length === 0 ? <Empty>この期間の対局はまだありません</Empty> : null}
        {rank.data && rank.data.ranking.length > 0 ? (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="ledger">
              <thead><tr><th>順</th><th>名前</th><th className="num">対局</th><th className="num">平均順位</th><th className="num">トップ率</th><th className="num">スコア</th><th className="num">収支</th></tr></thead>
              <tbody>
                {rank.data.ranking.map((r, i) => (
                  <tr key={r.user_id} className={r.user_id === userId ? 'bg-gold/5' : ''}>
                    <td className={`font-display font-extrabold ${i === 0 ? 'text-gold2' : 'text-[#8fa1ad]'}`}>{i + 1}</td>
                    <td className="font-bold">{r.alias || r.display_name}</td>
                    <td className="num">{fmt(r.games)}</td>
                    <td className="num">{Number(r.avg_rank).toFixed(2)}</td>
                    <td className="num">{(Number(r.top_rate) * 100).toFixed(1)}%</td>
                    <td className="num"><Delta value={Number(r.total_score)} score /></td>
                    <td className="num"><Delta value={r.total_delta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Frame>

      <Frame title="あなたの対局履歴">
        {hist.error ? <Notice>{hist.error}</Notice> : null}
        {hist.loading && !hist.data ? <Loading /> : null}
        {hist.data && hist.data.games.length === 0 ? <Empty>このクラブでの対局はまだありません</Empty> : null}
        {hist.data && hist.data.games.length > 0 ? <HistoryTable games={hist.data.games} /> : null}
      </Frame>
    </div>
  );
}

export function HistoryTable({ games, showClub }: { games: GameRow[]; showClub?: boolean }) {
  return (
    <div className="-mx-4 max-h-[70dvh] overflow-auto px-4 sm:mx-0 sm:px-0">
      <table className="ledger">
        <thead>
          <tr><th>日時</th>{showClub ? <th>クラブ</th> : null}<th>卓</th><th>着順</th><th className="num">最終点</th><th className="num">スコア</th><th className="num">収支</th><th className="num">Fee</th></tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <tr key={g.game_id}>
              <td className="tabular whitespace-nowrap text-xs text-[#8fa1ad]">{dateTime(g.ended_at)}</td>
              {showClub ? <td className="max-w-[9em] truncate text-xs">{g.club_name ?? ''}</td> : null}
              <td className="whitespace-nowrap text-xs text-[#8fa1ad]">{g.player_count === 3 ? '三' : '四'}・{g.game_length === 'east' ? '東風' : '半荘'}</td>
              <td className={`font-display whitespace-nowrap font-extrabold ${g.rank === 1 ? 'text-gold2' : g.rank === g.player_count ? 'text-ruby' : ''}`}>{RANK_KANJI[g.rank - 1]}着</td>
              <td className="num">{fmt(g.final_points)}</td>
              <td className="num"><Delta value={Number(g.score)} score /></td>
              <td className="num"><Delta value={g.point_delta} /></td>
              <td className="num text-[#8fa1ad]">{g.fee ? fmt(g.fee) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

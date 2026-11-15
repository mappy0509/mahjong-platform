"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fmt } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { ROLE_LABEL, type ClubData } from '@/lib/types';
import { Loading, Notice, Tag } from '@/components/ui';
import { IncomeTab } from './IncomeTab';
import { MembersTab } from './MembersTab';
import { PointsTab } from './PointsTab';
import { RankingTab } from './RankingTab';
import { SettingsTab } from './SettingsTab';
import { TablesTab } from './TablesTab';

type TabKey = 'tables' | 'members' | 'points' | 'ranking' | 'income' | 'settings';
const TABS: { key: TabKey; glyph: string; label: string; show: (r: string | null) => boolean }[] = [
  { key: 'tables', glyph: '卓', label: '卓一覧', show: () => true },
  { key: 'members', glyph: '衆', label: 'メンバー', show: () => true },
  { key: 'points', glyph: '点', label: 'ポイント', show: () => true },
  { key: 'ranking', glyph: '績', label: '戦績', show: () => true },
  { key: 'income', glyph: '収', label: '収支', show: (r) => r === 'owner' || r === 'agent' },
  { key: 'settings', glyph: '設', label: '設定', show: (r) => r === 'owner' },
];

export function ClubLobby({ clubId, userId }: { clubId: string; userId: string }) {
  const club = useLoad<ClubData>(`/clubs/${clubId}`, { interval: 20000 });
  const [tab, setTab] = useState<TabKey>('tables');

  // タブを URL の # に残す（戻る・再読み込みで同じタブに戻れる）
  useEffect(() => {
    const h = location.hash.slice(1) as TabKey;
    if (TABS.some((t) => t.key === h)) setTab(h);
  }, []);
  const pick = (k: TabKey) => { setTab(k); history.replaceState(null, '', `#${k}`); };

  if (club.error && !club.data) {
    return (
      <main className="room p-4">
        <div className="mx-auto max-w-md space-y-3 pt-10">
          <Notice>{club.error}</Notice>
          <Link href="/" className="btn btn-line w-full">ホームへ戻る</Link>
        </div>
      </main>
    );
  }
  if (!club.data) return <main className="room"><Loading /></main>;

  const d = club.data;
  if (d.me.status !== 'active' && !d.me.isAdmin) {
    return (
      <main className="room p-4">
        <div className="frame mx-auto mt-10 max-w-md space-y-3 p-5 text-center">
          <h1 className="font-display text-xl font-extrabold tracking-[0.2em] text-gold2">{d.club.name}</h1>
          <p className="text-sm text-[#8fa1ad]">参加申請は承認待ちです。オーナーかエージェントの承認をお待ちください。</p>
          <Link href="/" className="btn btn-line w-full">ホームへ戻る</Link>
        </div>
      </main>
    );
  }

  const role = d.me.role;
  const tabs = TABS.filter((t) => t.show(role));
  const active = tabs.some((t) => t.key === tab) ? tab : 'tables';
  const reload = () => void club.reload();

  return (
    <main className="room flex min-h-dvh flex-col sm:flex-row">
      {/* タブ: 横画面では左の柱、縦画面では上の帯 */}
      <nav aria-label="クラブのメニュー" className="z-10 flex shrink-0 border-b border-line bg-ink/90 sm:sticky sm:top-0 sm:h-dvh sm:w-[76px] sm:flex-col sm:border-b-0 sm:border-r">
        <Link href="/" aria-label="ホームへ戻る" className="flex items-center justify-center px-3 text-lg text-[#8fa1ad] hover:text-gold2 sm:h-12 sm:border-b sm:border-line">
          ←
        </Link>
        <div className="flex flex-1 overflow-x-auto sm:flex-col sm:overflow-y-auto sm:overflow-x-visible">
          {tabs.map((t) => {
            const on = t.key === active;
            const badge = t.key === 'members' && d.pending_count > 0 && role !== 'player' ? d.pending_count : 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => pick(t.key)}
                aria-current={on ? 'page' : undefined}
                className={`relative flex min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2 transition-colors sm:flex-none sm:py-2.5 ${
                  on ? 'bg-panel2 text-gold2' : 'text-[#8fa1ad] hover:text-[#e9eef2]'
                }`}
              >
                <span className={`font-display text-xl font-extrabold leading-none ${on ? 'gold-text' : ''}`}>{t.glyph}</span>
                <span className="text-[10px] tracking-widest">{t.label}</span>
                {badge ? (
                  <span className="tabular absolute right-2 top-1 min-w-[18px] bg-ruby px-1 text-center text-[10px] font-bold leading-[18px] text-white">{badge}</span>
                ) : null}
                <span aria-hidden className={`absolute bg-gold ${on ? 'opacity-100' : 'opacity-0'} bottom-0 left-0 h-[2px] w-full sm:bottom-auto sm:top-0 sm:h-full sm:w-[2px]`} />
              </button>
            );
          })}
        </div>
      </nav>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-ink/70 px-3 py-2 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display truncate text-lg font-extrabold tracking-[0.15em] sm:text-xl">{d.club.name}</h1>
              {role ? <Tag tone={role === 'owner' ? 'gold' : role === 'agent' ? 'sky' : 'line'}>{ROLE_LABEL[role]}</Tag> : <Tag tone="ruby">運営として閲覧</Tag>}
              {d.club.status !== 'active' ? <Tag tone="ruby">{d.club.status === 'suspended' ? '停止中' : '閉鎖'}</Tag> : null}
            </div>
            <div className="tabular selectable text-xs text-[#8fa1ad]">ID {d.club.club_code}・{fmt(d.member_count)}人</div>
          </div>
          {d.diamonds !== null ? <Stat label="ダイヤ" value={fmt(d.diamonds)} tone="sky" /> : null}
          {d.treasury !== null && role === 'owner' ? <Stat label="金庫" value={fmt(d.treasury)} /> : null}
          <Stat label="持ち点" value={fmt(d.balance)} tone="gold" />
        </header>

        <div className="room-in mx-auto max-w-6xl p-3 sm:p-5" key={active}>
          {active === 'tables' ? <TablesTab club={d} userId={userId} onChanged={reload} /> : null}
          {active === 'members' ? <MembersTab club={d} userId={userId} onChanged={reload} /> : null}
          {active === 'points' ? <PointsTab club={d} userId={userId} onChanged={reload} /> : null}
          {active === 'ranking' ? <RankingTab club={d} userId={userId} /> : null}
          {active === 'income' ? <IncomeTab club={d} /> : null}
          {active === 'settings' ? <SettingsTab club={d} onChanged={reload} /> : null}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'sky' }) {
  return (
    <div className="text-right leading-tight">
      <div className="text-[10px] tracking-widest text-[#8fa1ad]">{label}</div>
      <div className={`tabular text-base font-bold sm:text-lg ${tone === 'gold' ? 'text-gold2' : tone === 'sky' ? 'text-sky' : ''}`}>{value}</div>
    </div>
  );
}

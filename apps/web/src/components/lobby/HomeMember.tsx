"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, fmt } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { ROLE_LABEL, type HomeData } from '@/lib/types';
import { Button, Dialog, Empty, Field, Frame, Loading, Notice, Tag } from '@/components/ui';
import { Brand } from './Brand';
import { Practice } from './Practice';

interface Me { user: { id: string; name: string; isAdmin: boolean } | null }

export function HomeMember() {
  const router = useRouter();
  const me = useLoad<Me>('/auth/me');
  const home = useLoad<HomeData>('/clubs', { interval: 15000 });
  const [dialog, setDialog] = useState<'join' | 'create' | null>(null);
  const act = useAction();
  const user = me.data?.user;

  // セッションはあるがユーザーが居ない（DB を作り直した等）→ ログアウトさせる
  const orphan = !!me.data && !user;
  useEffect(() => {
    if (orphan) void api('/auth/logout', { method: 'POST' }).finally(() => (location.href = '/login'));
  }, [orphan]);
  if (orphan) return <main className="room"><Loading /></main>;

  return (
    <main className="room px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto max-w-6xl">
        <header className="mb-3 flex items-center justify-between gap-3">
          <Brand />
          <nav className="flex items-center gap-2 text-sm">
            {user?.isAdmin ? <Link href="/admin" className="btn btn-line btn-sm">運営</Link> : null}
            <Link href="/profile" className="btn btn-line btn-sm">
              <span className="max-w-[9em] truncate">{user?.name ?? '…'}</span>
            </Link>
            <Button
              small
              busy={act.busy === 'logout'}
              onClick={() => act.run('logout', async () => { await api('/auth/logout', { method: 'POST' }); location.href = '/'; })}
            >
              ログアウト
            </Button>
          </nav>
        </header>

        {home.data?.seated ? (
          <div className="mb-3">
            <Notice kind="info">
              <span className="mr-3">「{home.data.seated.name}」に着席中です。</span>
              <Link
                href={home.data.seated.status === 'playing' ? `/table/${home.data.seated.table_id}` : `/clubs/${home.data.seated.club_id}`}
                className="font-bold text-gold2 underline underline-offset-4"
              >
                {home.data.seated.status === 'playing' ? '卓へ戻る' : 'クラブを開く'}
              </Link>
            </Notice>
          </div>
        ) : null}

        <div className="room-in grid gap-3 sm:grid-cols-[1.5fr_1fr]">
          <Frame
            title="所属クラブ"
            aside={
              <div className="flex gap-2">
                <Button small onClick={() => setDialog('join')}>参加する</Button>
                <Button small tone="gold" onClick={() => setDialog('create')}>クラブを作る</Button>
              </div>
            }
          >
            {home.error ? <Notice>{home.error}</Notice> : null}
            {home.loading && !home.data ? <Loading /> : null}
            {home.data && home.data.clubs.length === 0 && home.data.pending.length === 0 ? (
              <Empty>まだクラブに入っていません。クラブIDと招待コードで参加するか、自分のクラブを作りましょう。</Empty>
            ) : null}
            <ul className="grid gap-2 lg:grid-cols-2">
              {home.data?.clubs.map((c) => (
                <li key={c.club_id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/clubs/${c.club_id}`)}
                    className="group flex w-full items-center gap-3 border border-line bg-ink/60 p-3 text-left transition-colors hover:border-gold/70"
                  >
                    <span className="font-display flex h-11 w-11 shrink-0 items-center justify-center border border-gold/50 text-xl font-extrabold text-gold2">
                      {c.club_name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-display truncate text-base font-extrabold tracking-wider group-hover:text-gold2">{c.club_name}</span>
                        <Tag tone={c.role === 'owner' ? 'gold' : c.role === 'agent' ? 'sky' : 'line'}>{ROLE_LABEL[c.role]}</Tag>
                      </span>
                      <span className="tabular mt-0.5 block text-xs text-[#8fa1ad]">
                        ID {c.club_code}
                        {c.open_tables > 0 ? <span className="ml-2 text-jade">卓 {c.open_tables}</span> : null}
                        {c.status !== 'active' ? <span className="ml-2 text-ruby">停止中</span> : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[10px] tracking-widest text-[#8fa1ad]">持ち点</span>
                      <span className="tabular text-lg font-bold text-gold2">{fmt(c.balance)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {home.data?.pending.map((c) => (
                <li key={c.club_id} className="flex items-center gap-3 border border-dashed border-line p-3 text-sm text-[#8fa1ad]">
                  <span className="min-w-0 flex-1 truncate">{c.club_name}（ID {c.club_code}）</span>
                  <Tag>承認待ち</Tag>
                </li>
              ))}
            </ul>
          </Frame>

          <div className="grid content-start gap-3">
            <Frame title="CPUと対局">
              <Practice compact />
            </Frame>
            <Link href="/profile" className="frame flex items-center justify-between p-4 text-sm hover:border-gold/60">
              <span className="font-display font-extrabold tracking-[0.18em] text-gold2">戦績・対局履歴</span>
              <span className="text-[#8fa1ad]">見る →</span>
            </Link>
          </div>
        </div>
      </div>

      <JoinDialog open={dialog === 'join'} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void home.reload(); }} />
      <CreateDialog open={dialog === 'create'} onClose={() => setDialog(null)} onDone={(id) => router.push(`/clubs/${id}`)} />
    </main>
  );
}

function JoinDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState('');
  const act = useAction();
  return (
    <Dialog open={open} title="クラブに参加" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run('join', async () => {
            await api('/clubs/join', { body: { clubCode: code.trim(), inviteCode: invite.trim() } });
            setCode(''); setInvite('');
            onDone();
          });
        }}
      >
        <p className="text-sm text-[#8fa1ad]">オーナーかエージェントから受け取ったクラブIDと招待コードを入力します。承認されると入れます。</p>
        <Field label="クラブID（数字）" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} required />
        <Field label="招待コード" value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} maxLength={16} autoCapitalize="characters" required />
        {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
        <Button type="submit" tone="gold" busy={act.busy === 'join'} className="w-full">参加を申請する</Button>
      </form>
    </Dialog>
  );
}

function CreateDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (clubId: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const act = useAction();
  return (
    <Dialog open={open} title="クラブを作る" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run('create', async () => {
            const r = await api<{ club_id: string }>('/clubs', { body: { name, description: desc } });
            onDone(r.club_id);
          });
        }}
      >
        <Field label="クラブ名" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        <Field label="紹介文（任意）" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
        <p className="text-xs text-[#6f828f]">作成するとあなたがオーナーになり、クラブIDと招待コードが発行されます。卓を開くにはダイヤが必要です。</p>
        {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
        <Button type="submit" tone="gold" busy={act.busy === 'create'} className="w-full">作成する</Button>
      </form>
    </Dialog>
  );
}

"use client";
import { useState } from 'react';
import { api, dateTime, fmt } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { memberName, type ClubData, type LedgerRow, type Member } from '@/lib/types';
import { Button, Delta, Empty, Field, Frame, Loading, Notice, parseAmount, Segmented, Select } from '@/components/ui';

const KIND: Record<LedgerRow['kind'], string> = { issue: '発行', burn: '消却', transfer: '配布・回収', game_result: '対局', fee: 'Fee', adjust: '調整' };

interface Points { role: string; balance: number; treasury: number | null; accountBalance: number | null; ledger: LedgerRow[] }

export function PointsTab({ club, userId, onChanged }: { club: ClubData; userId: string; onChanged: () => void }) {
  const id = club.club.id;
  const role = club.me.role;
  const [account, setAccount] = useState<'me' | 'treasury'>('me');
  const pts = useLoad<Points>(`/clubs/${id}/points?account=${account}`, { interval: 15000 });
  const members = useLoad<{ members: Member[] }>(role === 'owner' || role === 'agent' ? `/clubs/${id}/members` : null);
  const after = async () => { await Promise.all([pts.reload(), members.reload()]); onChanged(); };

  const targets = (members.data?.members ?? []).filter((m) => m.status === 'active' && (role === 'owner' ? true : m.agent_id === userId));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-4">
        <Frame title="残高">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <Big label="あなたの持ち点" value={pts.data ? pts.data.balance : club.balance} gold />
            {role === 'owner' ? <Big label="クラブ金庫" value={pts.data?.treasury ?? club.treasury} /> : null}
          </div>
          <p className="mt-2 text-xs text-[#6f828f]">
            {role === 'owner'
              ? '発行したポイントは金庫に入り、そこからメンバーへ配ります。Fee も金庫に入ります。'
              : role === 'agent'
                ? '自分の持ち点の範囲で、配下のメンバーへ配布・回収できます。'
                : 'ポイントはオーナーかエージェントから配布されます。クラブの中だけで使えます。'}
          </p>
        </Frame>

        {role === 'owner' ? <IssueForm clubId={id} onDone={after} /> : null}
        {role === 'owner' || role === 'agent' ? <TransferForm clubId={id} targets={targets} owner={role === 'owner'} onDone={after} /> : null}
      </div>

      <Frame
        title="台帳"
        aside={role === 'owner' ? (
          <div className="w-40">
            <Segmented label="" value={account} onChange={setAccount} options={[{ value: 'me', label: '自分' }, { value: 'treasury', label: '金庫' }]} />
          </div>
        ) : undefined}
      >
        {pts.error ? <Notice>{pts.error}</Notice> : null}
        {pts.loading && !pts.data ? <Loading /> : null}
        {pts.data && pts.data.ledger.length === 0 ? <Empty>まだ記録がありません</Empty> : null}
        {pts.data && pts.data.ledger.length > 0 ? (
          <div className="-mx-4 max-h-[70dvh] overflow-auto px-4 sm:mx-0 sm:px-0">
            <table className="ledger">
              <thead><tr><th>日時</th><th>種別</th><th>相手・メモ</th><th className="num">増減</th><th className="num">残高</th></tr></thead>
              <tbody>
                {pts.data.ledger.map((l) => (
                  <tr key={l.seq}>
                    <td className="tabular whitespace-nowrap text-xs text-[#8fa1ad]">{dateTime(l.created_at)}</td>
                    <td className="whitespace-nowrap">{l.kind === 'transfer' ? (l.amount > 0 ? '受取' : '払出') : KIND[l.kind]}</td>
                    <td className="max-w-[14em] truncate text-xs text-[#8fa1ad]">
                      {l.counterparty_name ?? ''}{l.counterparty_name && l.memo && !l.game_id ? '・' : ''}{l.game_id ? '' : l.memo ?? ''}
                    </td>
                    <td className="num"><Delta value={l.amount} /></td>
                    <td className="num">{fmt(l.balance_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Frame>
    </div>
  );
}

function Big({ label, value, gold }: { label: string; value: number | null; gold?: boolean }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest text-[#8fa1ad]">{label}</div>
      <div className={`tabular text-3xl font-bold ${gold ? 'text-gold2' : ''}`}>{fmt(value)}</div>
    </div>
  );
}

function IssueForm({ clubId, onDone }: { clubId: string; onDone: () => Promise<void> }) {
  const [dir, setDir] = useState<'issue' | 'burn'>('issue');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const act = useAction();
  return (
    <Frame title="発行・消却">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run('issue', async () => {
            const n = parseAmount(amount);
            if (!n) throw new Error('数量は1以上の整数で入力してください');
            await api(`/clubs/${clubId}/points/issue`, { body: { amount: dir === 'issue' ? n : -n, memo } });
            setAmount(''); setMemo('');
            await onDone();
          }, dir === 'issue' ? '金庫へ発行しました' : '金庫から消却しました');
        }}
      >
        <Segmented label="操作" value={dir} onChange={setDir} options={[{ value: 'issue', label: '発行（金庫へ）' }, { value: 'burn', label: '消却（金庫から）' }]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="数量" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Field label="メモ（任意）" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} />
        </div>
        {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
        {act.done ? <Notice kind="ok" onClose={act.clear}>{act.done}</Notice> : null}
        <Button type="submit" tone={dir === 'issue' ? 'gold' : 'ruby'} busy={act.busy === 'issue'} className="w-full">{dir === 'issue' ? '発行する' : '消却する'}</Button>
      </form>
    </Frame>
  );
}

function TransferForm({ clubId, targets, owner, onDone }: { clubId: string; targets: Member[]; owner: boolean; onDone: () => Promise<void> }) {
  const [dir, setDir] = useState<'give' | 'take'>('give');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const act = useAction();
  const target = targets.find((m) => m.user_id === to);
  return (
    <Frame title="配布・回収">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run('transfer', async () => {
            const n = parseAmount(amount);
            if (!to) throw new Error('相手を選んでください');
            if (!n) throw new Error('数量は1以上の整数で入力してください');
            await api(`/clubs/${clubId}/points/transfer`, { body: { toUser: to, amount: dir === 'give' ? n : -n, memo } });
            setAmount(''); setMemo('');
            await onDone();
          }, dir === 'give' ? '配布しました' : '回収しました');
        }}
      >
        <Segmented label="操作" value={dir} onChange={setDir}
          options={[{ value: 'give', label: owner ? '配布（金庫→）' : '配布（自分→）' }, { value: 'take', label: owner ? '回収（→金庫）' : '回収（→自分）' }]} />
        <Select label="相手" value={to} onChange={(e) => setTo(e.target.value)} required>
          <option value="">選んでください</option>
          {targets.map((m) => <option key={m.user_id} value={m.user_id}>{memberName(m)}（{fmt(m.balance)}）</option>)}
        </Select>
        {targets.length === 0 ? <p className="text-xs text-[#6f828f]">{owner ? 'メンバーがいません' : '配下のメンバーがいません'}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="数量" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required
            hint={dir === 'take' && target ? `回収できるのは ${fmt(target.balance)} まで` : undefined} />
          <Field label="メモ（任意）" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} />
        </div>
        {target?.seated && dir === 'take' ? <p className="text-xs text-ruby">着席中のメンバーからは回収できません</p> : null}
        {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
        {act.done ? <Notice kind="ok" onClose={act.clear}>{act.done}</Notice> : null}
        <Button type="submit" tone="gold" busy={act.busy === 'transfer'} className="w-full">{dir === 'give' ? '配布する' : '回収する'}</Button>
      </form>
    </Frame>
  );
}

"use client";
import { useState } from 'react';
import { api, dateTime, fmt } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { memberName, ROLE_LABEL, type ClubData, type Member } from '@/lib/types';
import { Button, Dialog, Empty, Field, Frame, Loading, Notice, Select, Tag } from '@/components/ui';

export function MembersTab({ club, userId, onChanged }: { club: ClubData; userId: string; onChanged: () => void }) {
  const id = club.club.id;
  const role = club.me.role;
  const list = useLoad<{ members: Member[] }>(`/clubs/${id}/members`, { interval: 15000 });
  const act = useAction();
  const [edit, setEdit] = useState<Member | null>(null);
  const [code, setCode] = useState<string | null>(club.invite_code);

  const members = list.data?.members ?? [];
  const pending = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'active');
  const agents = active.filter((m) => m.role === 'agent');
  const nameOf = (uid: string | null) => { const m = active.find((x) => x.user_id === uid); return m ? memberName(m) : null; };
  const manage = role === 'owner' || role === 'agent';
  const canEdit = (m: Member) => role === 'owner' ? true : role === 'agent' ? m.agent_id === userId || m.user_id === userId : m.user_id === userId;
  const after = async () => { await list.reload(); onChanged(); };

  return (
    <div className="space-y-4">
      {manage ? (
        <Frame title="招待">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <Code label="クラブID" value={club.club.club_code} />
            <Code label={role === 'agent' ? 'あなたの招待コード' : '招待コード'} value={code ?? '—'} />
            <Button
              small
              busy={act.busy === 'rotate'}
              disabled={!!act.busy}
              onClick={() => act.run('rotate', async () => {
                const r = await api<{ inviteCode: string }>(`/clubs/${id}/invite-code`, { method: 'POST', body: {} });
                setCode(r.inviteCode);
              }, '招待コードを再発行しました。以前のコードは使えません。')}
            >
              再発行
            </Button>
            <p className="basis-full text-xs text-[#6f828f]">
              {role === 'agent' ? 'このコードで申請した人はあなたの配下になり、あなたが承認できます。' : 'この2つを伝えると参加申請ができます。承認するまでクラブには入れません。'}
            </p>
          </div>
        </Frame>
      ) : null}

      {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
      {act.done ? <Notice kind="ok" onClose={act.clear}>{act.done}</Notice> : null}
      {list.error ? <Notice>{list.error}</Notice> : null}

      {manage && pending.length > 0 ? (
        <Frame title={`承認待ち（${pending.length}）`}>
          <ul className="divide-y divide-line/60">
            {pending.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{memberName(m)}</span>
                  <span className="ml-2 text-xs text-[#8fa1ad]">
                    {dateTime(m.requested_at)} 申請{m.agent_id ? `・${nameOf(m.agent_id) ?? 'エージェント'}のコード` : ''}
                  </span>
                </span>
                <Button small tone="jade" busy={act.busy === `ok:${m.user_id}`} disabled={!!act.busy}
                  onClick={() => act.run(`ok:${m.user_id}`, async () => { await api(`/clubs/${id}/members/${m.user_id}/approve`, { body: { approve: true } }); await after(); })}>
                  承認
                </Button>
                <Button small tone="ruby" busy={act.busy === `ng:${m.user_id}`} disabled={!!act.busy}
                  onClick={() => act.run(`ng:${m.user_id}`, async () => { await api(`/clubs/${id}/members/${m.user_id}/approve`, { body: { approve: false } }); await after(); })}>
                  却下
                </Button>
              </li>
            ))}
          </ul>
        </Frame>
      ) : null}

      <Frame title={`メンバー（${active.length}）`}>
        {list.loading && !list.data ? <Loading /> : null}
        {list.data && active.length === 0 ? <Empty>メンバーがいません</Empty> : null}
        {active.length > 0 ? (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="ledger">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>ロール</th>
                  {manage ? <th>所属</th> : null}
                  {manage ? <th className="num">持ち点</th> : null}
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((m) => (
                  <tr key={m.user_id}>
                    <td>
                      <span className="font-bold">{memberName(m)}</span>
                      {m.alias && m.display_name && m.alias !== m.display_name ? <span className="ml-2 text-xs text-[#6f828f]">{m.display_name}</span> : null}
                      {m.user_id === userId ? <span className="ml-2 text-xs text-gold2">あなた</span> : null}
                      {m.seated ? <span className="ml-2"><Tag tone="jade">着席中</Tag></span> : null}
                    </td>
                    <td><Tag tone={m.role === 'owner' ? 'gold' : m.role === 'agent' ? 'sky' : 'line'}>{ROLE_LABEL[m.role]}</Tag></td>
                    {manage ? <td className="text-xs text-[#8fa1ad]">{m.role === 'player' ? (nameOf(m.agent_id) ?? 'オーナー直下') : '—'}</td> : null}
                    {manage ? <td className="num">{fmt(m.balance)}</td> : null}
                    <td className="text-right">
                      {canEdit(m) ? <Button small onClick={() => { act.clear(); setEdit(m); }}>{m.user_id === userId && role !== 'owner' ? '呼び名' : '操作'}</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Frame>

      {edit ? (
        <MemberDialog
          key={edit.user_id}
          clubId={id}
          me={{ id: userId, role }}
          member={edit}
          agents={agents}
          onClose={() => setEdit(null)}
          onDone={async () => { setEdit(null); await after(); }}
        />
      ) : null}
    </div>
  );
}

function Code({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest text-[#8fa1ad]">{label}</div>
      <div className="tabular selectable font-display text-2xl font-extrabold tracking-[0.2em] text-gold2">{value}</div>
    </div>
  );
}

function MemberDialog({ clubId, me, member, agents, onClose, onDone }: {
  clubId: string; me: { id: string; role: string | null }; member: Member; agents: Member[]; onClose: () => void; onDone: () => Promise<void>;
}) {
  const [alias, setAlias] = useState(member.alias ?? '');
  const [agent, setAgent] = useState(member.agent_id ?? '');
  const [confirm, setConfirm] = useState(false);
  const act = useAction();
  const owner = me.role === 'owner';
  const self = member.user_id === me.id;
  const base = `/clubs/${clubId}/members/${member.user_id}`;
  const patch = (key: string, body: unknown) => act.run(key, async () => { await api(base, { method: 'PATCH', body }); await onDone(); });

  return (
    <Dialog open title={memberName(member)} onClose={onClose}>
      <div className="space-y-4">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void patch('alias', { alias }); }}>
          <Field className="flex-1" label="クラブ内の呼び名" value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={24} placeholder={member.display_name ?? ''} />
          <Button type="submit" busy={act.busy === 'alias'} disabled={!!act.busy}>保存</Button>
        </form>

        {owner && member.role !== 'owner' ? (
          <div>
            <div className="mb-1 text-xs tracking-widest text-[#8fa1ad]">ロール</div>
            {member.role === 'player' ? (
              <Button className="w-full" busy={act.busy === 'role'} disabled={!!act.busy} onClick={() => patch('role', { role: 'agent' })}>エージェントにする（招待コードを発行）</Button>
            ) : (
              <Button className="w-full" busy={act.busy === 'role'} disabled={!!act.busy} onClick={() => patch('role', { role: 'player' })}>プレイヤーに戻す</Button>
            )}
            {member.role === 'agent' && member.invite_code ? <p className="tabular selectable mt-1 text-xs text-[#8fa1ad]">招待コード: {member.invite_code}</p> : null}
          </div>
        ) : null}

        {owner && member.role === 'player' ? (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void patch('agent', { agentId: agent || null }); }}>
            <Select className="flex-1" label="所属エージェント" value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">オーナー直下</option>
              {agents.map((a) => <option key={a.user_id} value={a.user_id}>{memberName(a)}</option>)}
            </Select>
            <Button type="submit" busy={act.busy === 'agent'} disabled={!!act.busy}>付け替え</Button>
          </form>
        ) : null}

        {!self && member.role !== 'owner' && (owner || me.role === 'agent') ? (
          <div className="border-t border-line pt-3">
            {confirm ? (
              <div className="space-y-2">
                <p className="text-sm text-[#ffd9de]">{memberName(member)} を除名します。よろしいですか？（持ち点が0・未着席が条件）</p>
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={!!act.busy} onClick={() => setConfirm(false)}>やめる</Button>
                  <Button className="flex-1" tone="ruby" busy={act.busy === 'remove'} disabled={!!act.busy}
                    onClick={() => act.run('remove', async () => { await api(base, { method: 'DELETE' }); await onDone(); })}>
                    除名する
                  </Button>
                </div>
              </div>
            ) : (
              <Button tone="ruby" className="w-full" disabled={!!act.busy} onClick={() => setConfirm(true)}>除名</Button>
            )}
          </div>
        ) : null}

        {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
      </div>
    </Dialog>
  );
}

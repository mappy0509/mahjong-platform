"use client";
import Link from 'next/link';
import { useState } from 'react';
import { api, dateTime, fmt } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { Button, Dialog, Empty, Field, Frame, Loading, Notice, Segmented, Tag } from '@/components/ui';
import { Brand } from './Brand';

interface Club { id: string; club_code: string; name: string; status: 'active' | 'suspended' | 'closed'; owner_name: string | null; diamonds: number; members: number; open_tables: number; games: number; treasury: number; points_total: number; created_at: string }
interface Setting { key: string; value: number | boolean; description: string | null; updated_at: string }
interface Audit { id: number; action: string; actor_role: string; detail: Record<string, unknown>; created_at: string; club_name: string | null; actor_name: string | null }
interface Overview { clubs: Club[]; settings: Setting[]; audit: Audit[] }
const STATUS = { active: '稼働', suspended: '停止', closed: '閉鎖' } as const;

export function AdminConsole() {
  const ov = useLoad<Overview>('/admin/overview', { interval: 30000 });
  const [grant, setGrant] = useState<Club | null>(null);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [verified, setVerified] = useState<Record<string, string>>({});
  const act = useAction();

  return (
    <main className="room px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto max-w-6xl">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-4"><Brand /><Tag tone="ruby">運営</Tag></div>
          <Link href="/" className="btn btn-line btn-sm">← ホーム</Link>
        </header>

        {ov.error ? (
          <div className="mx-auto max-w-md space-y-3 pt-8">
            <Notice>{ov.error}</Notice>
            <p className="text-sm text-[#8fa1ad]">この画面はプラットフォーム運営者だけが使えます。</p>
          </div>
        ) : null}
        {ov.loading && !ov.data ? <Loading /> : null}
        {act.error ? <div className="mb-3"><Notice onClose={act.clear}>{act.error}</Notice></div> : null}

        {ov.data ? (
          <div className="room-in space-y-4">
            <Frame title={`クラブ（${ov.data.clubs.length}）`}>
              {ov.data.clubs.length === 0 ? <Empty>クラブはまだありません</Empty> : (
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <table className="ledger">
                    <thead>
                      <tr><th>クラブ</th><th>オーナー</th><th>状態</th><th className="num">会員</th><th className="num">卓</th><th className="num">対局</th><th className="num">ポイント総量</th><th className="num">ダイヤ</th><th /></tr>
                    </thead>
                    <tbody>
                      {ov.data.clubs.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link href={`/clubs/${c.id}`} className="font-bold hover:text-gold2">{c.name}</Link>
                            <div className="tabular selectable text-xs text-[#8fa1ad]">ID {c.club_code}</div>
                          </td>
                          <td className="whitespace-nowrap text-sm">{c.owner_name ?? '—'}</td>
                          <td><Tag tone={c.status === 'active' ? 'jade' : 'ruby'}>{STATUS[c.status]}</Tag></td>
                          <td className="num">{fmt(c.members)}</td>
                          <td className="num">{fmt(c.open_tables)}</td>
                          <td className="num">{fmt(c.games)}</td>
                          <td className="num">{fmt(c.points_total)}</td>
                          <td className="num font-bold text-sky">{fmt(c.diamonds)}</td>
                          <td>
                            <div className="flex justify-end gap-1.5">
                              <Button small tone="gold" onClick={() => { act.clear(); setGrant(c); }}>ダイヤ</Button>
                              <Button small busy={act.busy === `v:${c.id}`} disabled={!!act.busy}
                                onClick={() => act.run(`v:${c.id}`, async () => {
                                  const r = await api<{ ok: boolean; problems: unknown[] }>(`/admin/clubs/${c.id}/verify`);
                                  setVerified((v) => ({ ...v, [c.id]: r.ok ? 'ok' : `${r.problems.length}件の不整合` }));
                                })}>
                                {verified[c.id] === 'ok' ? '検証 ✓' : '台帳検証'}
                              </Button>
                              <Button small tone={c.status === 'active' ? 'ruby' : 'jade'} busy={act.busy === `s:${c.id}`} disabled={!!act.busy || c.status === 'closed'}
                                onClick={() => act.run(`s:${c.id}`, async () => {
                                  await api(`/admin/clubs/${c.id}/status`, { body: { status: c.status === 'active' ? 'suspended' : 'active' } });
                                  await ov.reload();
                                })}>
                                {c.status === 'active' ? '停止' : '再開'}
                              </Button>
                            </div>
                            {verified[c.id] && verified[c.id] !== 'ok' ? <div className="mt-1 text-right text-xs text-ruby">{verified[c.id]}</div> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Frame>

            <div className="grid gap-4 lg:grid-cols-2">
              <Frame title="プラットフォーム設定">
                <table className="ledger">
                  <tbody>
                    {ov.data.settings.map((s) => (
                      <tr key={s.key}>
                        <td>
                          <div className="text-sm">{(s.description ?? s.key).replace('【要確認】', '')}</div>
                          <div className="selectable text-[11px] text-[#6f828f]">{s.key}</div>
                        </td>
                        <td className="num font-bold">{typeof s.value === 'boolean' ? (s.value ? 'はい' : 'いいえ') : fmt(s.value)}</td>
                        <td className="text-right"><Button small onClick={() => { act.clear(); setSetting(s); }}>変更</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-[#6f828f]">値はすべて仮置きです。変更は監査ログに残ります。</p>
              </Frame>

              <Frame title="監査ログ（直近40件）">
                {ov.data.audit.length === 0 ? <Empty>記録がありません</Empty> : (
                  <div className="max-h-[60dvh] overflow-auto">
                    <table className="ledger">
                      <tbody>
                        {ov.data.audit.map((a) => (
                          <tr key={a.id}>
                            <td className="tabular whitespace-nowrap text-xs text-[#8fa1ad]">{dateTime(a.created_at)}</td>
                            <td className="text-xs">
                              <span className="font-bold">{a.action}</span>
                              <span className="ml-2 text-[#8fa1ad]">{a.actor_name ?? a.actor_role}{a.club_name ? `・${a.club_name}` : ''}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Frame>
            </div>
          </div>
        ) : null}
      </div>

      {grant ? <GrantDialog key={grant.id} club={grant} onClose={() => setGrant(null)} onDone={async () => { setGrant(null); await ov.reload(); }} /> : null}
      {setting ? <SettingDialog key={setting.key} setting={setting} onClose={() => setSetting(null)} onDone={async () => { setSetting(null); await ov.reload(); }} /> : null}
    </main>
  );
}

function GrantDialog({ club, onClose, onDone }: { club: Club; onClose: () => void; onDone: () => Promise<void> }) {
  const [dir, setDir] = useState<'add' | 'sub'>('add');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const act = useAction();
  return (
    <Dialog open title={`ダイヤ — ${club.name}`} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run('grant', async () => {
            const n = /^\d{1,10}$/.test(amount.trim()) ? Number(amount.trim()) : 0;
            if (!n) throw new Error('数量は1以上の整数で入力してください');
            await api(`/admin/clubs/${club.id}/diamonds`, { body: { amount: dir === 'add' ? n : -n, memo } });
            await onDone();
          });
        }}
      >
        <p className="tabular text-sm text-[#8fa1ad]">現在の残高: <span className="font-bold text-sky">{fmt(club.diamonds)}</span></p>
        <Segmented label="操作" value={dir} onChange={setDir} options={[{ value: 'add', label: '付与' }, { value: 'sub', label: '減算（調整）' }]} />
        <Field label="数量" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Field label="メモ（任意）" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} />
        {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
        <Button type="submit" tone="gold" busy={act.busy === 'grant'} className="w-full">{dir === 'add' ? '付与する' : '減算する'}</Button>
      </form>
    </Dialog>
  );
}

function SettingDialog({ setting, onClose, onDone }: { setting: Setting; onClose: () => void; onDone: () => Promise<void> }) {
  const isBool = typeof setting.value === 'boolean';
  const [bool, setBool] = useState(setting.value === true);
  const [num, setNum] = useState(isBool ? '' : String(setting.value));
  const act = useAction();
  return (
    <Dialog open title="設定の変更" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run('set', async () => {
            let value: number | boolean = bool;
            if (!isBool) {
              if (!/^\d{1,15}$/.test(num.trim())) throw new Error('0以上の整数で入力してください');
              value = Number(num.trim());
            }
            await api('/admin/settings', { method: 'PATCH', body: { key: setting.key, value } });
            await onDone();
          });
        }}
      >
        <p className="text-sm">{(setting.description ?? setting.key).replace('【要確認】', '')}</p>
        <p className="selectable text-xs text-[#6f828f]">{setting.key}</p>
        {isBool ? (
          <Segmented label="値" value={bool ? 'y' : 'n'} onChange={(v) => setBool(v === 'y')} options={[{ value: 'y', label: 'はい' }, { value: 'n', label: 'いいえ' }]} />
        ) : (
          <Field label="値" inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} required />
        )}
        {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
        <Button type="submit" tone="gold" busy={act.busy === 'set'} className="w-full">変更する</Button>
      </form>
    </Dialog>
  );
}

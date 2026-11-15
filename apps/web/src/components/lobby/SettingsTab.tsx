"use client";
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import type { ClubData } from '@/lib/types';
import { Button, Field, Frame, Notice, parseAmount, Segmented, Toggle } from '@/components/ui';

export function SettingsTab({ club, onChanged }: { club: ClubData; onChanged: () => void }) {
  const c = club.club;
  const [name, setName] = useState(c.name);
  const [desc, setDesc] = useState(c.description ?? '');
  const [mode, setMode] = useState(c.fee_mode);
  const [target, setTarget] = useState(c.fee_target);
  const [rate, setRate] = useState((c.fee_rate_bp / 100).toString());
  const [fixed, setFixed] = useState(String(c.fee_fixed));
  const [cap, setCap] = useState(c.fee_cap === null ? '' : String(c.fee_cap));
  const [neg, setNeg] = useState(c.allow_negative);
  const [open, setOpen] = useState(c.members_can_open_tables);
  const basic = useAction();
  const fee = useAction();
  const verify = useAction();
  const [problems, setProblems] = useState<{ ledger: string; seq: number; problem: string }[] | null>(null);
  const save = (act: ReturnType<typeof useAction>, body: () => Record<string, unknown>) =>
    act.run('save', async () => { await api(`/clubs/${c.id}`, { method: 'PATCH', body: body() }); onChanged(); }, '保存しました');

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Frame title="クラブ">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(basic, () => ({ name, description: desc, members_can_open_tables: open })); }}>
          <Field label="クラブ名" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          <Field label="紹介文" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
          <Toggle label="プレイヤーも卓を開ける" checked={open} onChange={setOpen} hint="ダイヤはクラブから消費" />
          {basic.error ? <Notice onClose={basic.clear}>{basic.error}</Notice> : null}
          {basic.done ? <Notice kind="ok" onClose={basic.clear}>{basic.done}</Notice> : null}
          <Button type="submit" tone="gold" busy={!!basic.busy} className="w-full">保存する</Button>
        </form>
      </Frame>

      <Frame title="Fee・精算">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(fee, () => {
              const pct = Number(rate);
              if (!Number.isFinite(pct) || pct < 0 || pct > 50) throw new Error('率は0〜50%で入力してください');
              const fx = parseAmount(fixed);
              if (fx === null) throw new Error('固定額は0以上の整数で入力してください');
              const cp = cap.trim() === '' ? null : parseAmount(cap);
              if (cap.trim() !== '' && cp === null) throw new Error('上限は0以上の整数で入力してください（空欄で上限なし）');
              return { fee_mode: mode, fee_target: target, fee_rate_bp: Math.round(pct * 100), fee_fixed: fx, fee_cap: cp, allow_negative: neg };
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Segmented label="方式" value={mode} onChange={setMode} options={[{ value: 'rate', label: '率' }, { value: 'fixed', label: '固定額' }]} />
            <Segmented label="対象" value={target} onChange={setTarget} options={[{ value: 'winners', label: '勝者から' }, { value: 'all', label: '全員から' }]} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="率（%）" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} disabled={mode !== 'rate'} />
            <Field label="固定額" inputMode="numeric" value={fixed} onChange={(e) => setFixed(e.target.value)} disabled={mode !== 'fixed'} />
            <Field label="1人の上限" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="なし" />
          </div>
          <p className="text-xs text-[#6f828f]">
            {mode === 'rate' && target === 'winners' ? '勝ち分 × 率 を勝者から徴収します。' : null}
            {mode === 'fixed' && target === 'winners' ? '勝者から固定額（勝ち分まで）を徴収します。' : null}
            {mode === 'fixed' && target === 'all' ? '全員から固定額を徴収します。' : null}
            {mode === 'rate' && target === 'all' ? '全員から 卓の最低持ち込み × 率 を徴収します。' : null}
            {' '}進行中の対局には、開始時点の設定が使われます。
          </p>
          <Toggle label="貸し越し（負の残高）を許す" checked={neg} onChange={setNeg} hint="なしの場合、負けは残高まで" />
          {fee.error ? <Notice onClose={fee.clear}>{fee.error}</Notice> : null}
          {fee.done ? <Notice kind="ok" onClose={fee.clear}>{fee.done}</Notice> : null}
          <Button type="submit" tone="gold" busy={!!fee.busy} className="w-full">保存する</Button>
        </form>
      </Frame>

      <Frame title="台帳の検証" className="lg:col-span-2">
        <p className="mb-3 text-sm text-[#8fa1ad]">ポイント・ダイヤの台帳が改ざんされていないか（連鎖ハッシュ・残高の一致）を確かめます。</p>
        <Button busy={!!verify.busy} onClick={() => verify.run('v', async () => {
          const r = await api<{ problems: { ledger: string; seq: number; problem: string }[] }>(`/clubs/${c.id}/verify`);
          setProblems(r.problems);
        })}>
          検証する
        </Button>
        <div className="mt-3 space-y-2">
          {verify.error ? <Notice onClose={verify.clear}>{verify.error}</Notice> : null}
          {problems && problems.length === 0 ? <Notice kind="ok">問題は見つかりませんでした。</Notice> : null}
          {problems && problems.length > 0 ? (
            <Notice>
              {problems.length}件の不整合があります: {problems.slice(0, 5).map((p) => `${p.ledger}#${p.seq} ${p.problem}`).join(' / ')}
            </Notice>
          ) : null}
        </div>
      </Frame>
    </div>
  );
}

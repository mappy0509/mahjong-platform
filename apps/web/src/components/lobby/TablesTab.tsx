"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, fmt } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import type { ClubData, TableData } from '@/lib/types';
import { Button, Dialog, Empty, Field, Loading, Notice, parseAmount, Segmented, Select, Tag, Toggle } from '@/components/ui';

const WIND = ['東', '南', '西', '北'];
// 席の位置（上から見た卓。0=手前, 1=右, 2=奥, 3=左。3人卓は 0,1,3 を使う）
const POS = [
  'bottom-1 left-1/2 -translate-x-1/2',
  'right-1 top-1/2 -translate-y-1/2',
  'top-1 left-1/2 -translate-x-1/2',
  'left-1 top-1/2 -translate-y-1/2',
];
const slotOf = (players: number, seat: number) => (players === 3 && seat === 2 ? 3 : seat);

export function TablesTab({ club, userId, onChanged }: { club: ClubData; userId: string; onChanged: () => void }) {
  const router = useRouter();
  const list = useLoad<{ tables: TableData[]; balance: number }>(`/clubs/${club.club.id}/tables`, { interval: 4000 });
  const act = useAction();
  const [open, setOpen] = useState(false);

  const tables = list.data?.tables ?? [];
  const live = tables.filter((t) => t.status === 'waiting' || t.status === 'playing');
  const past = tables.filter((t) => t.status === 'finished' || t.status === 'aborted');
  const mine = live.find((t) => t.seats.some((s) => s.userId === userId));
  const mineReady = mine && (mine.status === 'playing' || mine.seats.length === mine.player_count);

  // 自分の卓が満席になったら1度だけ自動で対局画面へ（戻ってきた時に何度も飛ばさない）
  useEffect(() => {
    if (!mine || !mineReady) return;
    const key = `mj:entered:${mine.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* 保存できなくても遷移はする */ }
    router.push(`/table/${mine.id}`);
  }, [mine, mineReady, router]);

  const doAct = (key: string, path: string, body?: unknown) =>
    act.run(key, async () => {
      await api(path, { method: 'POST', body: body ?? {} });
      await list.reload();
      onChanged();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-base font-extrabold tracking-[0.18em] text-gold2">卓</h2>
        <div className="rule-gold min-w-8 flex-1" />
        {mine && mineReady ? <Link href={`/table/${mine.id}`} className="btn btn-jade btn-sm seat-pulse">自分の卓へ入る</Link> : null}
        {club.me.canOpenTable ? <Button small tone="gold" onClick={() => setOpen(true)}>卓を開く</Button> : null}
      </div>

      {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
      {list.error ? <Notice>{list.error}</Notice> : null}
      {list.loading && !list.data ? <Loading /> : null}
      {list.data && live.length === 0 ? (
        <Empty>{club.me.canOpenTable ? 'いま開いている卓はありません。「卓を開く」から始められます。' : 'いま開いている卓はありません。オーナーかエージェントが卓を開くのをお待ちください。'}</Empty>
      ) : null}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4">
        {live.map((t) => {
          const seated = t.seats.some((s) => s.userId === userId);
          const full = t.seats.length === t.player_count;
          const canClose = t.status === 'waiting' && (club.me.role === 'owner' || t.created_by === userId);
          const short = list.data ? list.data.balance < t.min_buyin : false;
          return (
            <li key={t.id} className="frame p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-display min-w-0 flex-1 truncate font-extrabold tracking-wider">{t.name}</span>
                {t.status === 'playing' ? <Tag tone="jade">対局中</Tag> : full ? <Tag tone="gold">開始待ち</Tag> : <Tag>募集中</Tag>}
              </div>

              <div className={`felt relative mx-auto aspect-[16/10] w-full max-w-[280px] ${t.status === 'playing' && !seated ? 'felt-off' : ''}`}>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center leading-tight">
                  <div className="font-display text-lg font-extrabold tracking-[0.2em] text-[#f6e3a8]">{t.game_length === 'east' ? '東風' : '半荘'}</div>
                  <div className="tabular text-[10px] tracking-widest text-[#bfe6da]">{t.player_count}人・{t.seats.length}/{t.player_count}</div>
                </div>
                {Array.from({ length: t.player_count }, (_, seat) => {
                  const s = t.seats.find((x) => x.seat === seat);
                  const pos = POS[slotOf(t.player_count, seat)];
                  if (s) {
                    const me = s.userId === userId;
                    return (
                      <div key={seat} className={`absolute ${pos} flex max-w-[46%] items-center gap-1 border px-1.5 py-0.5 text-xs ${me ? 'border-gold bg-[#1b1405]/90 text-gold2' : 'border-black/40 bg-black/55 text-[#e9eef2]'}`}>
                        <span className="font-display text-[10px] text-[#f6e3a8]">{WIND[seat]}</span>
                        <span className="truncate">{s.name}</span>
                      </div>
                    );
                  }
                  if (t.status !== 'waiting' || mine) {
                    return <div key={seat} className={`absolute ${pos} border border-dashed border-white/25 px-2 py-0.5 text-[10px] text-white/40`}>{WIND[seat]}・空席</div>;
                  }
                  return (
                    <button
                      key={seat}
                      type="button"
                      disabled={!!act.busy || short}
                      onClick={() => doAct(`join:${t.id}:${seat}`, `/tables/${t.id}/join`, { seat })}
                      className={`absolute ${pos} whitespace-nowrap border border-gold/80 bg-black/50 px-2 py-0.5 text-xs font-bold text-gold2 hover:bg-gold hover:text-[#1b1405] disabled:opacity-40`}
                    >
                      {act.busy === `join:${t.id}:${seat}` ? '…' : `${WIND[seat]}に座る`}
                    </button>
                  );
                })}
              </div>

              <dl className="tabular mt-3 grid grid-cols-2 gap-x-3 text-xs text-[#8fa1ad]">
                <div className="flex justify-between"><dt>レート</dt><dd className="text-[#e9eef2]">{fmt(t.rate)}</dd></div>
                <div className="flex justify-between"><dt>最低持込</dt><dd className={short && !seated ? 'text-ruby' : 'text-[#e9eef2]'}>{fmt(t.min_buyin)}</dd></div>
              </dl>
              <RuleLine t={t} />

              <div className="mt-2 flex flex-wrap gap-2">
                {seated && (t.status === 'playing' || full) ? <Link href={`/table/${t.id}`} className="btn btn-jade btn-sm flex-1">卓へ入る</Link> : null}
                {seated && t.status === 'waiting' ? (
                  <Button small className="flex-1" busy={act.busy === `leave:${t.id}`} disabled={!!act.busy} onClick={() => doAct(`leave:${t.id}`, `/tables/${t.id}/leave`)}>離席</Button>
                ) : null}
                {canClose ? (
                  <Button small tone="ruby" busy={act.busy === `close:${t.id}`} disabled={!!act.busy} onClick={() => doAct(`close:${t.id}`, `/tables/${t.id}/close`)}>閉じる</Button>
                ) : null}
                {!seated && t.status === 'waiting' && short ? <span className="text-xs text-ruby">持ち点が足りません</span> : null}
                {!seated && mine && t.status === 'waiting' && !full ? <span className="text-xs text-[#6f828f]">別の卓に着席中</span> : null}
              </div>
            </li>
          );
        })}
      </ul>

      {past.length > 0 ? (
        <details className="frame p-3">
          <summary className="cursor-pointer text-sm text-[#8fa1ad]">直近24時間に終わった卓（{past.length}）</summary>
          <ul className="mt-2 divide-y divide-line/60 text-sm">
            {past.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="truncate text-xs text-[#8fa1ad]">{t.seats.map((s) => s.name).join('・')}</span>
                <Tag tone={t.status === 'finished' ? 'line' : 'ruby'}>{t.status === 'finished' ? '終局' : '中止'}</Tag>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <OpenTableDialog club={club} open={open} onClose={() => setOpen(false)} onDone={() => { setOpen(false); void list.reload(); onChanged(); }} />
    </div>
  );
}

function RuleLine({ t }: { t: TableData }) {
  const r = t.rules as Record<string, unknown>;
  const on = (k: string, def = true) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : def);
  const bits = [
    `${fmt(Number(r.start_points))}持ち`,
    r.aka === false || r.aka === 0 ? '赤なし' : '赤あり',
    on('kuitan') ? '喰いタンあり' : '喰いタンなし',
    on('tobi') ? 'トビあり' : 'トビなし',
  ];
  return <p className="mt-1 truncate text-[11px] text-[#6f828f]">{bits.join('／')}</p>;
}

function OpenTableDialog({ club, open, onClose, onDone }: { club: ClubData; open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [players, setPlayers] = useState<3 | 4>(4);
  const [length, setLength] = useState<'east' | 'south'>('south');
  const [rate, setRate] = useState('100');
  const [buyin, setBuyin] = useState('3000');
  const [rules, setRules] = useState({ aka: true, kuitan: true, tobi: true, extension: true, kiriageMangan: false, ippatsu: true, uraDora: true });
  const [timeBase, setTimeBase] = useState(5);
  const act = useAction();
  const cost = players === 4 ? club.cost_4p : club.cost_3p;
  const lack = club.diamonds !== null && club.diamonds < cost;
  const set = (k: keyof typeof rules) => (v: boolean) => setRules((r) => ({ ...r, [k]: v }));

  return (
    <Dialog open={open} title="卓を開く" onClose={onClose} wide>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void act.run('open', async () => {
            const r = parseAmount(rate);
            const b = parseAmount(buyin);
            if (r === null || r < 1) throw new Error('レートは1以上の整数で入力してください');
            if (b === null) throw new Error('最低持ち込みは0以上の整数で入力してください');
            await api(`/clubs/${club.club.id}/tables`, {
              body: { name: name.trim() || `${length === 'east' ? '東風' : '半荘'}卓`, players, length, rate: r, minBuyin: b, rules: { ...rules, timeBase } },
            });
            onDone();
          });
        }}
      >
        <div className="space-y-3">
          <Field label="卓の名前" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={`${length === 'east' ? '東風' : '半荘'}卓`} />
          <div className="grid grid-cols-2 gap-3">
            <Segmented label="人数" value={players} onChange={setPlayers} options={[{ value: 4, label: '四人' }, { value: 3, label: '三人' }]} />
            <Segmented label="長さ" value={length} onChange={setLength} options={[{ value: 'south', label: '半荘' }, { value: 'east', label: '東風' }]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="レート" inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} hint="スコア1.0あたりのポイント" required />
            <Field label="最低持ち込み" inputMode="numeric" value={buyin} onChange={(e) => setBuyin(e.target.value)} hint="着席に必要な持ち点" required />
          </div>
          <Select label="1手の持ち時間" value={timeBase} onChange={(e) => setTimeBase(Number(e.target.value))}>
            {[3, 5, 8, 10, 15].map((s) => <option key={s} value={s}>{s}秒</option>)}
          </Select>
        </div>
        <div className="space-y-2">
          <div className="text-xs tracking-widest text-[#8fa1ad]">ルール（{players === 4 ? '25,000点持ち 30,000点返し' : '35,000点持ち 40,000点返し・北抜き'}）</div>
          <Toggle label="赤ドラ" checked={rules.aka} onChange={set('aka')} />
          <Toggle label="喰いタン" checked={rules.kuitan} onChange={set('kuitan')} />
          <Toggle label="一発" checked={rules.ippatsu} onChange={set('ippatsu')} />
          <Toggle label="裏ドラ" checked={rules.uraDora} onChange={set('uraDora')} />
          <Toggle label="トビ終了" checked={rules.tobi} onChange={set('tobi')} hint="0点未満で終局" />
          <Toggle label="延長（西入）" checked={rules.extension} onChange={set('extension')} />
          <Toggle label="切り上げ満貫" checked={rules.kiriageMangan} onChange={set('kiriageMangan')} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <p className={`tabular text-sm ${lack ? 'text-ruby' : 'text-[#8fa1ad]'}`}>
            開設でダイヤを <span className="font-bold text-sky">{fmt(cost)}</span> 消費します
            {club.diamonds !== null ? <>（残り {fmt(club.diamonds)}）</> : null}。開始前に閉じてもダイヤは戻りません。
          </p>
          {act.error ? <Notice onClose={act.clear}>{act.error}</Notice> : null}
          <Button type="submit" tone="gold" busy={act.busy === 'open'} className="w-full">この内容で卓を開く</Button>
        </div>
      </form>
    </Dialog>
  );
}

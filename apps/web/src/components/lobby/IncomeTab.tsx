"use client";
import { dateTime, fmt } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import type { ClubData } from '@/lib/types';
import { Delta, Empty, Frame, Loading, Notice } from '@/components/ui';

interface Down { user_id: string; display_name: string; alias: string | null; status: string; balance: number; games: number; game_result: number; fee_paid: number; received: number; returned: number }
interface Income {
  role: 'owner' | 'agent';
  downline?: Down[];
  fee?: { day: string; games: number; fee_total: number }[];
  diamonds?: number;
  diamondLedger?: { seq: number; kind: string; amount: number; balance_after: number; memo: string | null; created_at: string; table_name: string | null }[];
  agents?: { user_id: string; display_name: string; alias: string | null; balance: number; downline: Down[] }[];
  totals?: { issued: number; burned: number; fee_total: number };
}
const DKIND: Record<string, string> = { grant: '付与', club_create: 'クラブ作成', table_open: '卓の開設', maintenance: '維持費', adjust: '調整' };

export function IncomeTab({ club }: { club: ClubData }) {
  const inc = useLoad<Income>(`/clubs/${club.club.id}/income`);
  if (inc.error) return <Notice>{inc.error}</Notice>;
  if (!inc.data) return <Loading />;
  const d = inc.data;

  if (d.role === 'agent') {
    return (
      <Frame title="配下の集計">
        <DownTable rows={d.downline ?? []} />
      </Frame>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Frame title="概況" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Cell label="Fee 収入（累計）" value={fmt(d.totals?.fee_total)} gold />
          <Cell label="発行（累計）" value={fmt(d.totals?.issued)} />
          <Cell label="消却（累計）" value={fmt(d.totals?.burned)} />
          <Cell label="金庫" value={fmt(club.treasury)} />
          <Cell label="ダイヤ" value={fmt(d.diamonds)} sky />
        </div>
      </Frame>

      <Frame title="Fee 収入（日別）">
        {(d.fee ?? []).length === 0 ? <Empty>まだ Fee 収入はありません</Empty> : (
          <table className="ledger">
            <thead><tr><th>日付</th><th className="num">対局</th><th className="num">Fee</th></tr></thead>
            <tbody>
              {d.fee!.map((f) => (
                <tr key={f.day}><td className="tabular">{String(f.day).slice(0, 10)}</td><td className="num">{fmt(f.games)}</td><td className="num text-gold2">{fmt(f.fee_total)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Frame>

      <Frame title="ダイヤの出入り">
        {(d.diamondLedger ?? []).length === 0 ? <Empty>まだ記録がありません</Empty> : (
          <div className="max-h-[50dvh] overflow-auto">
            <table className="ledger">
              <thead><tr><th>日時</th><th>内容</th><th className="num">増減</th><th className="num">残り</th></tr></thead>
              <tbody>
                {d.diamondLedger!.map((l) => (
                  <tr key={l.seq}>
                    <td className="tabular whitespace-nowrap text-xs text-[#8fa1ad]">{dateTime(l.created_at)}</td>
                    <td className="max-w-[12em] truncate">{DKIND[l.kind] ?? l.kind}{l.table_name ? `「${l.table_name}」` : ''}</td>
                    <td className="num"><Delta value={l.amount} /></td>
                    <td className="num">{fmt(l.balance_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Frame>

      <Frame title="エージェント別" className="lg:col-span-2">
        {(d.agents ?? []).length === 0 ? <Empty>エージェントはいません</Empty> : (
          <div className="space-y-4">
            {d.agents!.map((a) => (
              <div key={a.user_id}>
                <div className="mb-1 flex items-baseline gap-3">
                  <span className="font-bold text-sky">{a.alias || a.display_name}</span>
                  <span className="tabular text-xs text-[#8fa1ad]">持ち点 {fmt(a.balance)}・配下 {a.downline.length}人</span>
                </div>
                <DownTable rows={a.downline} />
              </div>
            ))}
          </div>
        )}
      </Frame>
    </div>
  );
}

function Cell({ label, value, gold, sky }: { label: string; value: string; gold?: boolean; sky?: boolean }) {
  return (
    <div>
      <div className="text-[10px] tracking-widest text-[#8fa1ad]">{label}</div>
      <div className={`tabular text-2xl font-bold ${gold ? 'text-gold2' : sky ? 'text-sky' : ''}`}>{value}</div>
    </div>
  );
}

function DownTable({ rows }: { rows: Down[] }) {
  if (rows.length === 0) return <Empty>配下のメンバーはいません</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="ledger">
        <thead><tr><th>名前</th><th className="num">持ち点</th><th className="num">対局</th><th className="num">対局収支</th><th className="num">Fee</th><th className="num">受取</th><th className="num">返却</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td className="font-bold">{r.alias || r.display_name}{r.status === 'removed' ? <span className="ml-2 text-xs text-[#6f828f]">除名済</span> : null}</td>
              <td className="num">{fmt(r.balance)}</td>
              <td className="num">{fmt(r.games)}</td>
              <td className="num"><Delta value={r.game_result} /></td>
              <td className="num">{fmt(r.fee_paid)}</td>
              <td className="num">{fmt(r.received)}</td>
              <td className="num">{fmt(r.returned)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

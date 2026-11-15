/** ブラウザ → 自分のサーバー（/api/...）。DB には直接つながない。 */
export class ApiFail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: opts.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiFail(0, 'network', '通信できませんでした。電波の状態を確認してください');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiFail(res.status, json?.error ?? 'error', json?.message ?? `エラーが発生しました（${res.status}）`);
  }
  return json as T;
}

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'エラーが発生しました');

/** 対局サーバーの CPU 練習卓を作る（未ログインでも可）。返り値は卓ID。 */
export async function createPractice(players: 3 | 4, length: 'east' | 'south'): Promise<string> {
  const base = (process.env.NEXT_PUBLIC_TABLE_SERVER_URL ?? '').replace(/\/$/, '');
  if (!base) throw new ApiFail(0, 'not_configured', '対局サーバーのURLが設定されていません');
  let res: Response;
  try {
    res = await fetch(`${base}/practice`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ players, length }),
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    throw new ApiFail(0, 'network', '対局サーバーに接続できませんでした');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || typeof json?.id !== 'string') throw new ApiFail(res.status, 'practice_failed', '練習卓を作れませんでした。少し待ってからお試しください');
  return json.id;
}

export const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : Math.trunc(n).toLocaleString('ja-JP'));
export const signed = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(Math.trunc(n)).toLocaleString('ja-JP')}`;
export const signedScore = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`;

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

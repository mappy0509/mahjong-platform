import { normalizeRules, type Rules } from '@mj/core';

/** 卓を開くときに画面から切り替えられるルール（これ以外のキーは受け付けない）。 */
const BOOL_KEYS = ['aka', 'kuitan', 'tobi', 'extension', 'kiriageMangan', 'ippatsu', 'uraDora', 'kanDora', 'agariYame'] as const;
const TIME_BASE = [3, 5, 8, 10, 15];
const TIME_BANK = [0, 10, 20, 30, 60];

/**
 * 画面の入力 → open_table の p_rules。
 * DB が見るキー（start_points / return_points / uma）は触らず、エンジン用のキー（camelCase）だけを足す。
 */
export function toDbRules(input: unknown): Record<string, unknown> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of BOOL_KEYS) if (typeof src[k] === 'boolean') out[k] = src[k];
  if (TIME_BASE.includes(src.timeBase as number)) out.timeBase = src.timeBase;
  if (TIME_BANK.includes(src.timeBank as number)) out.timeBank = src.timeBank;
  return out;
}

/** tables の行 → 対局サーバーへ渡す `Rules`（@mj/core）。 */
export function toCoreRules(t: { player_count: number; game_length: string; rules: Record<string, unknown> }): Rules {
  const r = t.rules ?? {};
  const partial: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    // snake_case のキーは DB 用（下で個別に写す）。エンジン用は camelCase
    if (!k.includes('_')) partial[k] = v;
  }
  // DB 既定ルールの aka は枚数（3 / 2）。エンジンは有無だけ
  partial.aka = typeof r.aka === 'boolean' ? r.aka : r.aka !== 0;
  return normalizeRules({
    ...(partial as Partial<Rules>),
    players: t.player_count === 3 ? 3 : 4,
    length: t.game_length === 'east' ? 'east' : 'south',
    startPoints: Number(r.start_points),
    returnPoints: Number(r.return_points),
    uma: Array.isArray(r.uma) ? (r.uma as number[]).map(Number) : undefined,
  } as Partial<Rules>);
}

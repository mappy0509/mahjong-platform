/** API が返すエラー。code は機械用、message は画面にそのまま出す日本語。 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? MESSAGES[code] ?? code);
  }
}

export const MESSAGES: Record<string, string> = {
  not_authenticated: 'ログインが必要です',
  forbidden: 'この操作を行う権限がありません',
  not_found: '見つかりません',
  bad_request: '入力内容を確認してください',
  invalid_json: 'リクエストの形式が正しくありません',
  bad_origin: '不正なリクエスト元です',
  rate_limited: '操作が多すぎます。少し待ってからやり直してください',
  server_error: 'サーバーでエラーが発生しました',
  conflict: 'すでに登録されています',
  // 認証
  invalid_email: 'メールアドレスの形式が正しくありません',
  weak_password: 'パスワードは8文字以上にしてください',
  invalid_display_name: '表示名は1〜24文字で入力してください',
  email_taken: 'このメールアドレスは登録済みです',
  invalid_credentials: 'メールアドレスかパスワードが違います',
  auth_unavailable: '認証サービスに接続できません',
  // クラブ
  club_limit_reached: '所有できるクラブ数の上限に達しています',
  invalid_club_or_code: 'クラブIDか招待コードが違います',
  already_member: 'すでにこのクラブのメンバーです',
  not_pending: '承認待ちの申請ではありません',
  not_member: 'メンバーではありません',
  cannot_remove_owner: 'オーナーは除名できません',
  balance_not_zero: 'ポイント残高が0でないため除名できません（先に回収してください）',
  member_is_seated: '着席中のメンバーには行えません',
  agent_has_downline: '配下のメンバーが残っています（先に付け替えてください）',
  invalid_role: 'ロールの指定が正しくありません',
  not_active_member: '有効なメンバーではありません',
  cannot_change_owner: 'オーナーのロールは変更できません',
  target_must_be_active_player: '対象は有効なプレイヤーである必要があります',
  agent_not_found: 'エージェントが見つかりません',
  invalid_settings: '設定の形式が正しくありません',
  invalid_settings_key: '変更できない設定項目が含まれています',
  invalid_default_rules: '既定ルールの形式が正しくありません',
  club_not_found: 'クラブが見つかりません',
  club_not_active: 'このクラブは現在利用できません',
  // 経済
  invalid_amount: '数量が正しくありません',
  target_not_active_member: '相手が有効なメンバーではありません',
  self_transfer: '自分自身には配布・回収できません',
  insufficient_balance: '残高が足りません',
  insufficient_points: 'ポイント残高が足りません',
  insufficient_diamonds: 'ダイヤが足りません',
  // 卓
  invalid_player_count: '人数は3人か4人です',
  invalid_game_length: '東風か半荘を選んでください',
  invalid_rate: 'レートが正しくありません',
  invalid_min_buyin: '最低持ち込みが正しくありません',
  invalid_rules: 'ルールの指定が正しくありません',
  table_not_found: '卓が見つかりません',
  table_not_waiting: 'この卓はすでに開始または終了しています',
  already_seated: 'すでに着席しています',
  seated_elsewhere: '別の卓に着席中です（先に離席してください）',
  insufficient_balance_for_table: '持ち点が最低持ち込みに足りません',
  table_full: '満席です',
  invalid_seat: '席の指定が正しくありません',
  seat_taken: 'その席は埋まっています',
  not_seated: '着席していません',
  table_not_full: '卓が満席ではありません',
  table_already_has_game: 'この卓の対局はすでに開始されています',
  game_not_found: '対局が見つかりません',
  game_not_playing: '対局は進行中ではありません',
  seats_mismatch: '席の並びがDBと一致しません',
  // 設定
  setting_not_found: '設定項目が見つかりません',
  invalid_setting_type: '設定値の型が正しくありません',
  invalid_setting_value: '設定値は0以上の整数で入力してください',
  profile_not_found: 'プロフィールが見つかりません',
};

const NOT_FOUND = new Set(['table_not_found', 'club_not_found', 'game_not_found', 'setting_not_found', 'profile_not_found']);

interface PgLike { code?: string; message?: string; constraint?: string }

/** Postgres のエラー（RPC の raise exception を含む）を ApiError に直す。 */
export function fromPgError(e: unknown): ApiError | null {
  const err = e as PgLike;
  if (!err || typeof err.code !== 'string' || !/^[0-9A-Z]{5}$/.test(err.code)) return null;
  const raw = String(err.message ?? '');
  const key = raw.split(':')[0].trim();
  switch (err.code) {
    case '42501':
      return new ApiError(403, 'forbidden');
    case '28000':
      return new ApiError(401, 'not_authenticated');
    case 'P0002':
      return new ApiError(404, MESSAGES[key] ? key : 'not_found');
    case 'P0001': {
      if (NOT_FOUND.has(key)) return new ApiError(404, key);
      if (/^insufficient/.test(key)) return new ApiError(400, key, MESSAGES[key] ?? '残高が足りません');
      if (MESSAGES[key]) return new ApiError(400, key);
      return new ApiError(400, /^[a-z0-9_]{1,64}$/.test(key) ? key : 'bad_request', MESSAGES.bad_request);
    }
    case '23505':
      return new ApiError(409, 'conflict');
    case '23514':
    case '23502':
    case '22P02':
    case '22003':
    case '22001':
    case '22023':
      return new ApiError(400, 'bad_request');
    default:
      return null;
  }
}

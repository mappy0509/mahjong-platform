export type Role = 'owner' | 'agent' | 'player';
export const ROLE_LABEL: Record<Role, string> = { owner: 'オーナー', agent: 'エージェント', player: 'プレイヤー' };

export interface HomeData {
  clubs: { club_id: string; club_code: string; club_name: string; role: Role; balance: number; status: string; open_tables: number }[];
  pending: { club_id: string; club_code: string; club_name: string; requested_at: string }[];
  seated: { table_id: string; club_id: string; name: string; status: string } | null;
}

export interface ClubData {
  club: {
    id: string; club_code: string; name: string; description: string | null; owner_id: string; status: string;
    fee_mode: 'rate' | 'fixed'; fee_target: 'winners' | 'all'; fee_rate_bp: number; fee_fixed: number; fee_cap: number | null;
    allow_negative: boolean; members_can_open_tables: boolean;
  };
  me: { status: string; role: Role | null; alias: string | null; agentId: string | null; isAdmin: boolean; canOpenTable: boolean };
  member_count: number; pending_count: number; balance: number; treasury: number | null; diamonds: number | null;
  invite_code: string | null; cost_4p: number; cost_3p: number; max_rate: number; owner_name: string | null;
}

export interface Seat { seat: number; userId: string; name: string }
export interface TableData {
  id: string; club_id: string; name: string; player_count: 3 | 4; game_length: 'east' | 'south'; rate: number; min_buyin: number;
  rules: Record<string, unknown>; status: 'waiting' | 'playing' | 'finished' | 'aborted'; created_by: string; diamond_cost: number;
  created_at: string; started_at: string | null; finished_at: string | null; seats: Seat[];
}

export interface Member {
  user_id: string; display_name: string | null; alias: string | null; role: Role; status: 'active' | 'pending';
  agent_id: string | null; requested_at: string; approved_at: string | null; balance: number | null; invite_code: string | null; seated: boolean;
}

export interface LedgerRow {
  seq: number; kind: 'issue' | 'burn' | 'transfer' | 'game_result' | 'fee' | 'adjust'; amount: number; balance_after: number;
  counterparty_name: string | null; actor_name: string | null; memo: string | null; created_at: string; game_id: string | null;
}

export interface GameRow {
  game_id: string; club_id: string; table_id: string; ended_at: string; player_count: number; game_length: string; rate: number;
  seat: number; rank: number; final_points: number; score: number; point_delta: number; fee: number; club_name?: string; table_name?: string;
}

export const memberName = (m: { alias: string | null; display_name: string | null }) => m.alias || m.display_name || '（非公開）';

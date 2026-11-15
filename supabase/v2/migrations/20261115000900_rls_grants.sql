-- =====================================================================
-- v2 / 0900 RLS と権限
-- ・全テーブル RLS 有効。既定は拒否。
-- ・authenticated には SELECT だけ（RLS で絞る）。INSERT/UPDATE/DELETE のポリシーは作らない。
-- ・anon には何も見せない（テーブルも関数も）。
-- ・service_role も表の直接書き込みは不可（RPC 経由のみ）。
-- =====================================================================

-- ---- RLS 有効化 ----
alter table public.platform_settings enable row level security;
alter table public.profiles          enable row level security;
alter table public.platform_admins   enable row level security;
alter table public.audit_log         enable row level security;
alter table public.clubs             enable row level security;
alter table public.club_members      enable row level security;
alter table public.club_invite_codes enable row level security;
alter table public.point_ledger      enable row level security;
alter table public.point_balances    enable row level security;
alter table public.diamond_ledger    enable row level security;
alter table public.diamond_balances  enable row level security;
alter table public.tables            enable row level security;
alter table public.table_seats       enable row level security;
alter table public.games             enable row level security;
alter table public.game_players      enable row level security;
alter table public.game_rounds       enable row level security;
alter table private.ledger_heads     enable row level security;

-- ---- SELECT ポリシー（authenticated のみ） ----
create policy settings_read on public.platform_settings for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated
  using (private.can_view_profile(id));

create policy admins_read on public.platform_admins for select to authenticated
  using (user_id = auth.uid() or private.is_platform_admin());

create policy audit_read on public.audit_log for select to authenticated
  using (private.is_platform_admin() or (club_id is not null and private.is_club_owner(club_id)));

create policy clubs_read on public.clubs for select to authenticated
  using (private.is_active_member(id) or private.is_platform_admin()
         or exists (select 1 from public.club_members m where m.club_id = clubs.id and m.user_id = auth.uid() and m.status = 'pending'));

create policy members_read on public.club_members for select to authenticated
  using (private.can_view_member_row(club_id, user_id, agent_id, status));

create policy invite_codes_read on public.club_invite_codes for select to authenticated
  using (private.is_club_owner(club_id) or private.is_platform_admin()
         or (agent_id = auth.uid() and private.member_role(club_id) = 'agent'));

create policy point_ledger_read on public.point_ledger for select to authenticated
  using (private.can_view_point_account(club_id, account_id));

create policy point_balances_read on public.point_balances for select to authenticated
  using (private.can_view_point_account(club_id, account_id));

create policy diamond_ledger_read on public.diamond_ledger for select to authenticated
  using (private.is_club_owner(club_id) or private.is_platform_admin());

create policy diamond_balances_read on public.diamond_balances for select to authenticated
  using (private.is_club_owner(club_id) or private.is_platform_admin());

create policy tables_read on public.tables for select to authenticated
  using (private.is_active_member(club_id) or private.is_platform_admin());

create policy seats_read on public.table_seats for select to authenticated
  using (exists (select 1 from public.tables t where t.id = table_seats.table_id
                  and (private.is_active_member(t.club_id) or private.is_platform_admin())));

create policy games_read on public.games for select to authenticated
  using (private.is_active_member(club_id) or private.is_platform_admin());

create policy game_players_read on public.game_players for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_players.game_id
                  and (private.is_active_member(g.club_id) or private.is_platform_admin())));

-- 局の結果は終局（精算済み）後のみ。対局中の情報を漏らさない
create policy game_rounds_read on public.game_rounds for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_rounds.game_id and g.status = 'settled'
                  and (private.is_active_member(g.club_id) or private.is_platform_admin())));

-- ---- テーブル権限 ----
revoke all on all tables    in schema public  from public, anon, authenticated, service_role;
revoke all on all sequences in schema public  from public, anon, authenticated, service_role;
revoke all on all tables    in schema private from public, anon, authenticated, service_role;

grant select on public.platform_settings, public.profiles, public.platform_admins, public.audit_log,
                public.clubs, public.club_members, public.club_invite_codes,
                public.point_ledger, public.point_balances, public.diamond_ledger, public.diamond_balances,
                public.tables, public.table_seats, public.games, public.game_players, public.game_rounds
  to authenticated, service_role;

-- ---- 関数権限 ----
revoke all on all functions in schema public  from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, authenticated, service_role;

-- RLS ポリシー内で評価される補助関数（authenticated の権限で呼ばれるため execute が要る）
grant execute on function
  private.is_platform_admin(), private.member_role(uuid, uuid), private.is_club_owner(uuid),
  private.is_active_member(uuid), private.is_my_downline(uuid, uuid),
  private.can_view_point_account(uuid, uuid), private.can_view_member_row(uuid, uuid, uuid, text),
  private.can_view_profile(uuid)
  to authenticated, service_role;

-- ユーザー向け RPC
grant execute on function
  public.update_profile(text, text),
  public.create_club(text, text),
  public.request_join_club(text, text),
  public.approve_member(uuid, uuid, boolean),
  public.remove_member(uuid, uuid),
  public.set_member_role(uuid, uuid, text),
  public.set_member_agent(uuid, uuid, uuid),
  public.set_alias(uuid, uuid, text),
  public.rotate_invite_code(uuid),
  public.update_club_settings(uuid, jsonb),
  public.set_club_status(uuid, text),
  public.grant_diamonds(uuid, bigint, text),
  public.issue_points(uuid, bigint, text),
  public.transfer_points(uuid, uuid, bigint, text),
  public.verify_ledgers(uuid),
  public.open_table(uuid, text, int, text, bigint, bigint, jsonb),
  public.join_table(uuid, int),
  public.leave_table(uuid),
  public.close_table(uuid),
  public.my_game_history(uuid, int, timestamptz),
  public.my_balances(),
  public.club_ranking(uuid, timestamptz, timestamptz, int),
  public.agent_downline_summary(uuid, uuid, timestamptz, timestamptz),
  public.club_fee_income(uuid, timestamptz, timestamptz)
  to authenticated;

-- 対局サーバー（service_role）専用
grant execute on function
  public.start_game(uuid, uuid),
  public.record_round(uuid, int, jsonb),
  public.abort_game(uuid, text),
  public.settle_game(uuid, int[], jsonb, text),
  public.charge_club_maintenance(uuid),
  public.verify_ledgers(uuid)
  to service_role;

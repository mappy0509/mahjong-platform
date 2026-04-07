-- =============================================
-- Supabase Migration: Initial Schema
-- =============================================

-- Enable necessary extensions
create extension if not exists "pgcrypto" schema extensions;

-- ===== ENUMS =====

create type user_role as enum ('platformer', 'club_owner', 'agent', 'player');
create type club_member_role as enum ('owner', 'agent', 'member');
create type room_status as enum ('waiting', 'playing', 'finished');
create type point_transaction_type as enum ('deposit', 'withdrawal', 'game_result', 'game_fee', 'adjustment');
create type invitation_status as enum ('pending', 'accepted', 'rejected', 'expired');

-- ===== TABLES (all tables first, then policies) =====

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  role user_role not null default 'player',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  invite_code text unique not null default encode(extensions.gen_random_bytes(6), 'hex'),
  owner_id uuid not null references profiles(id),
  is_approval_required boolean not null default false,
  default_rules jsonb,
  fee_percent double precision not null default 0,
  gps_restriction_km double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table club_memberships (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role club_member_role not null default 'member',
  alias text,
  created_at timestamptz not null default now(),
  unique(club_id, user_id)
);

create table game_rooms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  name text not null,
  status room_status not null default 'waiting',
  rules jsonb not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table game_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references game_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id),
  seat int not null check (seat >= 0 and seat <= 3),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique(room_id, seat),
  unique(room_id, user_id)
);

create table game_sessions (
  room_id uuid primary key references game_rooms(id) on delete cascade,
  state jsonb not null,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table player_views (
  room_id uuid not null references game_rooms(id) on delete cascade,
  seat_index int not null check (seat_index >= 0 and seat_index <= 3),
  user_id uuid not null references profiles(id),
  view jsonb not null default '{}',
  round_result jsonb,
  final_result jsonb,
  version int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, seat_index)
);

create table game_event_logs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references game_rooms(id) on delete cascade,
  sequence int not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(room_id, sequence)
);

create table game_results (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references game_rooms(id) on delete cascade,
  round_number int not null,
  result_data jsonb not null,
  score_changes jsonb not null,
  created_at timestamptz not null default now()
);

create table club_invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  inviter_id uuid not null references profiles(id),
  invitee_id uuid references profiles(id),
  target_role club_member_role not null default 'member',
  status invitation_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz
);

create table point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  club_id uuid not null references clubs(id),
  type point_transaction_type not null,
  amount int not null,
  balance_before int not null,
  balance_after int not null,
  reference_id text,
  description text,
  prev_hash text,
  hash text,
  created_at timestamptz not null default now()
);

-- ===== INDEXES =====

create index idx_event_logs_room on game_event_logs(room_id);
create index idx_game_results_room on game_results(room_id);
create index idx_invitations_club_status on club_invitations(club_id, status);
create index idx_invitations_invitee on club_invitations(invitee_id, status);
create index idx_point_tx_user_club on point_transactions(user_id, club_id);
create index idx_point_tx_club on point_transactions(club_id);

-- ===== ENABLE RLS =====

alter table profiles enable row level security;
alter table clubs enable row level security;
alter table club_memberships enable row level security;
alter table game_rooms enable row level security;
alter table game_participants enable row level security;
alter table game_sessions enable row level security;
alter table player_views enable row level security;
alter table game_event_logs enable row level security;
alter table game_results enable row level security;
alter table club_invitations enable row level security;
alter table point_transactions enable row level security;

-- ===== RLS POLICIES =====

-- profiles
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- clubs
create policy "clubs_select" on clubs for select using (
  exists (
    select 1 from club_memberships
    where club_memberships.club_id = clubs.id
      and club_memberships.user_id = auth.uid()
  )
);
create policy "clubs_insert" on clubs for insert with check (owner_id = auth.uid());
create policy "clubs_update" on clubs for update using (owner_id = auth.uid());

-- club_memberships
create policy "memberships_select" on club_memberships for select using (
  exists (
    select 1 from club_memberships cm
    where cm.club_id = club_memberships.club_id
      and cm.user_id = auth.uid()
  )
);
create policy "memberships_insert" on club_memberships for insert with check (user_id = auth.uid());
create policy "memberships_delete" on club_memberships for delete using (user_id = auth.uid());

-- game_rooms
create policy "rooms_select" on game_rooms for select using (
  exists (
    select 1 from club_memberships
    where club_memberships.club_id = game_rooms.club_id
      and club_memberships.user_id = auth.uid()
  )
);
create policy "rooms_insert" on game_rooms for insert with check (
  exists (
    select 1 from club_memberships
    where club_memberships.club_id = game_rooms.club_id
      and club_memberships.user_id = auth.uid()
  )
);
create policy "rooms_update_service" on game_rooms for update using (true);

-- game_participants
create policy "participants_select" on game_participants for select using (
  exists (
    select 1 from club_memberships cm
    join game_rooms gr on gr.club_id = cm.club_id
    where gr.id = game_participants.room_id
      and cm.user_id = auth.uid()
  )
);
create policy "participants_insert" on game_participants for insert with check (user_id = auth.uid());
create policy "participants_update" on game_participants for update using (user_id = auth.uid());
create policy "participants_delete" on game_participants for delete using (user_id = auth.uid());

-- game_sessions (service role only)
create policy "sessions_service_all" on game_sessions for all using (true);

-- player_views
create policy "views_select_own" on player_views for select using (user_id = auth.uid());
create policy "views_update_service" on player_views for all using (true);

-- game_event_logs
create policy "event_logs_select" on game_event_logs for select using (
  exists (
    select 1 from game_participants
    where game_participants.room_id = game_event_logs.room_id
      and game_participants.user_id = auth.uid()
  )
);
create policy "event_logs_insert_service" on game_event_logs for insert with check (true);

-- game_results
create policy "results_select" on game_results for select using (
  exists (
    select 1 from game_participants
    where game_participants.room_id = game_results.room_id
      and game_participants.user_id = auth.uid()
  )
);
create policy "results_insert_service" on game_results for insert with check (true);

-- club_invitations
create policy "invitations_select" on club_invitations for select using (
  invitee_id = auth.uid() or inviter_id = auth.uid()
);
create policy "invitations_insert" on club_invitations for insert with check (inviter_id = auth.uid());
create policy "invitations_update" on club_invitations for update using (
  invitee_id = auth.uid() or inviter_id = auth.uid()
);

-- point_transactions
create policy "point_tx_select" on point_transactions for select using (user_id = auth.uid());
create policy "point_tx_insert_service" on point_transactions for insert with check (true);

-- ===== REALTIME =====

alter publication supabase_realtime add table player_views;
alter publication supabase_realtime add table game_rooms;
alter publication supabase_realtime add table game_participants;

-- ===== FUNCTIONS =====

-- Trigger: auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper: get point balance
create or replace function get_point_balance(p_user_id uuid, p_club_id uuid)
returns int as $$
  select coalesce(
    (select balance_after from point_transactions
     where user_id = p_user_id and club_id = p_club_id
     order by created_at desc limit 1),
    0
  );
$$ language sql stable security definer;

-- Trigger: auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on profiles for each row execute function update_updated_at();
create trigger set_updated_at before update on clubs for each row execute function update_updated_at();
create trigger set_updated_at before update on game_rooms for each row execute function update_updated_at();
create trigger set_updated_at before update on game_sessions for each row execute function update_updated_at();

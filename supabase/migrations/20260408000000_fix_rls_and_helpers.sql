-- =============================================
-- Fix RLS recursion + add helpers for online play
-- =============================================

-- 1) SECURITY DEFINER helper that bypasses RLS to check membership
create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.club_memberships
    where club_id = p_club_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_club_member(uuid) to authenticated, anon;

-- 2) Drop and recreate self-recursive policies on club_memberships
drop policy if exists "memberships_select" on public.club_memberships;
create policy "memberships_select" on public.club_memberships
  for select
  using (
    user_id = auth.uid()
    or is_club_member(club_id)
  );

-- 3) Replace clubs / rooms / participants policies that referenced club_memberships
drop policy if exists "clubs_select" on public.clubs;
create policy "clubs_select" on public.clubs
  for select using (is_club_member(id));

drop policy if exists "rooms_select" on public.game_rooms;
create policy "rooms_select" on public.game_rooms
  for select using (is_club_member(club_id));

drop policy if exists "rooms_insert" on public.game_rooms;
create policy "rooms_insert" on public.game_rooms
  for insert with check (is_club_member(club_id));

drop policy if exists "participants_select" on public.game_participants;
create policy "participants_select" on public.game_participants
  for select using (
    exists (
      select 1 from public.game_rooms gr
      where gr.id = game_participants.room_id
        and is_club_member(gr.club_id)
    )
  );

-- 4) Allow authenticated users to create clubs (already restricted to owner_id = auth.uid())
-- and let creators auto-add themselves as a membership row.
-- (existing clubs_insert policy already enforces owner_id = auth.uid())

-- 5) Helper: create a club AND make the creator the owner-member in one atomic SECURITY DEFINER call.
create or replace function public.create_club(p_name text, p_description text default null)
returns table (id uuid, name text, description text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_club public.clubs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.clubs (name, description, owner_id)
  values (p_name, p_description, auth.uid())
  returning * into new_club;

  insert into public.club_memberships (club_id, user_id, role)
  values (new_club.id, auth.uid(), 'owner');

  return query select new_club.id, new_club.name, new_club.description, new_club.invite_code;
end;
$$;

grant execute on function public.create_club(text, text) to authenticated;

-- 6) Helper: join a club by invite code (SECURITY DEFINER lets it look up clubs without RLS)
create or replace function public.join_club_by_code(p_invite_code text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club public.clubs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into target_club from public.clubs where invite_code = p_invite_code;
  if target_club.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.club_memberships (club_id, user_id, role)
  values (target_club.id, auth.uid(), 'member')
  on conflict (club_id, user_id) do nothing;

  return query select target_club.id, target_club.name;
end;
$$;

grant execute on function public.join_club_by_code(text) to authenticated;

-- 7) Index improvements for hot paths
create index if not exists idx_memberships_user on public.club_memberships(user_id);
create index if not exists idx_participants_user on public.game_participants(user_id);
create index if not exists idx_player_views_user on public.player_views(user_id);
create index if not exists idx_rooms_club_status on public.game_rooms(club_id, status);
create index if not exists idx_sessions_updated on public.game_sessions(updated_at);

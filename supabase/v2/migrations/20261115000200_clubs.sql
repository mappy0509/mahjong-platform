-- =====================================================================
-- v2 / 0200 clubs: クラブ・メンバー・招待コード と ロール判定の補助関数
-- =====================================================================

create table public.clubs (
  id                      uuid primary key default gen_random_uuid(),
  club_code               text not null unique check (club_code ~ '^[0-9]{6,8}$'),
  name                    text not null check (char_length(btrim(name)) between 1 and 40),
  description             text check (description is null or char_length(description) <= 500),
  owner_id                uuid not null references public.profiles(id),
  -- Fee 設定
  fee_mode                text not null default 'rate'    check (fee_mode in ('rate', 'fixed')),
  fee_target              text not null default 'winners' check (fee_target in ('winners', 'all')),
  fee_rate_bp             integer not null default 500 check (fee_rate_bp between 0 and 5000),  -- 1bp=0.01%
  fee_fixed               bigint  not null default 0   check (fee_fixed >= 0),
  fee_cap                 bigint           check (fee_cap is null or fee_cap >= 0),             -- 1人1局あたりの上限
  -- 経済設定
  allow_negative          boolean not null default false,  -- 対局精算での貸し越し（負残高）を許すか
  members_can_open_tables boolean not null default false,  -- player も卓を開設できるか
  default_rules           jsonb   not null default '{}'::jsonb check (jsonb_typeof(default_rules) = 'object'),
  status                  text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index clubs_owner_idx on public.clubs (owner_id);
create trigger clubs_touch before update on public.clubs
  for each row execute function private.touch_updated_at();

create table public.club_members (
  club_id      uuid not null references public.clubs(id),
  user_id      uuid not null references public.profiles(id),
  role         text not null default 'player' check (role in ('owner', 'agent', 'player')),
  status       text not null default 'pending' check (status in ('pending', 'active', 'removed', 'rejected')),
  agent_id     uuid,   -- 配下に付くエージェント（player のみ）
  alias        text check (alias is null or char_length(alias) <= 24),
  requested_at timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid,
  removed_at   timestamptz,
  primary key (club_id, user_id),
  foreign key (club_id, agent_id) references public.club_members (club_id, user_id),
  check (agent_id is null or agent_id <> user_id),
  check (role = 'player' or agent_id is null)
);
create index club_members_user_idx  on public.club_members (user_id);
create index club_members_agent_idx on public.club_members (club_id, agent_id);
create unique index club_members_one_owner on public.club_members (club_id) where role = 'owner';

-- 招待コード: agent_id null = クラブ（オーナー）のコード、非 null = エージェント個人のコード
create table public.club_invite_codes (
  club_id    uuid not null references public.clubs(id),
  code       text not null check (code ~ '^[A-Z0-9]{6,16}$'),
  agent_id   uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (club_id, code),
  foreign key (club_id, agent_id) references public.club_members (club_id, user_id)
);
create unique index club_invite_codes_one_active
  on public.club_invite_codes (club_id, coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

-- ---------------------------------------------------------------------
-- ロール判定（RLS とRPC の両方で使う）
-- ---------------------------------------------------------------------
create or replace function private.member_role(p_club_id uuid, p_user_id uuid default null)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.club_members
   where club_id = p_club_id
     and user_id = coalesce(p_user_id, auth.uid())
     and status = 'active';
$$;

create or replace function private.is_club_owner(p_club_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.member_role(p_club_id) = 'owner', false);
$$;

create or replace function private.is_active_member(p_club_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.member_role(p_club_id) is not null;
$$;

-- 呼び出し者がエージェントで、p_user_id がその配下か（status は問わない: pending も含む）
create or replace function private.is_my_downline(p_club_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.member_role(p_club_id) = 'agent', false)
     and exists (select 1 from public.club_members
                  where club_id = p_club_id and user_id = p_user_id and agent_id = auth.uid());
$$;

-- ポイント口座（会員 or クラブ金庫）を閲覧できるか
create or replace function private.can_view_point_account(p_club_id uuid, p_account_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
       p_account_id = auth.uid()
    or private.is_platform_admin()
    or private.is_club_owner(p_club_id)
    or (p_account_id <> p_club_id and private.is_my_downline(p_club_id, p_account_id))
  );
$$;

-- club_members の行を閲覧できるか
create or replace function private.can_view_member_row(p_club_id uuid, p_user_id uuid, p_agent_id uuid, p_status text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
       p_user_id = auth.uid()
    or private.is_platform_admin()
    or private.is_club_owner(p_club_id)
    or (p_agent_id = auth.uid() and private.member_role(p_club_id) = 'agent')
    or (p_status = 'active' and private.is_active_member(p_club_id))
  );
$$;

-- プロフィールを閲覧できるか（本人／同じクラブの active 同士／自分のクラブへの申請者を見るオーナー・エージェント）
create or replace function private.can_view_profile(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
       p_user_id = auth.uid()
    or private.is_platform_admin()
    or exists (
         select 1
           from public.club_members me
           join public.club_members them on them.club_id = me.club_id
          where me.user_id = auth.uid() and me.status = 'active'
            and them.user_id = p_user_id
            and (   them.status = 'active'
                 or (them.status = 'pending' and (me.role = 'owner' or (me.role = 'agent' and them.agent_id = me.user_id))))
    )
  );
$$;

-- 公開ID（6〜8桁の数字）。既定は7桁
create or replace function private.new_club_code()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v text; b bytea;
begin
  for i in 1 .. 50 loop
    b := extensions.gen_random_bytes(3);
    v := (((get_byte(b, 0) << 16) | (get_byte(b, 1) << 8) | get_byte(b, 2)) % 9000000 + 1000000)::text;
    if not exists (select 1 from public.clubs where club_code = v) then
      return v;
    end if;
  end loop;
  raise exception 'club_code_exhausted';
end $$;

create or replace function private.new_invite_code(p_club_id uuid, p_agent_id uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v text;
begin
  update public.club_invite_codes set revoked_at = now()
   where club_id = p_club_id and revoked_at is null
     and agent_id is not distinct from p_agent_id;
  loop
    v := private.random_code(8);
    exit when not exists (select 1 from public.club_invite_codes where club_id = p_club_id and code = v);
  end loop;
  insert into public.club_invite_codes (club_id, code, agent_id) values (p_club_id, v, p_agent_id);
  return v;
end $$;

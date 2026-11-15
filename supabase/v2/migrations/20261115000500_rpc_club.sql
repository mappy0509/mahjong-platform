-- =====================================================================
-- v2 / 0500 RPC: クラブ運営（作成・参加申請・承認・除名・ロール・配下・エイリアス・設定）
-- すべて SECURITY DEFINER + search_path 固定 + 内部で auth.uid() とロールを検証
-- =====================================================================

create or replace function public.create_club(p_name text, p_description text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.uid_required();
  v_club uuid;
  v_code text;
  v_inv  text;
  v_init bigint;
  v_cost bigint;
begin
  if not private.setting_bool('club_create_open') and not private.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (select count(*) from public.clubs where owner_id = v_uid and status <> 'closed')
       >= private.setting_bigint('max_clubs_per_owner') then
    raise exception 'club_limit_reached';
  end if;

  v_code := private.new_club_code();
  insert into public.clubs (club_code, name, description, owner_id)
  values (v_code, btrim(p_name), p_description, v_uid)
  returning id into v_club;

  insert into public.club_members (club_id, user_id, role, status, approved_at, approved_by)
  values (v_club, v_uid, 'owner', 'active', now(), v_uid);

  v_inv := private.new_invite_code(v_club, null);

  insert into private.ledger_heads (club_id, ledger) values (v_club, 'point'), (v_club, 'diamond');
  perform set_config('app.ledger_write', 'on', true);
  insert into public.diamond_balances (club_id) values (v_club);
  perform set_config('app.ledger_write', 'off', true);

  v_init := private.setting_bigint('initial_diamonds_on_club_create');
  v_cost := private.setting_bigint('diamond_cost_club_create');
  if v_init > 0 then perform private.post_diamond(v_club, 'grant', v_init, null, 'initial grant'); end if;
  if v_cost > 0 then perform private.post_diamond(v_club, 'club_create', -v_cost, null, 'club create'); end if;

  perform private.audit(v_club, 'create_club', v_club, jsonb_build_object('club_code', v_code));
  return jsonb_build_object('club_id', v_club, 'club_code', v_code, 'invite_code', v_inv);
end $$;

-- 参加申請。クラブの招待コードならオーナー直下、エージェントのコードならその配下で pending になる
create or replace function public.request_join_club(p_club_code text, p_invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.uid_required();
  v_club  uuid;
  v_agent uuid;
  v_found boolean;
  v_cur   public.club_members%rowtype;
begin
  select c.id, i.agent_id, true into v_club, v_agent, v_found
    from public.clubs c
    join public.club_invite_codes i on i.club_id = c.id and i.revoked_at is null
   where c.club_code = btrim(p_club_code) and c.status = 'active'
     and i.code = upper(btrim(p_invite_code));
  if not coalesce(v_found, false) then
    -- クラブの有無を区別させない
    raise exception 'invalid_club_or_code' using errcode = 'P0002';
  end if;
  if v_agent is not null and private.member_role(v_club, v_agent) is distinct from 'agent' then
    raise exception 'invalid_club_or_code' using errcode = 'P0002';
  end if;

  select * into v_cur from public.club_members where club_id = v_club and user_id = v_uid for update;
  if found then
    if v_cur.status = 'active' then raise exception 'already_member'; end if;
    if v_cur.status = 'pending' then return v_club; end if;
    update public.club_members
       set status = 'pending', role = 'player', agent_id = v_agent, requested_at = now(),
           approved_at = null, approved_by = null, removed_at = null
     where club_id = v_club and user_id = v_uid;
  else
    insert into public.club_members (club_id, user_id, role, status, agent_id)
    values (v_club, v_uid, 'player', 'pending', v_agent);
  end if;

  perform private.audit(v_club, 'request_join', v_uid, jsonb_build_object('agent_id', v_agent));
  return v_club;
end $$;

-- 承認／却下。オーナーは全申請、エージェントは自分のコード経由の申請だけ
create or replace function public.approve_member(p_club_id uuid, p_user_id uuid, p_approve boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.uid_required();
  v_role text := coalesce(private.member_role(p_club_id), '');
  v_row  public.club_members%rowtype;
begin
  select * into v_row from public.club_members where club_id = p_club_id and user_id = p_user_id for update;
  if not found or v_row.status <> 'pending' then raise exception 'not_pending'; end if;
  if not coalesce((v_role = 'owner' or (v_role = 'agent' and v_row.agent_id = v_uid)), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.club_members
     set status = case when p_approve then 'active' else 'rejected' end,
         approved_at = case when p_approve then now() end,
         approved_by = v_uid
   where club_id = p_club_id and user_id = p_user_id;

  perform private.audit(p_club_id, case when p_approve then 'approve_member' else 'reject_member' end, p_user_id);
end $$;

-- 除名。オーナーは全員（自分以外）、エージェントは自分の配下 player だけ。
-- 残高 0・着席なし・（エージェントなら）配下なし が条件
create or replace function public.remove_member(p_club_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.uid_required();
  v_role text := coalesce(private.member_role(p_club_id), '');
  v_row  public.club_members%rowtype;
begin
  select * into v_row from public.club_members where club_id = p_club_id and user_id = p_user_id for update;
  if not found or v_row.status not in ('active', 'pending') then raise exception 'not_member'; end if;
  if v_row.role = 'owner' then raise exception 'cannot_remove_owner'; end if;
  if not coalesce((v_role = 'owner' or (v_role = 'agent' and v_row.agent_id = v_uid and v_row.role = 'player')), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce((select balance from public.point_balances where club_id = p_club_id and account_id = p_user_id), 0) <> 0 then
    raise exception 'balance_not_zero';
  end if;
  if exists (select 1 from public.table_seats s join public.tables t on t.id = s.table_id
              where s.user_id = p_user_id and t.club_id = p_club_id and t.status in ('waiting', 'playing')) then
    raise exception 'member_is_seated';
  end if;
  if v_row.role = 'agent' and exists (select 1 from public.club_members
                                       where club_id = p_club_id and agent_id = p_user_id and status in ('active', 'pending')) then
    raise exception 'agent_has_downline';
  end if;

  update public.club_invite_codes set revoked_at = now()
   where club_id = p_club_id and agent_id = p_user_id and revoked_at is null;
  update public.club_members
     set status = 'removed', removed_at = now(), role = case when role = 'agent' then 'player' else role end
   where club_id = p_club_id and user_id = p_user_id;

  perform private.audit(p_club_id, 'remove_member', p_user_id, jsonb_build_object('prev_role', v_row.role));
end $$;

-- ロール変更（オーナーのみ）: player <-> agent。owner の付け替えは未対応（README 未決）
create or replace function public.set_member_role(p_club_id uuid, p_user_id uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.uid_required();
  v_row public.club_members%rowtype;
  v_code text;
begin
  if not private.is_club_owner(p_club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('agent', 'player') then raise exception 'invalid_role'; end if;
  select * into v_row from public.club_members where club_id = p_club_id and user_id = p_user_id for update;
  if not found or v_row.status <> 'active' then raise exception 'not_active_member'; end if;
  if v_row.role = 'owner' then raise exception 'cannot_change_owner'; end if;
  if v_row.role = p_role then return jsonb_build_object('role', p_role); end if;

  if p_role = 'agent' then
    update public.club_members set role = 'agent', agent_id = null where club_id = p_club_id and user_id = p_user_id;
    v_code := private.new_invite_code(p_club_id, p_user_id);
  else
    if exists (select 1 from public.club_members where club_id = p_club_id and agent_id = p_user_id
                                                    and status in ('active', 'pending')) then
      raise exception 'agent_has_downline';
    end if;
    update public.club_invite_codes set revoked_at = now()
     where club_id = p_club_id and agent_id = p_user_id and revoked_at is null;
    update public.club_members set role = 'player' where club_id = p_club_id and user_id = p_user_id;
  end if;

  perform private.audit(p_club_id, 'set_member_role', p_user_id, jsonb_build_object('from', v_row.role, 'to', p_role));
  return jsonb_build_object('role', p_role, 'invite_code', v_code);
end $$;

-- 配下の付け替え（オーナーのみ）。p_agent_id = null でオーナー直下
create or replace function public.set_member_agent(p_club_id uuid, p_user_id uuid, p_agent_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required(); v_row public.club_members%rowtype;
begin
  if not private.is_club_owner(p_club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_row from public.club_members where club_id = p_club_id and user_id = p_user_id for update;
  if not found or v_row.status <> 'active' or v_row.role <> 'player' then raise exception 'target_must_be_active_player'; end if;
  if p_agent_id is not null and private.member_role(p_club_id, p_agent_id) is distinct from 'agent' then
    raise exception 'agent_not_found';
  end if;
  update public.club_members set agent_id = p_agent_id where club_id = p_club_id and user_id = p_user_id;
  perform private.audit(p_club_id, 'set_member_agent', p_user_id,
                        jsonb_build_object('from', v_row.agent_id, 'to', p_agent_id));
end $$;

-- エイリアス（クラブ内の呼び名）: オーナーは全員、エージェントは配下、本人は自分
create or replace function public.set_alias(p_club_id uuid, p_user_id uuid, p_alias text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required();
begin
  if not coalesce((   (p_user_id = v_uid and private.is_active_member(p_club_id))
          or private.is_club_owner(p_club_id)
          or private.is_my_downline(p_club_id, p_user_id)), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.club_members set alias = nullif(btrim(p_alias), '')
   where club_id = p_club_id and user_id = p_user_id and status = 'active';
  if not found then raise exception 'not_active_member'; end if;
  perform private.audit(p_club_id, 'set_alias', p_user_id, jsonb_build_object('alias', p_alias));
end $$;

-- 招待コードの再発行: オーナーはクラブのコード、エージェントは自分のコード
create or replace function public.rotate_invite_code(p_club_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required(); v_role text := coalesce(private.member_role(p_club_id), ''); v_code text;
begin
  if v_role = 'owner' then
    v_code := private.new_invite_code(p_club_id, null);
  elsif v_role = 'agent' then
    v_code := private.new_invite_code(p_club_id, v_uid);
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform private.audit(p_club_id, 'rotate_invite_code', v_uid);
  return v_code;
end $$;

-- 設定変更（オーナーのみ）。許可したキーだけ受け付ける
create or replace function public.update_club_settings(p_club_id uuid, p_settings jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := private.uid_required();
  k text;
  allowed constant text[] := array['name', 'description', 'fee_mode', 'fee_target', 'fee_rate_bp', 'fee_fixed',
                                   'fee_cap', 'allow_negative', 'members_can_open_tables', 'default_rules'];
begin
  if not private.is_club_owner(p_club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_settings) <> 'object' then raise exception 'invalid_settings'; end if;
  for k in select jsonb_object_keys(p_settings) loop
    if not coalesce((k = any (allowed)), false) then raise exception 'invalid_settings_key:%', k; end if;
  end loop;
  if p_settings ? 'default_rules' and (jsonb_typeof(p_settings -> 'default_rules') <> 'object'
                                       or octet_length((p_settings -> 'default_rules')::text) > 8192) then
    raise exception 'invalid_default_rules';
  end if;

  update public.clubs c set
    name                    = case when p_settings ? 'name' then btrim(p_settings ->> 'name') else c.name end,
    description             = case when p_settings ? 'description' then p_settings ->> 'description' else c.description end,
    fee_mode                = coalesce(p_settings ->> 'fee_mode', c.fee_mode),
    fee_target              = coalesce(p_settings ->> 'fee_target', c.fee_target),
    fee_rate_bp             = coalesce((p_settings ->> 'fee_rate_bp')::int, c.fee_rate_bp),
    fee_fixed               = coalesce((p_settings ->> 'fee_fixed')::bigint, c.fee_fixed),
    fee_cap                 = case when p_settings ? 'fee_cap' then (p_settings ->> 'fee_cap')::bigint else c.fee_cap end,
    allow_negative          = coalesce((p_settings ->> 'allow_negative')::boolean, c.allow_negative),
    members_can_open_tables = coalesce((p_settings ->> 'members_can_open_tables')::boolean, c.members_can_open_tables),
    default_rules           = coalesce(p_settings -> 'default_rules', c.default_rules)
  where c.id = p_club_id;

  perform private.audit(p_club_id, 'update_club_settings', p_club_id, p_settings);
end $$;

-- プラットフォーマー: クラブの状態変更（停止・再開・閉鎖）
create or replace function public.set_club_status(p_club_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required();
begin
  if not private.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.clubs set status = p_status where id = p_club_id;
  if not found then raise exception 'club_not_found'; end if;
  perform private.audit(p_club_id, 'set_club_status', p_club_id, jsonb_build_object('status', p_status));
end $$;

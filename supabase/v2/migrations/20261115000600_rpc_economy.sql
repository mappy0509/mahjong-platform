-- =====================================================================
-- v2 / 0600 RPC: 経済（ダイヤ発行・ポイント発行/消却・配布/回収・維持費・検証）
-- =====================================================================

create or replace function private.is_seated(p_club_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.table_seats s join public.tables t on t.id = s.table_id
                  where s.user_id = p_user_id and t.club_id = p_club_id and t.status in ('waiting', 'playing'));
$$;

-- プラットフォーマー → クラブ へのダイヤ発行（負の値は調整として減算。残高は負にならない）
create or replace function public.grant_diamonds(p_club_id uuid, p_amount bigint, p_memo text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required(); v_bal bigint;
begin
  if not private.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount = 0 or abs(p_amount) > private.setting_bigint('max_point_amount') then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from public.clubs where id = p_club_id) then raise exception 'club_not_found'; end if;
  v_bal := private.post_diamond(p_club_id, case when p_amount > 0 then 'grant' else 'adjust' end, p_amount, null, p_memo);
  perform private.audit(p_club_id, 'grant_diamonds', p_club_id, jsonb_build_object('amount', p_amount, 'balance', v_bal));
  return v_bal;
end $$;

-- オーナー: クラブポイントの発行（金庫に入る）／消却（金庫から消える）
create or replace function public.issue_points(p_club_id uuid, p_amount bigint, p_memo text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required(); v_bal bigint;
begin
  if not private.is_club_owner(p_club_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount = 0 or abs(p_amount) > private.setting_bigint('max_point_amount') then raise exception 'invalid_amount'; end if;
  v_bal := private.post_point(p_club_id, p_club_id, case when p_amount > 0 then 'issue' else 'burn' end,
                              p_amount, gen_random_uuid(), null, null, p_memo, false);
  perform private.audit(p_club_id, 'issue_points', p_club_id, jsonb_build_object('amount', p_amount, 'treasury', v_bal));
  return v_bal;
end $$;

-- 配布（p_amount > 0）／回収（p_amount < 0）
--   オーナー  : 金庫 <-> 任意の active メンバー（自分を含む）
--   エージェント: 自分の持ち点 <-> 自分の配下 player（自分の残高の範囲でしか配れない）
--   どの場合も、出す側の残高が負になる取引は拒否。出す側が着席中なら拒否
create or replace function public.transfer_points(p_club_id uuid, p_to_user uuid, p_amount bigint, p_memo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := private.uid_required();
  v_role   text := coalesce(private.member_role(p_club_id), '');
  v_source uuid;           -- オーナー: club_id(金庫) ／ エージェント: 自分
  v_from   uuid;
  v_to     uuid;
  v_abs    bigint := abs(p_amount);
  v_tx     uuid := gen_random_uuid();
  v_from_bal bigint;
  v_to_bal   bigint;
begin
  if p_amount = 0 or v_abs > private.setting_bigint('max_point_amount') then raise exception 'invalid_amount'; end if;
  if (select status from public.clubs where id = p_club_id) is distinct from 'active' then raise exception 'club_not_active'; end if;
  if private.member_role(p_club_id, p_to_user) is null then raise exception 'target_not_active_member'; end if;

  if v_role = 'owner' then
    v_source := p_club_id;
  elsif v_role = 'agent' then
    if not private.is_my_downline(p_club_id, p_to_user) then raise exception 'forbidden' using errcode = '42501'; end if;
    v_source := v_uid;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_source = p_to_user then raise exception 'self_transfer'; end if;

  if p_amount > 0 then v_from := v_source; v_to := p_to_user; else v_from := p_to_user; v_to := v_source; end if;
  if v_from <> p_club_id and private.is_seated(p_club_id, v_from) then raise exception 'member_is_seated'; end if;

  v_from_bal := private.post_point(p_club_id, v_from, 'transfer', -v_abs, v_tx, v_to, null, p_memo, false);
  v_to_bal   := private.post_point(p_club_id, v_to,   'transfer',  v_abs, v_tx, v_from, null, p_memo, false);

  perform private.audit(p_club_id, case when p_amount > 0 then 'distribute_points' else 'collect_points' end, p_to_user,
                        jsonb_build_object('amount', v_abs, 'from', v_from, 'to', v_to, 'tx_id', v_tx));
  return jsonb_build_object('tx_id', v_tx, 'from_balance', v_from_bal, 'to_balance', v_to_bal);
end $$;

-- 維持費の徴収（service_role 専用。日次ジョブから呼ぶ）。払えなければクラブを suspended にする
create or replace function public.charge_club_maintenance(p_club_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cost bigint := private.setting_bigint('diamond_cost_club_maintenance_daily'); v_bal bigint;
begin
  if not private.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_cost <= 0 then return jsonb_build_object('charged', 0); end if;
  v_bal := coalesce((select balance from public.diamond_balances where club_id = p_club_id), 0);
  if v_bal < v_cost then
    update public.clubs set status = 'suspended' where id = p_club_id and status = 'active';
    perform private.audit(p_club_id, 'maintenance_suspend', p_club_id, jsonb_build_object('cost', v_cost, 'balance', v_bal));
    return jsonb_build_object('charged', 0, 'suspended', true);
  end if;
  v_bal := private.post_diamond(p_club_id, 'maintenance', -v_cost, null, 'daily maintenance');
  perform private.audit(p_club_id, 'maintenance_charge', p_club_id, jsonb_build_object('cost', v_cost, 'balance', v_bal));
  return jsonb_build_object('charged', v_cost, 'balance', v_bal);
end $$;

-- 台帳の検証（オーナー・プラットフォーマー・service_role）。0行なら正常
create or replace function public.verify_ledgers(p_club_id uuid)
returns table (ledger text, seq bigint, problem text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((private.is_service_role() or private.is_platform_admin() or private.is_club_owner(p_club_id)), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select 'point'::text, v.seq, v.problem from private.verify_point_chain_impl(p_club_id) v
    union all
    select 'diamond'::text, v.seq, v.problem from private.verify_diamond_chain_impl(p_club_id) v;
end $$;

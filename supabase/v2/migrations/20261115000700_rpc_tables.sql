-- =====================================================================
-- v2 / 0700 RPC: 卓（開設・着席・離席・閉鎖）と 対局（開始・局結果・中止・精算）
-- start_game / record_round / abort_game / settle_game は service_role 専用（対局サーバーが呼ぶ）
-- =====================================================================

-- 卓の開設。オーナー/エージェント（設定で player も可）。ダイヤを消費する
-- ルール = 既定(人数別) || クラブ既定(default_rules->'4' or '3') || 引数
create or replace function public.open_table(
  p_club_id uuid, p_name text, p_player_count int, p_game_length text,
  p_rate bigint, p_min_buyin bigint default 0, p_rules jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := private.uid_required();
  v_role  text := coalesce(private.member_role(p_club_id), '');
  v_club  public.clubs%rowtype;
  v_rules jsonb;
  v_cost  bigint;
  v_table uuid := gen_random_uuid();
begin
  select * into v_club from public.clubs where id = p_club_id;
  if not found or v_club.status <> 'active' then raise exception 'club_not_active'; end if;
  if not coalesce((v_role in ('owner', 'agent') or (v_role = 'player' and v_club.members_can_open_tables)), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_player_count not in (3, 4) then raise exception 'invalid_player_count'; end if;
  if p_game_length not in ('east', 'south') then raise exception 'invalid_game_length'; end if;
  if p_rate <= 0 or p_rate > private.setting_bigint('max_table_rate') then raise exception 'invalid_rate'; end if;
  if p_min_buyin < 0 or p_min_buyin > private.setting_bigint('max_point_amount') then raise exception 'invalid_min_buyin'; end if;
  if jsonb_typeof(coalesce(p_rules, '{}'::jsonb)) <> 'object' then raise exception 'invalid_rules'; end if;

  v_rules := private.base_rules(p_player_count)
          || coalesce(v_club.default_rules -> p_player_count::text, '{}'::jsonb)
          || coalesce(p_rules, '{}'::jsonb);
  perform private.validate_rules(v_rules, p_player_count);

  v_cost := private.setting_bigint(case p_player_count when 4 then 'diamond_cost_table_open_4p' else 'diamond_cost_table_open_3p' end);

  insert into public.tables (id, club_id, name, player_count, game_length, rate, min_buyin, rules, created_by, diamond_cost)
  values (v_table, p_club_id, btrim(p_name), p_player_count, p_game_length, p_rate, p_min_buyin, v_rules, v_uid, v_cost);

  if v_cost > 0 then
    perform private.post_diamond(p_club_id, 'table_open', -v_cost, v_table, null);
  end if;

  perform private.audit(p_club_id, 'open_table', v_table, jsonb_build_object('cost', v_cost, 'rate', p_rate));
  return v_table;
end $$;

-- 着席。active メンバー・最低持ち込み以上・他の卓に座っていない
create or replace function public.join_table(p_table_id uuid, p_seat int default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := private.uid_required();
  v_t    public.tables%rowtype;
  v_seat int;
  v_bal  bigint;
begin
  select * into v_t from public.tables where id = p_table_id for update;
  if not found or not private.is_active_member(v_t.club_id) then raise exception 'table_not_found'; end if;
  if v_t.status <> 'waiting' then raise exception 'table_not_waiting'; end if;
  if (select status from public.clubs where id = v_t.club_id) <> 'active' then raise exception 'club_not_active'; end if;
  if exists (select 1 from public.table_seats s where s.table_id = p_table_id and s.user_id = v_uid) then
    raise exception 'already_seated';
  end if;
  if exists (select 1 from public.table_seats s join public.tables t on t.id = s.table_id
              where s.user_id = v_uid and t.status in ('waiting', 'playing')) then
    raise exception 'seated_elsewhere';
  end if;
  v_bal := coalesce((select balance from public.point_balances where club_id = v_t.club_id and account_id = v_uid), 0);
  if v_bal < v_t.min_buyin then raise exception 'insufficient_balance_for_table'; end if;

  if p_seat is null then
    select min(g) into v_seat from generate_series(0, v_t.player_count - 1) g
     where not exists (select 1 from public.table_seats s where s.table_id = p_table_id and s.seat = g);
    if v_seat is null then raise exception 'table_full'; end if;
  else
    if p_seat < 0 or p_seat >= v_t.player_count then raise exception 'invalid_seat'; end if;
    if exists (select 1 from public.table_seats s where s.table_id = p_table_id and s.seat = p_seat) then
      raise exception 'seat_taken';
    end if;
    v_seat := p_seat;
  end if;

  insert into public.table_seats (table_id, seat, user_id) values (p_table_id, v_seat, v_uid);
  return v_seat;
end $$;

-- 離席（開始前のみ）
create or replace function public.leave_table(p_table_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required(); v_status text;
begin
  select status into v_status from public.tables where id = p_table_id for update;
  if v_status is null then raise exception 'table_not_found'; end if;
  if v_status <> 'waiting' then raise exception 'table_not_waiting'; end if;
  delete from public.table_seats where table_id = p_table_id and user_id = v_uid;
  if not found then raise exception 'not_seated'; end if;
end $$;

-- 開始前の卓を閉じる（開設者かオーナー）。ダイヤは返らない
create or replace function public.close_table(p_table_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required(); v_t public.tables%rowtype;
begin
  select * into v_t from public.tables where id = p_table_id for update;
  if not found then raise exception 'table_not_found'; end if;
  if not coalesce((private.is_club_owner(v_t.club_id) or (v_t.created_by = v_uid and private.is_active_member(v_t.club_id))), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_t.status <> 'waiting' then raise exception 'table_not_waiting'; end if;
  update public.tables set status = 'aborted', finished_at = now() where id = p_table_id;
  perform private.audit(v_t.club_id, 'close_table', p_table_id);
end $$;

-- ---------------------------------------------------------------------
-- service_role 専用
-- ---------------------------------------------------------------------
create or replace function public.start_game(p_table_id uuid, p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_t public.tables%rowtype; v_c public.clubs%rowtype; v_g public.games%rowtype;
begin
  if not private.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_t from public.tables where id = p_table_id for update;
  if not found then raise exception 'table_not_found'; end if;

  select * into v_g from public.games where table_id = p_table_id;
  if found then
    if v_g.id = p_game_id then return jsonb_build_object('game_id', v_g.id, 'already_started', true); end if;
    raise exception 'table_already_has_game';
  end if;
  if v_t.status <> 'waiting' then raise exception 'table_not_waiting'; end if;
  if (select count(*) from public.table_seats where table_id = p_table_id) <> v_t.player_count then
    raise exception 'table_not_full';
  end if;
  select * into v_c from public.clubs where id = v_t.club_id;

  insert into public.games (id, table_id, club_id, player_count, game_length, rate, rules_snapshot, fee_snapshot)
  values (p_game_id, p_table_id, v_t.club_id, v_t.player_count, v_t.game_length, v_t.rate, v_t.rules,
          jsonb_build_object('fee_mode', v_c.fee_mode, 'fee_target', v_c.fee_target, 'fee_rate_bp', v_c.fee_rate_bp,
                             'fee_fixed', v_c.fee_fixed, 'fee_cap', v_c.fee_cap, 'allow_negative', v_c.allow_negative,
                             'min_buyin', v_t.min_buyin));
  insert into public.game_players (game_id, seat, user_id)
  select p_game_id, seat, user_id from public.table_seats where table_id = p_table_id;
  update public.tables set status = 'playing', started_at = now() where id = p_table_id;

  perform private.audit(v_t.club_id, 'start_game', p_game_id, jsonb_build_object('table_id', p_table_id));
  return jsonb_build_object('game_id', p_game_id, 'already_started', false);
end $$;

create or replace function public.record_round(p_game_id uuid, p_round_index int, p_result jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select status from public.games where id = p_game_id) is distinct from 'playing' then
    raise exception 'game_not_playing';
  end if;
  insert into public.game_rounds (game_id, round_index, result) values (p_game_id, p_round_index, p_result)
  on conflict do nothing;
  return found;
end $$;

create or replace function public.abort_game(p_game_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_g public.games%rowtype;
begin
  if not private.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_g from public.games where id = p_game_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if v_g.status = 'aborted' then return; end if;
  if v_g.status <> 'playing' then raise exception 'game_not_playing'; end if;
  update public.games set status = 'aborted', ended_at = now() where id = p_game_id;
  update public.tables set status = 'aborted', finished_at = now() where id = v_g.table_id;
  perform private.audit(v_g.club_id, 'abort_game', p_game_id, jsonb_build_object('reason', p_reason));
end $$;

create or replace function private.game_result_json(p_game_id uuid, p_already boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'game_id', g.id, 'already_settled', p_already, 'fee_total', g.fee_total,
    'players', (select jsonb_agg(jsonb_build_object('seat', p.seat, 'user_id', p.user_id, 'final_points', p.final_points,
                                                    'rank', p.rank, 'score', p.score_x10 / 10.0, 'raw_delta', p.raw_delta,
                                                    'point_delta', p.point_delta, 'fee', p.fee) order by p.seat)
                  from public.game_players p where p.game_id = g.id))
  from public.games g where g.id = p_game_id;
$$;

-- 精算（冪等）。最終点数（席順）とルールから順位・ウマオカ後スコア・ポイント増減・Fee を求め、
-- 台帳・残高・games 系を 1 トランザクションで書く。同じ game_id で 2 回呼ばれても 2 回目は何も書かない
create or replace function public.settle_game(
  p_game_id uuid, p_final_points int[], p_rounds jsonb default null, p_kifu_path text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_g      public.games%rowtype;
  n        int;
  v_start  int; v_ret int; v_uma jsonb; v_oka_x10 int;
  fs       jsonb;
  v_allow_neg boolean;
  a_users    uuid[];
  a_rnk      int[]; a_score int[]; a_raw bigint[]; a_bal bigint[]; a_delta bigint[]; a_fee bigint[];
  i int; j int; v_top int;
  s bigint;
  loss_raw bigint := 0; loss_act bigint := 0; distributed bigint := 0; v_cap bigint;
  v_fee_total bigint := 0;
  v_tx uuid := gen_random_uuid();
  e jsonb; idx bigint;
begin
  if not private.is_service_role() then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_g from public.games where id = p_game_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if v_g.status = 'settled' then return private.game_result_json(p_game_id, true); end if;
  if v_g.status <> 'playing' then raise exception 'game_not_playing'; end if;

  n := v_g.player_count;
  if p_final_points is null or coalesce(array_length(p_final_points, 1), 0) <> n then raise exception 'invalid_final_points_length'; end if;
  v_start := (v_g.rules_snapshot ->> 'start_points')::int;
  v_ret   := (v_g.rules_snapshot ->> 'return_points')::int;
  v_uma   := v_g.rules_snapshot -> 'uma';
  s := 0;
  for i in 1 .. n loop
    if p_final_points[i] is null or p_final_points[i] % 100 <> 0 then raise exception 'final_points_must_be_multiple_of_100'; end if;
    s := s + p_final_points[i];
  end loop;
  if s <> v_start::bigint * n then raise exception 'final_points_sum_mismatch: % <> %', s, v_start::bigint * n; end if;

  fs := v_g.fee_snapshot;
  v_allow_neg := (fs ->> 'allow_negative')::boolean;

  -- クラブのポイントチェーンを先にロック（post_point と同じ順序でデッドロックを避ける）
  insert into private.ledger_heads (club_id, ledger) values (v_g.club_id, 'point') on conflict do nothing;
  perform 1 from private.ledger_heads where club_id = v_g.club_id and ledger = 'point' for update;

  select array_agg(user_id order by seat) into a_users from public.game_players where game_id = p_game_id;

  -- 順位: 点数の高い順、同点は起家に近い席（seat の小さい方）が上
  a_rnk := array_fill(0, array[n]);
  j := 0;
  for i in select x.ord::int from unnest(p_final_points) with ordinality as x(pts, ord)
            order by x.pts desc, x.ord asc loop
    j := j + 1;
    a_rnk[i] := j;
  end loop;

  v_oka_x10 := (v_ret - v_start) * n / 100;
  a_score := array_fill(0, array[n]);
  a_raw := array_fill(0::bigint, array[n]); a_bal := a_raw; a_delta := a_raw; a_fee := a_raw;
  for i in 1 .. n loop
    a_score[i] := (p_final_points[i] - v_ret) / 100 + (v_uma ->> (a_rnk[i] - 1))::int * 10
              + case when a_rnk[i] = 1 then v_oka_x10 else 0 end;
    if a_rnk[i] = 1 then v_top := i; end if;
    a_bal[i] := coalesce((select balance from public.point_balances
                         where club_id = v_g.club_id and account_id = a_users[i] for update), 0);
  end loop;

  s := 0;
  for i in 1 .. n loop
    if i <> v_top then
      a_raw[i] := trunc(a_score[i]::numeric * v_g.rate / 10)::bigint;
      s := s + a_raw[i];
    end if;
  end loop;
  a_raw[v_top] := -s;   -- トップが端数を吸収してゼロサムにする
  a_delta := a_raw;

  -- 貸し越し不可: 負け分を残高で頭打ちにし、勝ち分を比例で縮める（ゼロサムを保つ）
  if not v_allow_neg then
    for i in 1 .. n loop
      if a_raw[i] < 0 then
        v_cap := greatest(least(-a_raw[i], a_bal[i]), 0);
        a_delta[i] := -v_cap;
        loss_raw := loss_raw - a_raw[i];
        loss_act := loss_act + v_cap;
      end if;
    end loop;
    if loss_act < loss_raw then
      for i in 1 .. n loop
        if a_raw[i] > 0 then
          a_delta[i] := floor(a_raw[i]::numeric * loss_act / loss_raw)::bigint;
          distributed := distributed + a_delta[i];
        end if;
      end loop;
      -- 端数は勝者の中で最上位へ
      j := null;
      select k into j from generate_series(1, n) k where a_raw[k] > 0 order by a_rnk[k] limit 1;
      if j is not null then a_delta[j] := a_delta[j] + (loss_act - distributed); end if;
    end if;
  end if;

  -- Fee
  for i in 1 .. n loop
    if fs ->> 'fee_target' = 'winners' then
      if a_delta[i] > 0 then
        a_fee[i] := case when fs ->> 'fee_mode' = 'rate'
                       then floor(a_delta[i]::numeric * (fs ->> 'fee_rate_bp')::int / 10000)::bigint
                       else least((fs ->> 'fee_fixed')::bigint, a_delta[i]) end;
      end if;
    else
      a_fee[i] := case when fs ->> 'fee_mode' = 'rate'
                     then floor((fs ->> 'min_buyin')::numeric * (fs ->> 'fee_rate_bp')::int / 10000)::bigint
                     else (fs ->> 'fee_fixed')::bigint end;
    end if;
    if fs ->> 'fee_cap' is not null then a_fee[i] := least(a_fee[i], (fs ->> 'fee_cap')::bigint); end if;
    if not v_allow_neg then a_fee[i] := least(a_fee[i], greatest(a_bal[i] + a_delta[i], 0)); end if;
    a_fee[i] := greatest(a_fee[i], 0);
    v_fee_total := v_fee_total + a_fee[i];
  end loop;

  -- 記帳
  for i in 1 .. n loop
    perform private.post_point(v_g.club_id, a_users[i], 'game_result', a_delta[i], v_tx, null, p_game_id,
                               'game ' || p_game_id::text, v_allow_neg);
    perform private.post_point(v_g.club_id, a_users[i], 'fee', -a_fee[i], v_tx, v_g.club_id, p_game_id, null, v_allow_neg);
  end loop;
  perform private.post_point(v_g.club_id, v_g.club_id, 'fee', v_fee_total, v_tx, null, p_game_id, null, false);

  -- 局ごとの結果（未登録分だけ）
  if p_rounds is not null then
    if jsonb_typeof(p_rounds) <> 'array' then raise exception 'invalid_rounds'; end if;
    for e, idx in select x.v, x.o from jsonb_array_elements(p_rounds) with ordinality as x(v, o) loop
      insert into public.game_rounds (game_id, round_index, result) values (p_game_id, (idx - 1)::int, e)
      on conflict do nothing;
    end loop;
  end if;

  for i in 1 .. n loop
    update public.game_players
       set final_points = p_final_points[i], rank = a_rnk[i], score_x10 = a_score[i],
           raw_delta = a_raw[i], point_delta = a_delta[i], fee = a_fee[i]
     where game_id = p_game_id and seat = i - 1;
  end loop;
  update public.games
     set status = 'settled', ended_at = now(), settled_at = now(), fee_total = v_fee_total, kifu_path = p_kifu_path
   where id = p_game_id;
  update public.tables set status = 'finished', finished_at = now() where id = v_g.table_id;

  perform private.audit(v_g.club_id, 'settle_game', p_game_id,
                        jsonb_build_object('fee_total', v_fee_total, 'tx_id', v_tx));
  return private.game_result_json(p_game_id, false);
end $$;

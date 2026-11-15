-- =====================================================================
-- v2 / 0800 読み取り RPC（戦績・ランキング・エージェント配下集計・Fee 収入・自分の残高）
-- =====================================================================

-- 自分の戦績（p_club_id null で全クラブ）
create or replace function public.my_game_history(p_club_id uuid default null, p_limit int default 50, p_before timestamptz default null)
returns table (game_id uuid, club_id uuid, table_id uuid, ended_at timestamptz, player_count smallint, game_length text,
               rate bigint, seat smallint, rank smallint, final_points int, score numeric, point_delta bigint, fee bigint)
language sql stable security definer set search_path = '' as $$
  select g.id, g.club_id, g.table_id, g.ended_at, g.player_count, g.game_length, g.rate,
         p.seat, p.rank, p.final_points, p.score_x10 / 10.0, p.point_delta, p.fee
    from public.game_players p
    join public.games g on g.id = p.game_id
   where p.user_id = auth.uid()
     and g.status = 'settled'
     and (p_club_id is null or g.club_id = p_club_id)
     and (p_before is null or g.ended_at < p_before)
   order by g.ended_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- 自分の残高（全クラブ）
create or replace function public.my_balances()
returns table (club_id uuid, club_code text, club_name text, role text, balance bigint)
language sql stable security definer set search_path = '' as $$
  select m.club_id, c.club_code, c.name, m.role, coalesce(b.balance, 0)
    from public.club_members m
    join public.clubs c on c.id = m.club_id
    left join public.point_balances b on b.club_id = m.club_id and b.account_id = m.user_id
   where m.user_id = auth.uid() and m.status = 'active';
$$;

-- クラブ内ランキング（active メンバーのみ閲覧可）
create or replace function public.club_ranking(p_club_id uuid, p_from timestamptz default null, p_to timestamptz default null,
                                               p_limit int default 100)
returns table (user_id uuid, display_name text, alias text, games bigint, total_delta bigint, total_score numeric,
               avg_rank numeric, top_rate numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((private.is_active_member(p_club_id) or private.is_platform_admin()), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.user_id, pr.display_name, m.alias, count(*)::bigint, sum(p.point_delta)::bigint,
           sum(p.score_x10) / 10.0, round(avg(p.rank), 2),
           round(count(*) filter (where p.rank = 1)::numeric / count(*), 3)
      from public.game_players p
      join public.games g on g.id = p.game_id
      join public.profiles pr on pr.id = p.user_id
      left join public.club_members m on m.club_id = g.club_id and m.user_id = p.user_id
     where g.club_id = p_club_id and g.status = 'settled'
       and (p_from is null or g.ended_at >= p_from) and (p_to is null or g.ended_at < p_to)
     group by p.user_id, pr.display_name, m.alias
     order by sum(p.point_delta) desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

-- エージェント配下の収支（オーナーは任意のエージェント、エージェントは自分だけ）
create or replace function public.agent_downline_summary(p_club_id uuid, p_agent_id uuid default null,
                                                         p_from timestamptz default null, p_to timestamptz default null)
returns table (user_id uuid, display_name text, alias text, status text, balance bigint, games bigint,
               game_result bigint, fee_paid bigint, received bigint, returned bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_agent uuid := coalesce(p_agent_id, auth.uid());
begin
  if not coalesce((private.is_club_owner(p_club_id) or private.is_platform_admin()
          or (v_agent = auth.uid() and coalesce(private.member_role(p_club_id), '') = 'agent')), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select m.user_id, pr.display_name, m.alias, m.status,
           coalesce(b.balance, 0),
           (select count(distinct l.game_id) from public.point_ledger l
             where l.club_id = p_club_id and l.account_id = m.user_id and l.kind = 'game_result'
               and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to))::bigint,
           coalesce(sum(l.amount) filter (where l.kind = 'game_result'), 0)::bigint,
           coalesce(-sum(l.amount) filter (where l.kind = 'fee'), 0)::bigint,
           coalesce(sum(l.amount) filter (where l.kind = 'transfer' and l.amount > 0), 0)::bigint,
           coalesce(-sum(l.amount) filter (where l.kind = 'transfer' and l.amount < 0), 0)::bigint
      from public.club_members m
      join public.profiles pr on pr.id = m.user_id
      left join public.point_balances b on b.club_id = m.club_id and b.account_id = m.user_id
      left join public.point_ledger l on l.club_id = m.club_id and l.account_id = m.user_id
                                     and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
     where m.club_id = p_club_id and m.agent_id = v_agent and m.status in ('active', 'removed')
     group by m.user_id, pr.display_name, m.alias, m.status, b.balance;
end $$;

-- クラブの Fee 収入（日別。オーナー・プラットフォーマー）
create or replace function public.club_fee_income(p_club_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (day date, games bigint, fee_total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((private.is_club_owner(p_club_id) or private.is_platform_admin()), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select (l.created_at at time zone 'Asia/Tokyo')::date, count(distinct l.game_id)::bigint, sum(l.amount)::bigint
      from public.point_ledger l
     where l.club_id = p_club_id and l.account_kind = 'treasury' and l.kind = 'fee'
       and (p_from is null or l.created_at >= p_from) and (p_to is null or l.created_at < p_to)
     group by 1 order by 1 desc;
end $$;

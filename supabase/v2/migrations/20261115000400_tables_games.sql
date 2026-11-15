-- =====================================================================
-- v2 / 0400 tables & games: 卓・着席・対局結果・局ごとの結果
-- 1卓 = 1対局（開設のたびにダイヤを消費）。連戦卓は未決（README）。
-- =====================================================================

create table public.tables (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id),
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  player_count smallint not null check (player_count in (3, 4)),
  game_length  text not null check (game_length in ('east', 'south')),   -- 東風 / 半荘
  rate         bigint not null check (rate > 0),          -- スコア 1.0（=1000点）あたりのポイント
  min_buyin    bigint not null default 0 check (min_buyin >= 0),  -- 着席に必要な最低持ち点
  rules        jsonb not null check (jsonb_typeof(rules) = 'object'),
  status       text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'aborted')),
  created_by   uuid not null references public.profiles(id),
  diamond_cost bigint not null default 0 check (diamond_cost >= 0),
  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
create index tables_club_status_idx on public.tables (club_id, status);

create table public.table_seats (
  table_id  uuid not null references public.tables(id),
  seat      smallint not null check (seat between 0 and 3),
  user_id   uuid not null references public.profiles(id),
  joined_at timestamptz not null default now(),
  primary key (table_id, seat),
  unique (table_id, user_id)
);
create index table_seats_user_idx on public.table_seats (user_id);

create table public.games (
  id             uuid primary key,                       -- 対局サーバーが採番
  table_id       uuid not null unique references public.tables(id),
  club_id        uuid not null references public.clubs(id),
  status         text not null default 'playing' check (status in ('playing', 'settled', 'aborted')),
  player_count   smallint not null check (player_count in (3, 4)),
  game_length    text not null,
  rate           bigint not null,
  rules_snapshot jsonb not null,
  fee_snapshot   jsonb not null,                         -- 精算時点の Fee 設定
  fee_total      bigint not null default 0,
  kifu_path      text check (kifu_path is null or char_length(kifu_path) <= 512),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  settled_at     timestamptz
);
create index games_club_ended_idx on public.games (club_id, ended_at desc);

create table public.game_players (
  game_id      uuid not null references public.games(id),
  seat         smallint not null check (seat between 0 and 3),
  user_id      uuid not null references public.profiles(id),
  final_points integer,
  rank         smallint check (rank between 1 and 4),
  score_x10    integer,      -- ウマ・オカ込みのスコア×10（例: +45.0 → 450）
  raw_delta    bigint,       -- 上限処理前のポイント増減
  point_delta  bigint,       -- 実際のポイント増減（Fee 控除前）
  fee          bigint not null default 0,
  primary key (game_id, seat),
  unique (game_id, user_id)
);
create index game_players_user_idx on public.game_players (user_id);

create table public.game_rounds (
  game_id     uuid not null references public.games(id),
  round_index integer not null check (round_index >= 0),
  result      jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at  timestamptz not null default now(),
  primary key (game_id, round_index)
);

-- 確定した対局結果は書き換え禁止
create or replace function private.game_players_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'game_players_immutable' using errcode = '42501';
  end if;
  if exists (select 1 from public.games g where g.id = old.game_id and g.status = 'settled') then
    raise exception 'game_players_immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger game_players_lock before update or delete on public.game_players
  for each row execute function private.game_players_lock();

create trigger game_rounds_no_mut before update or delete on public.game_rounds
  for each row execute function private.forbid_mutation();

-- 既定ルール（エンジン側が詳細を検証する。DB は精算に使うキーだけ厳密に見る）
create or replace function private.base_rules(p_player_count int)
returns jsonb language sql immutable set search_path = '' as $$
  select case p_player_count
    when 4 then '{"start_points":25000,"return_points":30000,"uma":[15,5,-5,-15],"kuitan":true,"aka":3}'::jsonb
    else        '{"start_points":35000,"return_points":40000,"uma":[15,0,-15],"aka":2,"kita_nuki":true}'::jsonb
  end;
$$;

create or replace function private.validate_rules(p_rules jsonb, p_player_count int)
returns void language plpgsql immutable set search_path = '' as $$
declare v_uma jsonb; s int := 0; e jsonb;
begin
  if jsonb_typeof(p_rules) <> 'object' or octet_length(p_rules::text) > 8192 then
    raise exception 'invalid_rules: object <= 8KB';
  end if;
  if jsonb_typeof(p_rules -> 'start_points') <> 'number' or jsonb_typeof(p_rules -> 'return_points') <> 'number' then
    raise exception 'invalid_rules: start_points/return_points';
  end if;
  if (p_rules ->> 'start_points')::numeric % 100 <> 0 or (p_rules ->> 'return_points')::numeric % 100 <> 0
     or (p_rules ->> 'start_points')::numeric <= 0
     or (p_rules ->> 'return_points')::numeric < (p_rules ->> 'start_points')::numeric then
    raise exception 'invalid_rules: points must be multiples of 100 and return >= start';
  end if;
  v_uma := p_rules -> 'uma';
  if jsonb_typeof(v_uma) <> 'array' or jsonb_array_length(v_uma) <> p_player_count then
    raise exception 'invalid_rules: uma length';
  end if;
  for e in select * from jsonb_array_elements(v_uma) loop
    if jsonb_typeof(e) <> 'number' or (e #>> '{}')::numeric <> trunc((e #>> '{}')::numeric) then
      raise exception 'invalid_rules: uma must be integers';
    end if;
    s := s + (e #>> '{}')::int;
  end loop;
  if s <> 0 then raise exception 'invalid_rules: uma must sum to 0'; end if;
end $$;

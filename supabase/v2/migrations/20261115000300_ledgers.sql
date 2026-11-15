-- =====================================================================
-- v2 / 0300 ledgers: ダイヤ台帳・ポイント台帳（追記のみ・ハッシュ連鎖）と残高
--
-- ・台帳への書き込みは private.post_point / private.post_diamond だけ。
--   両関数はトランザクション内フラグ app.ledger_write を立てた間だけ書ける。
-- ・残高テーブルは台帳と同じ関数・同じトランザクションでのみ更新される。
-- ・UPDATE / DELETE / TRUNCATE はトリガーで常に拒否（postgres でも拒否）。
-- ・チェーンはクラブ単位（seq がクラブ内で連番、prev_hash → hash）。
-- =====================================================================

create table public.point_ledger (
  id              bigint generated always as identity primary key,
  club_id         uuid not null references public.clubs(id),
  seq             bigint not null,
  account_id      uuid not null,          -- 会員: user_id ／ クラブ金庫: club_id
  account_kind    text not null check (account_kind in ('member', 'treasury')),
  kind            text not null check (kind in ('issue', 'burn', 'transfer', 'game_result', 'fee', 'adjust')),
  amount          bigint not null check (amount <> 0),
  balance_after   bigint not null,
  tx_id           uuid not null,          -- 同じ取引の行（借方・貸方）を束ねる
  counterparty_id uuid,
  game_id         uuid,
  actor_id        uuid,
  memo            text check (memo is null or char_length(memo) <= 200),
  prev_hash       text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash            text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz not null,
  unique (club_id, seq),
  check ((account_kind = 'treasury') = (account_id = club_id))
);
create index point_ledger_account_idx on public.point_ledger (club_id, account_id, seq);
create index point_ledger_tx_idx on public.point_ledger (tx_id);
-- 二重精算の最後の砦: 1局につき 1口座 1種別 1行
create unique index point_ledger_game_once on public.point_ledger (game_id, account_id, kind) where game_id is not null;

create table public.point_balances (
  club_id      uuid not null references public.clubs(id),
  account_id   uuid not null,
  account_kind text not null check (account_kind in ('member', 'treasury')),
  balance      bigint not null default 0,
  last_seq     bigint not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (club_id, account_id)
);

create table public.diamond_ledger (
  id            bigint generated always as identity primary key,
  club_id       uuid not null references public.clubs(id),
  seq           bigint not null,
  kind          text not null check (kind in ('grant', 'club_create', 'table_open', 'maintenance', 'adjust')),
  amount        bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  table_id      uuid,
  actor_id      uuid,
  memo          text check (memo is null or char_length(memo) <= 200),
  prev_hash     text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash          text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null,
  unique (club_id, seq)
);

create table public.diamond_balances (
  club_id    uuid primary key references public.clubs(id),
  balance    bigint not null default 0 check (balance >= 0),
  last_seq   bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- チェーンの先頭（クラブ×台帳種別）。この行のロックでクラブ内の書き込みを直列化する
create table private.ledger_heads (
  club_id   uuid not null,
  ledger    text not null check (ledger in ('point', 'diamond')),
  last_seq  bigint not null default 0,
  last_hash text not null default repeat('0', 64),
  primary key (club_id, ledger)
);

-- ---------------------------------------------------------------------
-- ガード
-- ---------------------------------------------------------------------
create or replace function private.ledger_insert_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('app.ledger_write', true), '') <> 'on' then
    raise exception 'ledger_direct_write_forbidden: %', tg_table_name using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['point_ledger', 'diamond_ledger'] loop
    execute format('create trigger %1$s_guard_ins before insert on public.%1$s for each row execute function private.ledger_insert_guard()', t);
    execute format('create trigger %1$s_no_mut before update or delete on public.%1$s for each row execute function private.forbid_mutation()', t);
    execute format('create trigger %1$s_no_trunc before truncate on public.%1$s for each statement execute function private.forbid_mutation()', t);
  end loop;
  foreach t in array array['point_balances', 'diamond_balances'] loop
    execute format('create trigger %1$s_guard_ins before insert or update on public.%1$s for each row execute function private.ledger_insert_guard()', t);
    execute format('create trigger %1$s_no_del before delete on public.%1$s for each row execute function private.forbid_mutation()', t);
    execute format('create trigger %1$s_no_trunc before truncate on public.%1$s for each statement execute function private.forbid_mutation()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- ハッシュ（検証でも同じ関数を使う）
-- ---------------------------------------------------------------------
create or replace function private.point_row_hash(
  p_prev text, p_club uuid, p_seq bigint, p_account uuid, p_account_kind text, p_kind text,
  p_amount bigint, p_balance_after bigint, p_tx uuid, p_counterparty uuid, p_game uuid,
  p_actor uuid, p_memo text, p_created timestamptz)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(
    p_prev || '|' || p_club::text || '|' || p_seq::text || '|' || p_account::text || '|' || p_account_kind || '|' ||
    p_kind || '|' || p_amount::text || '|' || p_balance_after::text || '|' || p_tx::text || '|' ||
    coalesce(p_counterparty::text, '') || '|' || coalesce(p_game::text, '') || '|' || coalesce(p_actor::text, '') || '|' ||
    coalesce(p_memo, '') || '|' || to_char(p_created at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'sha256'), 'hex');
$$;

create or replace function private.diamond_row_hash(
  p_prev text, p_club uuid, p_seq bigint, p_kind text, p_amount bigint, p_balance_after bigint,
  p_table uuid, p_actor uuid, p_memo text, p_created timestamptz)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(
    p_prev || '|' || p_club::text || '|' || p_seq::text || '|' || p_kind || '|' || p_amount::text || '|' ||
    p_balance_after::text || '|' || coalesce(p_table::text, '') || '|' || coalesce(p_actor::text, '') || '|' ||
    coalesce(p_memo, '') || '|' || to_char(p_created at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------
-- 台帳への記帳（唯一の書き込み口）
-- 戻り値: 記帳後の残高。p_allow_negative=false で残高が負になるなら例外。
-- ---------------------------------------------------------------------
create or replace function private.post_point(
  p_club_id uuid, p_account_id uuid, p_kind text, p_amount bigint, p_tx_id uuid,
  p_counterparty uuid default null, p_game_id uuid default null, p_memo text default null,
  p_allow_negative boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_kind_acc text := case when p_account_id = p_club_id then 'treasury' else 'member' end;
  v_head  private.ledger_heads%rowtype;
  v_bal   bigint;
  v_new   bigint;
  v_now   timestamptz := now();
  v_hash  text;
begin
  if p_amount = 0 then return null; end if;

  -- クラブの point チェーンをロック（クラブ内の記帳はここで直列化される）
  insert into private.ledger_heads (club_id, ledger) values (p_club_id, 'point') on conflict do nothing;
  select * into v_head from private.ledger_heads where club_id = p_club_id and ledger = 'point' for update;

  perform set_config('app.ledger_write', 'on', true);

  select balance into v_bal from public.point_balances
   where club_id = p_club_id and account_id = p_account_id for update;
  if not found then
    insert into public.point_balances (club_id, account_id, account_kind, balance)
    values (p_club_id, p_account_id, v_kind_acc, 0);
    v_bal := 0;
  end if;

  v_new := v_bal + p_amount;
  if v_new < 0 and not p_allow_negative then
    perform set_config('app.ledger_write', 'off', true);
    raise exception 'insufficient_balance' using errcode = 'P0001',
      detail = format('account=%s balance=%s amount=%s', p_account_id, v_bal, p_amount);
  end if;

  v_hash := private.point_row_hash(v_head.last_hash, p_club_id, v_head.last_seq + 1, p_account_id, v_kind_acc,
                                   p_kind, p_amount, v_new, p_tx_id, p_counterparty, p_game_id, auth.uid(), p_memo, v_now);

  insert into public.point_ledger (club_id, seq, account_id, account_kind, kind, amount, balance_after, tx_id,
                                   counterparty_id, game_id, actor_id, memo, prev_hash, hash, created_at)
  values (p_club_id, v_head.last_seq + 1, p_account_id, v_kind_acc, p_kind, p_amount, v_new, p_tx_id,
          p_counterparty, p_game_id, auth.uid(), p_memo, v_head.last_hash, v_hash, v_now);

  update public.point_balances set balance = v_new, last_seq = v_head.last_seq + 1, updated_at = v_now
   where club_id = p_club_id and account_id = p_account_id;

  update private.ledger_heads set last_seq = v_head.last_seq + 1, last_hash = v_hash
   where club_id = p_club_id and ledger = 'point';

  perform set_config('app.ledger_write', 'off', true);
  return v_new;
end $$;

create or replace function private.post_diamond(
  p_club_id uuid, p_kind text, p_amount bigint, p_table_id uuid default null, p_memo text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_head private.ledger_heads%rowtype;
  v_bal  bigint;
  v_new  bigint;
  v_now  timestamptz := now();
  v_hash text;
begin
  if p_amount = 0 then return null; end if;

  insert into private.ledger_heads (club_id, ledger) values (p_club_id, 'diamond') on conflict do nothing;
  select * into v_head from private.ledger_heads where club_id = p_club_id and ledger = 'diamond' for update;

  perform set_config('app.ledger_write', 'on', true);

  select balance into v_bal from public.diamond_balances where club_id = p_club_id for update;
  if not found then
    insert into public.diamond_balances (club_id, balance) values (p_club_id, 0);
    v_bal := 0;
  end if;

  v_new := v_bal + p_amount;
  if v_new < 0 then
    perform set_config('app.ledger_write', 'off', true);
    raise exception 'insufficient_diamonds' using errcode = 'P0001',
      detail = format('club=%s balance=%s amount=%s', p_club_id, v_bal, p_amount);
  end if;

  v_hash := private.diamond_row_hash(v_head.last_hash, p_club_id, v_head.last_seq + 1, p_kind, p_amount, v_new,
                                     p_table_id, auth.uid(), p_memo, v_now);

  insert into public.diamond_ledger (club_id, seq, kind, amount, balance_after, table_id, actor_id, memo,
                                     prev_hash, hash, created_at)
  values (p_club_id, v_head.last_seq + 1, p_kind, p_amount, v_new, p_table_id, auth.uid(), p_memo,
          v_head.last_hash, v_hash, v_now);

  update public.diamond_balances set balance = v_new, last_seq = v_head.last_seq + 1, updated_at = v_now
   where club_id = p_club_id;
  update private.ledger_heads set last_seq = v_head.last_seq + 1, last_hash = v_hash
   where club_id = p_club_id and ledger = 'diamond';

  perform set_config('app.ledger_write', 'off', true);
  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- 検証: チェーン・balance_after の連続性・残高テーブルとの一致
-- 返り値が 0 行なら正常
-- ---------------------------------------------------------------------
create or replace function private.verify_point_chain_impl(p_club_id uuid)
returns table (seq bigint, problem text) language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v_prev text := repeat('0', 64);
  v_expect_seq bigint := 1;
  v_running jsonb := '{}'::jsonb;
  v_prev_bal bigint;
begin
  for r in select * from public.point_ledger l where l.club_id = p_club_id order by l.seq loop
    if r.seq <> v_expect_seq then seq := r.seq; problem := 'seq_gap'; return next; end if;
    if r.prev_hash <> v_prev then seq := r.seq; problem := 'prev_hash_mismatch'; return next; end if;
    if r.hash <> private.point_row_hash(r.prev_hash, r.club_id, r.seq, r.account_id, r.account_kind, r.kind, r.amount,
                                        r.balance_after, r.tx_id, r.counterparty_id, r.game_id, r.actor_id, r.memo, r.created_at) then
      seq := r.seq; problem := 'hash_mismatch'; return next;
    end if;
    v_prev_bal := coalesce((v_running ->> r.account_id::text)::bigint, 0);
    if v_prev_bal + r.amount <> r.balance_after then
      seq := r.seq; problem := 'balance_after_mismatch'; return next;
    end if;
    v_running := v_running || jsonb_build_object(r.account_id::text, r.balance_after);
    v_prev := r.hash;
    v_expect_seq := r.seq + 1;
  end loop;

  for r in select b.account_id, b.balance from public.point_balances b where b.club_id = p_club_id loop
    if coalesce((v_running ->> r.account_id::text)::bigint, 0) <> r.balance then
      seq := null; problem := 'balance_table_mismatch:' || r.account_id::text; return next;
    end if;
  end loop;

  -- 取引ごとの借方貸方: transfer は tx 内で合計 0
  for r in select l.tx_id from public.point_ledger l
            where l.club_id = p_club_id and l.kind = 'transfer'
            group by l.tx_id having sum(l.amount) <> 0 loop
    seq := null; problem := 'transfer_not_balanced:' || r.tx_id::text; return next;
  end loop;
end $$;

create or replace function private.verify_diamond_chain_impl(p_club_id uuid)
returns table (seq bigint, problem text) language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v_prev text := repeat('0', 64);
  v_expect_seq bigint := 1;
  v_bal bigint := 0;
begin
  for r in select * from public.diamond_ledger l where l.club_id = p_club_id order by l.seq loop
    if r.seq <> v_expect_seq then seq := r.seq; problem := 'seq_gap'; return next; end if;
    if r.prev_hash <> v_prev then seq := r.seq; problem := 'prev_hash_mismatch'; return next; end if;
    if r.hash <> private.diamond_row_hash(r.prev_hash, r.club_id, r.seq, r.kind, r.amount, r.balance_after,
                                          r.table_id, r.actor_id, r.memo, r.created_at) then
      seq := r.seq; problem := 'hash_mismatch'; return next;
    end if;
    if v_bal + r.amount <> r.balance_after then seq := r.seq; problem := 'balance_after_mismatch'; return next; end if;
    v_bal := r.balance_after;
    v_prev := r.hash;
    v_expect_seq := r.seq + 1;
  end loop;
  if coalesce((select b.balance from public.diamond_balances b where b.club_id = p_club_id), 0) <> v_bal then
    seq := null; problem := 'balance_table_mismatch'; return next;
  end if;
end $$;

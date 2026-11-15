-- =====================================================================
-- テスト用ハーネス（ローカル検証 DB にだけ作る）
--   test.run(label, sql)  : label のユーザーになりすまして sql を実行し、1列目を text で返す。エラーなら 'ERROR: ...'
--   test.ok / test.err / test.eq : 結果を test.results に記録
-- label: 'anon' / 'service' / test.users に登録したラベル
-- なりすましは Supabase と同じく  set local role + request.jwt.claims
-- =====================================================================
create schema test;
create table test.results (id serial primary key, name text not null, ok boolean not null, detail text);
create table test.users (label text primary key, id uuid not null unique);
create table test.vars (k text primary key, v text);

create function test.uid(p_label text) returns uuid language sql stable as $$
  select id from test.users where label = p_label;
$$;
create function test.v(p_k text) returns text language sql stable as $$
  select v from test.vars where k = p_k;
$$;
create function test.setv(p_k text, p_v text) returns text language sql as $$
  insert into test.vars values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v;
$$;

create function test.run(p_label text, p_sql text) returns text language plpgsql as $$
declare v_role text; v_claims jsonb; v_out text;
begin
  if p_label = 'anon' then
    v_role := 'anon'; v_claims := '{"role":"anon"}';
  elsif p_label = 'service' then
    v_role := 'service_role'; v_claims := '{"role":"service_role"}';
  else
    v_role := 'authenticated';
    v_claims := jsonb_build_object('sub', test.uid(p_label), 'role', 'authenticated');
    if test.uid(p_label) is null then raise exception 'unknown test user %', p_label; end if;
  end if;
  perform set_config('request.jwt.claims', v_claims::text, true);
  execute format('set local role %I', v_role);
  begin
    execute p_sql into v_out;
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    return 'ERROR: ' || sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return coalesce(v_out, '<null>');
end $$;

create function test.ok(p_name text, p_label text, p_sql text) returns text language plpgsql as $$
declare r text := test.run(p_label, p_sql);
begin
  insert into test.results (name, ok, detail) values (p_name, r not like 'ERROR:%', r);
  return r;
end $$;

-- エラーになるべき。p_pattern を含むエラーであること（大文字小文字無視）
create function test.err(p_name text, p_label text, p_sql text, p_pattern text) returns text language plpgsql as $$
declare r text := test.run(p_label, p_sql);
begin
  insert into test.results (name, ok, detail)
  values (p_name, r like 'ERROR:%' and r ilike '%' || p_pattern || '%', r);
  return r;
end $$;

create function test.eq(p_name text, p_label text, p_sql text, p_expected text) returns text language plpgsql as $$
declare r text := test.run(p_label, p_sql);
begin
  insert into test.results (name, ok, detail)
  values (p_name, r = p_expected, format('got=%s expected=%s', r, p_expected));
  return r;
end $$;

-- postgres（マイグレーション実行者）として直接チェックする
create function test.check(p_name text, p_cond boolean, p_detail text default null) returns void language sql as $$
  insert into test.results (name, ok, detail) values (p_name, coalesce(p_cond, false), p_detail);
$$;

-- クラブ内ポイントの総量（全会員＋金庫）
create function test.club_total(p_club uuid) returns bigint language sql stable as $$
  select coalesce(sum(balance), 0)::bigint from public.point_balances where club_id = p_club;
$$;
create function test.club_issued(p_club uuid) returns bigint language sql stable as $$
  select coalesce(sum(amount), 0)::bigint from public.point_ledger where club_id = p_club and kind in ('issue', 'burn');
$$;
create function test.bal(p_club uuid, p_account uuid) returns bigint language sql stable as $$
  select coalesce((select balance from public.point_balances where club_id = p_club and account_id = p_account), 0);
$$;

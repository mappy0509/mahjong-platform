-- =====================================================================
-- v2 / 0100 base: 拡張・private スキーマ・設定値・プロフィール・プラットフォーマー
-- 方針: RLS は既定で拒否。書き込みは SECURITY DEFINER の RPC だけ。
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- API に公開しない内部スキーマ（RLS 補助関数・台帳書き込み関数・チェーンの先頭）
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 設定値（具体値は仮置き。要確認）
-- ---------------------------------------------------------------------
create table public.platform_settings (
  key         text primary key check (key ~ '^[a-z0-9_]{1,64}$'),
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

insert into public.platform_settings (key, value, description) values
  ('club_create_open',                  'true',      '一般ユーザーがクラブを作れるか（false ならプラットフォーマーのみ）【要確認】'),
  ('max_clubs_per_owner',               '3',         '1人が所有できるクラブ数の上限【要確認】'),
  ('initial_diamonds_on_club_create',   '0',         'クラブ作成時に自動付与するダイヤ【要確認】'),
  ('diamond_cost_club_create',          '0',         'クラブ作成で消費するダイヤ【要確認】'),
  ('diamond_cost_table_open_4p',        '1',         '4人卓を開設するときのダイヤ消費【要確認】'),
  ('diamond_cost_table_open_3p',        '1',         '3人卓を開設するときのダイヤ消費【要確認】'),
  ('diamond_cost_club_maintenance_daily','0',        'クラブ維持の日次ダイヤ消費（charge_club_maintenance で徴収）【要確認】'),
  ('max_point_amount',                  '1000000000','1回の配布/回収/発行の上限【要確認】'),
  ('max_table_rate',                    '1000000',   '卓のレート上限（1.0スコアあたりのポイント）【要確認】');

-- ---------------------------------------------------------------------
-- プロフィール（auth.users と 1:1）
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  avatar_url   text check (avatar_url is null or (char_length(avatar_url) <= 512 and avatar_url ~ '^https://')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- プラットフォーマー権限（L1）。profiles にフラグを持たない
create table public.platform_admins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  note       text
);

-- ---------------------------------------------------------------------
-- 監査ログ（追記のみ）
-- ---------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  club_id    uuid,
  actor_id   uuid,
  actor_role text,
  action     text not null,
  target_id  uuid,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_club_idx on public.audit_log (club_id, created_at desc);

-- ---------------------------------------------------------------------
-- 補助関数
-- ---------------------------------------------------------------------
create or replace function private.uid_required()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v;
end $$;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function private.is_service_role()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role';
$$;

create or replace function private.setting_bigint(p_key text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select value into v from public.platform_settings where key = p_key;
  if v is null or jsonb_typeof(v) <> 'number' then
    raise exception 'setting_missing:%', p_key;
  end if;
  return (v #>> '{}')::bigint;
end $$;

create or replace function private.setting_bool(p_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select value into v from public.platform_settings where key = p_key;
  if v is null or jsonb_typeof(v) <> 'boolean' then
    raise exception 'setting_missing:%', p_key;
  end if;
  return (v #>> '{}')::boolean;
end $$;

-- 推測されにくいコード（招待コード用）。紛らわしい文字を除く
create or replace function private.random_code(p_len int)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(p_len);
  out text := '';
begin
  for i in 0 .. p_len - 1 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function private.audit(
  p_club_id uuid, p_action text, p_target uuid, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (club_id, actor_id, actor_role, action, target_id, detail)
  values (p_club_id, auth.uid(), coalesce(auth.role(), 'unknown'), p_action, p_target, coalesce(p_detail, '{}'::jsonb));
end $$;

-- 追記のみのテーブルを守るトリガー（UPDATE/DELETE/TRUNCATE は誰であっても拒否）
create or replace function private.forbid_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'append_only: % on % is not allowed', tg_op, tg_table_name using errcode = '42501';
end $$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.forbid_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.forbid_mutation();

-- updated_at
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- auth.users 作成時に profiles を作る
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  v_name := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 24);
  if v_name = '' then
    v_name := 'player_' || left(replace(new.id::text, '-', ''), 6);
  end if;
  insert into public.profiles (id, display_name) values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created_v2 after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- RPC: 自分のプロフィール更新
-- ---------------------------------------------------------------------
create or replace function public.update_profile(p_display_name text, p_avatar_url text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required();
begin
  update public.profiles
     set display_name = btrim(p_display_name),
         avatar_url   = p_avatar_url
   where id = v_uid;
  if not found then raise exception 'profile_not_found'; end if;
end $$;

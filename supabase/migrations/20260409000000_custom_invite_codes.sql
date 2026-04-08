-- =============================================
-- Allow user-customized invite codes for clubs
-- =============================================

-- Replace create_club to accept an optional invite_code argument.
-- If provided: validates length 4-20 and pattern (a-z0-9_-, lowercased).
-- If null/empty: falls back to the random hex default from the column.
create or replace function public.create_club(
  p_name text,
  p_description text default null,
  p_invite_code text default null
)
returns table (id uuid, name text, description text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_club public.clubs%rowtype;
  normalized_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_invite_code is not null and length(trim(p_invite_code)) > 0 then
    normalized_code := lower(trim(p_invite_code));

    if length(normalized_code) < 4 or length(normalized_code) > 20 then
      raise exception '招待コードは4〜20文字で入力してください';
    end if;

    if normalized_code !~ '^[a-z0-9_-]+$' then
      raise exception '招待コードには英数字・ハイフン・アンダースコアのみ使用できます';
    end if;

    if exists (select 1 from public.clubs where invite_code = normalized_code) then
      raise exception 'この招待コードはすでに使われています';
    end if;

    insert into public.clubs (name, description, owner_id, invite_code)
    values (p_name, p_description, auth.uid(), normalized_code)
    returning * into new_club;
  else
    insert into public.clubs (name, description, owner_id)
    values (p_name, p_description, auth.uid())
    returning * into new_club;
  end if;

  insert into public.club_memberships (club_id, user_id, role)
  values (new_club.id, auth.uid(), 'owner');

  return query select new_club.id, new_club.name, new_club.description, new_club.invite_code;
end;
$$;

grant execute on function public.create_club(text, text, text) to authenticated;

-- Allow an owner to change the invite code of an existing club they own.
create or replace function public.update_club_invite_code(
  p_club_id uuid,
  p_new_invite_code text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  club_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select owner_id into club_owner from public.clubs where id = p_club_id;
  if club_owner is null then
    raise exception 'クラブが見つかりません';
  end if;
  if club_owner <> auth.uid() then
    raise exception 'このクラブのオーナーではありません';
  end if;

  normalized_code := lower(trim(coalesce(p_new_invite_code, '')));

  if length(normalized_code) < 4 or length(normalized_code) > 20 then
    raise exception '招待コードは4〜20文字で入力してください';
  end if;

  if normalized_code !~ '^[a-z0-9_-]+$' then
    raise exception '招待コードには英数字・ハイフン・アンダースコアのみ使用できます';
  end if;

  if exists (select 1 from public.clubs where invite_code = normalized_code and id <> p_club_id) then
    raise exception 'この招待コードはすでに使われています';
  end if;

  update public.clubs set invite_code = normalized_code where id = p_club_id;

  return normalized_code;
end;
$$;

grant execute on function public.update_club_invite_code(uuid, text) to authenticated;

-- join_club_by_code: normalize the input so codes are case-insensitive
create or replace function public.join_club_by_code(p_invite_code text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_club public.clubs%rowtype;
  normalized_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  normalized_code := lower(trim(coalesce(p_invite_code, '')));
  if length(normalized_code) = 0 then
    raise exception '招待コードを入力してください';
  end if;

  select * into target_club from public.clubs where invite_code = normalized_code;
  if target_club.id is null then
    raise exception '招待コードが無効です';
  end if;

  insert into public.club_memberships (club_id, user_id, role)
  values (target_club.id, auth.uid(), 'member')
  on conflict (club_id, user_id) do nothing;

  return query select target_club.id, target_club.name;
end;
$$;

-- =====================================================================
-- v2 / 1000 RPC: プラットフォーム設定の変更（プラットフォーマーのみ）
-- 既存キーの値だけを変えられる。型（number / boolean）は既存値と同じでなければ拒否。数値は 0 以上の整数。
-- =====================================================================
create or replace function public.set_platform_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.uid_required(); v_old jsonb;
begin
  if not private.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select value into v_old from public.platform_settings where key = p_key for update;
  if v_old is null then raise exception 'setting_not_found'; end if;
  if p_value is null or jsonb_typeof(p_value) <> jsonb_typeof(v_old) then raise exception 'invalid_setting_type'; end if;
  if jsonb_typeof(p_value) = 'number' then
    if (p_value #>> '{}')::numeric < 0 or (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric)
       or (p_value #>> '{}')::numeric > 9000000000000000 then
      raise exception 'invalid_setting_value';
    end if;
  end if;
  update public.platform_settings set value = p_value, updated_at = now(), updated_by = v_uid where key = p_key;
  perform private.audit(null, 'set_platform_setting', null, jsonb_build_object('key', p_key, 'from', v_old, 'to', p_value));
end $$;

-- 新しく足した関数は既定権限を明示的に外してから渡す（0900 は作成済みのものにしか効かない）
revoke all on function public.set_platform_setting(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.set_platform_setting(text, jsonb) to authenticated;

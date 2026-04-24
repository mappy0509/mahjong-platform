-- =============================================
-- Harden SECURITY DEFINER functions + tighten auto-action cron
-- =============================================

-- 1) get_point_balance is SECURITY DEFINER but had no explicit search_path,
--    which exposes it to search_path injection (an attacker could point
--    `point_transactions` at a malicious schema). Pin to public/extensions.

create or replace function public.get_point_balance(p_user_id uuid, p_club_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select balance_after from point_transactions
     where user_id = p_user_id and club_id = p_club_id
     order by created_at desc limit 1),
    0
  );
$$;

-- 2) Replace the auto-action cron job to call the Edge Function with the
--    SERVICE_ROLE_KEY instead of the anon key. auto-action now requires
--    service_role auth (see supabase/functions/auto-action/index.ts).
--
--    The service role key is read from a secret stored via:
--      select vault.create_secret('<your service role key>', 'service_role_key');
--    (run once, outside of this migration, to avoid leaking the key into
--    migration history)

do $$
declare
  service_key text;
begin
  -- Try to fetch the key from vault if the vault extension is present.
  begin
    select decrypted_secret into service_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception when others then
    service_key := null;
  end;

  if service_key is null then
    raise notice 'service_role_key not found in vault; skipping cron update. '
      'Run vault.create_secret(<key>, ''service_role_key'') and then re-run '
      'the cron update block at the bottom of this migration manually.';
    return;
  end if;

  -- Unschedule the old job (if any) and reschedule with the service role key
  perform cron.unschedule('invoke-auto-action')
  where exists (select 1 from cron.job where jobname = 'invoke-auto-action');

  perform cron.schedule(
    'invoke-auto-action',
    '* * * * *',
    format($cron$
      select net.http_post(
        url := 'https://qdiohxkbmgsbqytwanpn.supabase.co/functions/v1/auto-action',
        headers := jsonb_build_object(
          'Authorization', 'Bearer %s',
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $cron$, service_key)
  );
end;
$$;

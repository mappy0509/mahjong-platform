-- =====================================================================
-- 役割ごとのなりすましテスト
--   admin(L1) / owner(L2) / agent1, agent2(L3) / p1..p5(L4) / outsider(別クラブのオーナー) / anon / service
-- =====================================================================
\set QUIET on
\pset tuples_only on
\pset format unaligned
\o /dev/null

-- ---------- ユーザー作成（auth.users → profiles はトリガー） ----------
insert into test.users (label, id) values
  ('admin', gen_random_uuid()), ('owner', gen_random_uuid()), ('agent1', gen_random_uuid()), ('agent2', gen_random_uuid()),
  ('p1', gen_random_uuid()), ('p2', gen_random_uuid()), ('p3', gen_random_uuid()), ('p4', gen_random_uuid()),
  ('p5', gen_random_uuid()), ('outsider', gen_random_uuid());
insert into auth.users (id, raw_user_meta_data)
  select id, jsonb_build_object('display_name', label) from test.users;
select test.check('profile created by trigger', (select count(*) from public.profiles) = 10);
-- プラットフォーマー付与はマイグレーション実行者（人間）が行う運用
insert into public.platform_admins (user_id, note) values (test.uid('admin'), 'test');

-- ---------- anon ----------
select test.err('anon cannot select profiles', 'anon', 'select count(*) from public.profiles', 'permission denied');
select test.err('anon cannot select clubs', 'anon', 'select count(*) from public.clubs', 'permission denied');
select test.err('anon cannot select point_ledger', 'anon', 'select count(*) from public.point_ledger', 'permission denied');
select test.err('anon cannot create_club', 'anon', 'select public.create_club(''x'')', 'permission denied');
select test.err('anon cannot my_balances', 'anon', 'select count(*) from public.my_balances()', 'permission denied');

-- ---------- クラブ作成 ----------
select test.setv('A', test.ok('owner creates club A', 'owner', 'select public.create_club(''Club A'', ''desc'')::text'));
select test.setv('A_id', test.v('A')::jsonb ->> 'club_id');
select test.setv('A_code', test.v('A')::jsonb ->> 'club_code');
select test.setv('A_inv', test.v('A')::jsonb ->> 'invite_code');
select test.check('club_code is 6-8 digits', test.v('A_code') ~ '^[0-9]{6,8}$', test.v('A_code'));
select test.setv('B', test.ok('outsider creates club B', 'outsider', 'select public.create_club(''Club B'')::text'));
select test.setv('B_id', test.v('B')::jsonb ->> 'club_id');
select test.err('empty club name rejected', 'p1', 'select public.create_club(''   '')', 'check');

-- ---------- 参加申請と承認 ----------
select test.err('join with wrong invite code', 'p1',
  format('select public.request_join_club(%L, %L)', test.v('A_code'), 'WRONGCODE'), 'invalid_club_or_code');
select test.err('join with other club''s code', 'p1',
  format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('B')::jsonb ->> 'invite_code'), 'invalid_club_or_code');
select test.eq('outsider cannot see club A', 'outsider', format('select count(*) from public.clubs where id = %L', test.v('A_id')), '0');

select test.ok('agent1 requests join', 'agent1', format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('A_inv')));
select test.ok('agent2 requests join', 'agent2', format('select public.request_join_club(%L, %L)', test.v('A_code'), lower(test.v('A_inv'))));
select test.err('pending agent1 cannot approve self', 'agent1',
  format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('agent1')), 'forbidden');
select test.ok('owner approves agent1', 'owner', format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('agent1')));
select test.ok('owner approves agent2', 'owner', format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('agent2')));
select test.err('agent cannot set roles', 'agent1',
  format('select public.set_member_role(%L, %L, ''agent'')', test.v('A_id'), test.uid('agent2')), 'forbidden');
select test.setv('ag1_inv', test.ok('owner promotes agent1', 'owner',
  format('select public.set_member_role(%L, %L, ''agent'') ->> ''invite_code''', test.v('A_id'), test.uid('agent1'))));
select test.setv('ag2_inv', test.ok('owner promotes agent2', 'owner',
  format('select public.set_member_role(%L, %L, ''agent'') ->> ''invite_code''', test.v('A_id'), test.uid('agent2'))));

select test.ok('p1 requests via agent1 code', 'p1', format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('ag1_inv')));
select test.ok('p1 re-request while pending is idempotent', 'p1', format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('ag1_inv')));
select test.ok('p2 requests via agent1 code', 'p2', format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('ag1_inv')));
select test.ok('p3 requests via agent2 code', 'p3', format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('ag2_inv')));
select test.ok('p4 requests via club code', 'p4', format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('A_inv')));
select test.ok('p5 requests via club code', 'p5', format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('A_inv')));
select test.eq('pending p1 sees club A', 'p1', format('select count(*) from public.clubs where id = %L', test.v('A_id')), '1');
select test.eq('pending p1 sees no tables/members list', 'p1',
  format('select count(*) from public.club_members where club_id = %L and user_id <> auth.uid()', test.v('A_id')), '0');

select test.err('agent2 cannot approve agent1''s applicant', 'agent2',
  format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('p1')), 'forbidden');
select test.err('agent1 cannot approve owner-direct applicant', 'agent1',
  format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('p4')), 'forbidden');
select test.err('p1 cannot approve self', 'p1',
  format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('p1')), 'forbidden');
select test.err('outsider cannot approve', 'outsider',
  format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('p4')), 'forbidden');
select test.ok('agent1 approves p1', 'agent1', format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('p1')));
select test.ok('agent1 approves p2', 'agent1', format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('p2')));
select test.ok('agent2 approves p3', 'agent2', format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('p3')));
select test.ok('owner approves p4', 'owner', format('select public.approve_member(%L, %L)', test.v('A_id'), test.uid('p4')));
select test.err('p1 joins again while active', 'p1', format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('A_inv')), 'already_member');

-- ---------- 閲覧範囲 ----------
select test.eq('p1 sees 7 active members of A', 'p1',
  format('select count(*) from public.club_members where club_id = %L', test.v('A_id')), '7');
select test.eq('p1 does not see pending p5', 'p1',
  format('select count(*) from public.club_members where club_id = %L and status = ''pending''', test.v('A_id')), '0');
select test.eq('agent1 does not see owner-direct pending p5', 'agent1',
  format('select count(*) from public.club_members where club_id = %L and status = ''pending''', test.v('A_id')), '0');
select test.eq('owner sees pending p5', 'owner',
  format('select count(*) from public.club_members where club_id = %L and status = ''pending''', test.v('A_id')), '1');
select test.eq('owner sees pending p5 profile', 'owner', format('select count(*) from public.profiles where id = %L', test.uid('p5')), '1');
select test.eq('p1 does not see pending p5 profile', 'p1', format('select count(*) from public.profiles where id = %L', test.uid('p5')), '0');
select test.eq('outsider sees no members of A', 'outsider',
  format('select count(*) from public.club_members where club_id = %L', test.v('A_id')), '0');
select test.eq('outsider cannot see p1 profile', 'outsider', format('select count(*) from public.profiles where id = %L', test.uid('p1')), '0');
select test.eq('p1 sees p3 profile (same club)', 'p1', format('select count(*) from public.profiles where id = %L', test.uid('p3')), '1');
select test.eq('p1 sees no invite codes', 'p1', 'select count(*) from public.club_invite_codes', '0');
select test.eq('agent1 sees only own invite code', 'agent1',
  format('select count(*) filter (where agent_id is distinct from %L) || ''/'' || count(*) from public.club_invite_codes', test.uid('agent1')), '0/1');
select test.eq('admin sees club A', 'admin', format('select count(*) from public.clubs where id = %L', test.v('A_id')), '1');

-- ---------- 経済: 発行・配布・回収 ----------
select test.err('agent cannot issue points', 'agent1', format('select public.issue_points(%L, 1000)', test.v('A_id')), 'forbidden');
select test.err('player cannot issue points', 'p1', format('select public.issue_points(%L, 1000)', test.v('A_id')), 'forbidden');
select test.err('outsider cannot issue in A', 'outsider', format('select public.issue_points(%L, 1000)', test.v('A_id')), 'forbidden');
select test.eq('owner issues 100000', 'owner', format('select public.issue_points(%L, 100000)', test.v('A_id')), '100000');
select test.err('owner cannot burn more than treasury', 'owner', format('select public.issue_points(%L, -100001)', test.v('A_id')), 'insufficient_balance');

select test.ok('owner -> agent1 30000', 'owner', format('select public.transfer_points(%L, %L, 30000)', test.v('A_id'), test.uid('agent1')));
select test.ok('owner -> agent2 20000', 'owner', format('select public.transfer_points(%L, %L, 20000)', test.v('A_id'), test.uid('agent2')));
select test.ok('owner -> p4 10000', 'owner', format('select public.transfer_points(%L, %L, 10000)', test.v('A_id'), test.uid('p4')));
select test.ok('agent1 -> p1 10000', 'agent1', format('select public.transfer_points(%L, %L, 10000)', test.v('A_id'), test.uid('p1')));
select test.ok('agent1 -> p2 10000', 'agent1', format('select public.transfer_points(%L, %L, 10000)', test.v('A_id'), test.uid('p2')));
select test.ok('agent2 -> p3 10000', 'agent2', format('select public.transfer_points(%L, %L, 10000)', test.v('A_id'), test.uid('p3')));
select test.err('agent1 -> p3 (other agent''s downline)', 'agent1',
  format('select public.transfer_points(%L, %L, 100)', test.v('A_id'), test.uid('p3')), 'forbidden');
select test.err('agent1 -> p4 (owner-direct)', 'agent1',
  format('select public.transfer_points(%L, %L, 100)', test.v('A_id'), test.uid('p4')), 'forbidden');
select test.err('agent1 over own balance', 'agent1',
  format('select public.transfer_points(%L, %L, 10001)', test.v('A_id'), test.uid('p1')), 'insufficient_balance');
select test.ok('agent1 collects 2000 from p1', 'agent1', format('select public.transfer_points(%L, %L, -2000)', test.v('A_id'), test.uid('p1')));
select test.err('agent1 collects more than p1 has', 'agent1',
  format('select public.transfer_points(%L, %L, -999999)', test.v('A_id'), test.uid('p1')), 'insufficient_balance');
select test.err('player cannot transfer', 'p1', format('select public.transfer_points(%L, %L, 1)', test.v('A_id'), test.uid('p2')), 'forbidden');
select test.err('outsider cannot transfer in A', 'outsider',
  format('select public.transfer_points(%L, %L, 1)', test.v('A_id'), test.uid('p2')), 'forbidden');
select test.err('owner cannot pay pending p5', 'owner',
  format('select public.transfer_points(%L, %L, 1)', test.v('A_id'), test.uid('p5')), 'target_not_active_member');
select test.err('zero amount rejected', 'owner', format('select public.transfer_points(%L, %L, 0)', test.v('A_id'), test.uid('p4')), 'invalid_amount');
select test.check('balances after transfers',
  test.bal(test.v('A_id')::uuid, test.uid('p1')) = 8000 and test.bal(test.v('A_id')::uuid, test.uid('agent1')) = 12000
  and test.bal(test.v('A_id')::uuid, test.v('A_id')::uuid) = 40000);
select test.check('invariant: total == issued (after transfers)',
  test.club_total(test.v('A_id')::uuid) = test.club_issued(test.v('A_id')::uuid) and test.club_total(test.v('A_id')::uuid) = 100000);

-- 台帳への直接書き込み・改変
select test.err('owner direct insert into point_ledger', 'owner',
  format($q$insert into public.point_ledger (club_id, seq, account_id, account_kind, kind, amount, balance_after, tx_id, prev_hash, hash, created_at)
            values (%L, 999, auth.uid(), 'member', 'adjust', 1000000, 1000000, gen_random_uuid(), repeat('0',64), repeat('0',64), now()) returning id$q$,
         test.v('A_id')), 'permission denied');
select test.err('owner direct update of balance', 'owner',
  format('update public.point_balances set balance = 999999 where club_id = %L returning balance', test.v('A_id')), 'permission denied');
select test.err('service_role direct insert into point_ledger', 'service',
  format($q$insert into public.point_ledger (club_id, seq, account_id, account_kind, kind, amount, balance_after, tx_id, prev_hash, hash, created_at)
            values (%L, 999, %L, 'member', 'adjust', 1, 1, gen_random_uuid(), repeat('0',64), repeat('0',64), now()) returning id$q$,
         test.v('A_id'), test.uid('p1')), 'permission denied');
select test.err('service_role direct insert into diamond_balances', 'service',
  format('insert into public.diamond_balances (club_id, balance) values (%L, 5) returning balance', test.v('B_id')), 'permission denied');
select test.err('player calls private.post_point', 'p1',
  format('select private.post_point(%L, auth.uid(), ''adjust'', 1000000, gen_random_uuid())', test.v('A_id')), 'permission denied');
do $$ begin
  begin
    insert into public.point_ledger (club_id, seq, account_id, account_kind, kind, amount, balance_after, tx_id, prev_hash, hash, created_at)
    values (test.v('A_id')::uuid, 999, test.uid('p1'), 'member', 'adjust', 1, 1, gen_random_uuid(), repeat('0',64), repeat('0',64), now());
    perform test.check('superuser direct ledger insert blocked by trigger', false);
  exception when others then
    perform test.check('superuser direct ledger insert blocked by trigger', sqlerrm like 'ledger_direct_write_forbidden%', sqlerrm);
  end;
  begin
    update public.point_ledger set amount = amount + 1 where club_id = test.v('A_id')::uuid;
    perform test.check('superuser UPDATE ledger blocked', false);
  exception when others then
    perform test.check('superuser UPDATE ledger blocked', sqlerrm like 'append_only%', sqlerrm);
  end;
  begin
    delete from public.point_ledger where club_id = test.v('A_id')::uuid;
    perform test.check('superuser DELETE ledger blocked', false);
  exception when others then
    perform test.check('superuser DELETE ledger blocked', sqlerrm like 'append_only%', sqlerrm);
  end;
  begin
    truncate public.point_ledger;
    perform test.check('superuser TRUNCATE ledger blocked', false);
  exception when others then
    perform test.check('superuser TRUNCATE ledger blocked', sqlerrm like 'append_only%' or sqlerrm like '%foreign key%', sqlerrm);
  end;
  begin
    update public.point_balances set balance = 1 where club_id = test.v('A_id')::uuid;
    perform test.check('superuser UPDATE balances blocked', false);
  exception when others then
    perform test.check('superuser UPDATE balances blocked', sqlerrm like 'ledger_direct_write_forbidden%', sqlerrm);
  end;
end $$;

-- 台帳の閲覧範囲
select test.eq('p1 sees only own ledger rows', 'p1',
  format('select count(*) filter (where account_id <> auth.uid()) || ''/'' || (count(*) > 0) from public.point_ledger where club_id = %L', test.v('A_id')), '0/true');
select test.eq('agent1 sees p1 rows', 'agent1',
  format('select count(*) > 0 from public.point_ledger where club_id = %L and account_id = %L', test.v('A_id'), test.uid('p1')), 'true');
select test.eq('agent1 does not see p3 rows', 'agent1',
  format('select count(*) from public.point_ledger where club_id = %L and account_id = %L', test.v('A_id'), test.uid('p3')), '0');
select test.eq('agent1 does not see treasury', 'agent1',
  format('select count(*) from public.point_balances where club_id = %L and account_kind = ''treasury''', test.v('A_id')), '0');
select test.eq('owner sees treasury', 'owner',
  format('select balance from public.point_balances where club_id = %L and account_kind = ''treasury''', test.v('A_id')), '40000');
select test.eq('outsider sees no ledger of A', 'outsider',
  format('select count(*) from public.point_ledger where club_id = %L', test.v('A_id')), '0');
select test.eq('my_balances p1', 'p1', 'select balance from public.my_balances()', '8000');

-- ---------- ダイヤ ----------
select test.err('owner cannot grant diamonds', 'owner', format('select public.grant_diamonds(%L, 10)', test.v('A_id')), 'forbidden');
select test.err('service cannot grant diamonds', 'service', format('select public.grant_diamonds(%L, 10)', test.v('A_id')), 'permission denied');
select test.eq('admin grants 4 diamonds', 'admin', format('select public.grant_diamonds(%L, 4, ''test'')', test.v('A_id')), '4');
do $$ begin
  begin
    delete from public.diamond_ledger where club_id = test.v('A_id')::uuid;
    perform test.check('superuser DELETE diamond_ledger blocked', false);
  exception when others then
    perform test.check('superuser DELETE diamond_ledger blocked', sqlerrm like 'append_only%', sqlerrm);
  end;
end $$;
select test.err('admin cannot make diamonds negative', 'admin', format('select public.grant_diamonds(%L, -5)', test.v('A_id')), 'insufficient_diamonds');
select test.eq('owner sees diamond balance', 'owner', format('select balance from public.diamond_balances where club_id = %L', test.v('A_id')), '4');
select test.eq('agent cannot see diamonds', 'agent1', format('select count(*) from public.diamond_balances where club_id = %L', test.v('A_id')), '0');
select test.eq('outsider cannot see A diamonds', 'outsider', format('select count(*) from public.diamond_ledger where club_id = %L', test.v('A_id')), '0');

-- ---------- 卓 ----------
select test.err('player cannot open table (setting off)', 'p1',
  format('select public.open_table(%L, ''t'', 4, ''south'', 100, 1000)', test.v('A_id')), 'forbidden');
select test.err('outsider cannot open table in A', 'outsider',
  format('select public.open_table(%L, ''t'', 4, ''south'', 100, 1000)', test.v('A_id')), 'forbidden');
select test.err('invalid uma rejected', 'agent1',
  format('select public.open_table(%L, ''t'', 4, ''south'', 100, 0, ''{"uma":[10,10,10,10]}'')', test.v('A_id')), 'invalid_rules');
select test.setv('T1', test.ok('agent1 opens 4p table', 'agent1',
  format('select public.open_table(%L, ''T1'', 4, ''south'', 100, 1000)', test.v('A_id'))));
select test.check('diamond consumed by table open',
  (select balance from public.diamond_balances where club_id = test.v('A_id')::uuid) = 3);
select test.err('pending p5 cannot see/join table', 'p5', format('select public.join_table(%L)', test.v('T1')), 'table_not_found');
select test.eq('pending p5 sees no tables', 'p5', 'select count(*) from public.tables', '0');
select test.err('outsider cannot join', 'outsider', format('select public.join_table(%L)', test.v('T1')), 'table_not_found');
select test.eq('p1 joins seat 0', 'p1', format('select public.join_table(%L)', test.v('T1')), '0');
select test.err('p1 double join', 'p1', format('select public.join_table(%L)', test.v('T1')), 'already_seated');
select test.ok('p1 leaves before start', 'p1', format('select public.leave_table(%L)', test.v('T1')));
select test.eq('p1 rejoins seat 0', 'p1', format('select public.join_table(%L)', test.v('T1')), '0');
select test.eq('p2 joins seat 1', 'p2', format('select public.join_table(%L)', test.v('T1')), '1');
select test.err('p3 takes taken seat', 'p3', format('select public.join_table(%L, 1)', test.v('T1')), 'seat_taken');
select test.eq('p3 joins seat 2', 'p3', format('select public.join_table(%L)', test.v('T1')), '2');
select test.err('agent1 cannot collect from seated p1', 'agent1',
  format('select public.transfer_points(%L, %L, -100)', test.v('A_id'), test.uid('p1')), 'member_is_seated');
select test.err('service cannot start non-full table', 'service',
  format('select public.start_game(%L, gen_random_uuid())', test.v('T1')), 'table_not_full');
select test.eq('p4 joins seat 3', 'p4', format('select public.join_table(%L)', test.v('T1')), '3');
select test.err('agent1 cannot join full table', 'agent1', format('select public.join_table(%L)', test.v('T1')), 'table_full');

select test.setv('G1', gen_random_uuid()::text);
select test.err('owner cannot call start_game', 'owner', format('select public.start_game(%L, %L)', test.v('T1'), test.v('G1')), 'permission denied');
select test.err('owner cannot call settle_game', 'owner',
  format('select public.settle_game(%L, array[40000,30000,20000,10000])', test.v('G1')), 'permission denied');
select test.err('player cannot call settle_game', 'p1',
  format('select public.settle_game(%L, array[40000,30000,20000,10000])', test.v('G1')), 'permission denied');
select test.ok('service starts game', 'service', format('select public.start_game(%L, %L)', test.v('T1'), test.v('G1')));
select test.eq('start_game is idempotent', 'service',
  format('select public.start_game(%L, %L) ->> ''already_started''', test.v('T1'), test.v('G1')), 'true');
select test.err('leave after start', 'p1', format('select public.leave_table(%L)', test.v('T1')), 'table_not_waiting');
select test.ok('service records round 0', 'service',
  format('select public.record_round(%L, 0, ''{"winner":0,"han":3}'')', test.v('G1')));
select test.eq('rounds hidden while playing', 'p1', format('select count(*) from public.game_rounds where game_id = %L', test.v('G1')), '0');
select test.err('settle with wrong sum', 'service',
  format('select public.settle_game(%L, array[40000,30000,20000,10100])', test.v('G1')), 'final_points_sum_mismatch');
select test.err('settle with wrong length', 'service',
  format('select public.settle_game(%L, array[50000,30000,20000])', test.v('G1')), 'invalid_final_points_length');

select test.setv('ledger_rows_before', (select count(*)::text from public.point_ledger where club_id = test.v('A_id')::uuid));
select test.ok('service settles game 1', 'service',
  format($q$select public.settle_game(%L, array[40000,30000,20000,10000],
           '[{"winner":0,"han":3},{"winner":1,"han":1}]', 'kifu/g1.json')::text$q$, test.v('G1')));
-- 期待値: スコア +45.0 / +5.0 / -15.0 / -35.0、rate 100 → +4500 / +500 / -1500 / -3500、Fee 5%(勝者) → 225 / 25
select test.check('game1 deltas', (select string_agg(point_delta::text, ',' order by seat) from public.game_players where game_id = test.v('G1')::uuid) = '4500,500,-1500,-3500',
  (select string_agg(point_delta::text, ',' order by seat) from public.game_players where game_id = test.v('G1')::uuid));
select test.check('game1 scores', (select string_agg(score_x10::text, ',' order by seat) from public.game_players where game_id = test.v('G1')::uuid) = '450,50,-150,-350');
select test.check('game1 fees', (select string_agg(fee::text, ',' order by seat) from public.game_players where game_id = test.v('G1')::uuid) = '225,25,0,0');
select test.check('game1 p1 balance', test.bal(test.v('A_id')::uuid, test.uid('p1')) = 8000 + 4500 - 225);
select test.check('game1 zero-sum result', (select sum(amount) from public.point_ledger where game_id = test.v('G1')::uuid and kind = 'game_result') = 0);
select test.check('game1 fee member == treasury',
  (select sum(amount) from public.point_ledger where game_id = test.v('G1')::uuid and kind = 'fee') = 0
  and (select amount from public.point_ledger where game_id = test.v('G1')::uuid and kind = 'fee' and account_kind = 'treasury') = 250);
select test.setv('ledger_rows_after1', (select count(*)::text from public.point_ledger where club_id = test.v('A_id')::uuid));
select test.eq('double settle returns already_settled', 'service',
  format('select public.settle_game(%L, array[10000,20000,30000,40000]) ->> ''already_settled''', test.v('G1')), 'true');
select test.check('double settle wrote nothing',
  (select count(*)::text from public.point_ledger where club_id = test.v('A_id')::uuid) = test.v('ledger_rows_after1'));
select test.check('double settle did not change result',
  (select string_agg(point_delta::text, ',' order by seat) from public.game_players where game_id = test.v('G1')::uuid) = '4500,500,-1500,-3500');
select test.check('invariant: total == issued (after game1)', test.club_total(test.v('A_id')::uuid) = 100000);
select test.err('record_round after settle', 'service', format('select public.record_round(%L, 5, ''{}'')', test.v('G1')), 'game_not_playing');
select test.err('game_players immutable after settle', 'service',
  format('update public.game_players set point_delta = 0 where game_id = %L returning 1', test.v('G1')), 'permission denied');

-- 戦績・集計
select test.eq('p1 history', 'p1', 'select point_delta || '':'' || rank from public.my_game_history()', '4500:1');
select test.eq('p1 sees rounds after settle', 'p1', format('select count(*) from public.game_rounds where game_id = %L', test.v('G1')), '2');
select test.eq('club ranking (member)', 'p2', format('select count(*) from public.club_ranking(%L)', test.v('A_id')), '4');
select test.err('club ranking (outsider)', 'outsider', format('select count(*) from public.club_ranking(%L)', test.v('A_id')), 'forbidden');
select test.eq('agent1 downline summary', 'agent1',
  format('select string_agg(game_result || ''/'' || fee_paid, '','' order by game_result desc) from public.agent_downline_summary(%L)', test.v('A_id')), '4500/225,500/25');
select test.err('agent1 cannot see agent2 downline', 'agent1',
  format('select count(*) from public.agent_downline_summary(%L, %L)', test.v('A_id'), test.uid('agent2')), 'forbidden');
select test.eq('owner sees agent2 downline', 'owner',
  format('select count(*) from public.agent_downline_summary(%L, %L)', test.v('A_id'), test.uid('agent2')), '1');
select test.eq('owner fee income', 'owner', format('select sum(fee_total) from public.club_fee_income(%L)', test.v('A_id')), '250');
select test.err('agent cannot see fee income', 'agent1', format('select count(*) from public.club_fee_income(%L)', test.v('A_id')), 'forbidden');
select test.eq('owner verify ledgers clean', 'owner', format('select count(*) from public.verify_ledgers(%L)', test.v('A_id')), '0');
select test.err('player cannot verify ledgers', 'p1', format('select count(*) from public.verify_ledgers(%L)', test.v('A_id')), 'forbidden');
select test.eq('audit visible to owner only', 'p1', 'select count(*) from public.audit_log', '0');

-- ---------- 貸し越し不可での上限処理（rate 1000 で大負け） ----------
select test.setv('T2', test.ok('agent1 opens table 2 (rate 1000, buyin 0)', 'agent1',
  format('select public.open_table(%L, ''T2'', 4, ''east'', 1000, 0)', test.v('A_id'))));
select test.ok('p1 joins T2', 'p1', format('select public.join_table(%L)', test.v('T2')));
select test.ok('p2 joins T2', 'p2', format('select public.join_table(%L)', test.v('T2')));
select test.ok('p3 joins T2', 'p3', format('select public.join_table(%L)', test.v('T2')));
select test.ok('p4 joins T2', 'p4', format('select public.join_table(%L)', test.v('T2')));
select test.setv('G2', gen_random_uuid()::text);
select test.ok('service starts game 2', 'service', format('select public.start_game(%L, %L)', test.v('T2'), test.v('G2')));
-- 生: +65000 / +5000 / -25000 / -45000。p3=8500, p4=6500 しかない → 負けは 8500/6500 で頭打ち、勝ちは比例縮小
select test.ok('service settles game 2', 'service',
  format('select public.settle_game(%L, array[60000,30000,10000,0])::text', test.v('G2')));
select test.check('game2 losers capped at balance',
  test.bal(test.v('A_id')::uuid, test.uid('p3')) = 0 and test.bal(test.v('A_id')::uuid, test.uid('p4')) = 0);
select test.check('game2 deltas scaled', (select string_agg(point_delta::text, ',' order by seat) from public.game_players where game_id = test.v('G2')::uuid) = '13929,1071,-8500,-6500',
  (select string_agg(point_delta::text, ',' order by seat) from public.game_players where game_id = test.v('G2')::uuid));
select test.check('game2 zero-sum', (select sum(point_delta) from public.game_players where game_id = test.v('G2')::uuid) = 0);
select test.check('no negative balances (allow_negative=false)',
  not exists (select 1 from public.point_balances where club_id = test.v('A_id')::uuid and balance < 0));
select test.check('invariant: total == issued (after game2)', test.club_total(test.v('A_id')::uuid) = 100000);

-- ---------- 設定・ロール・配下 ----------
select test.err('agent cannot update settings', 'agent1',
  format('select public.update_club_settings(%L, ''{"allow_negative":true}'')', test.v('A_id')), 'forbidden');
select test.err('unknown settings key rejected', 'owner',
  format('select public.update_club_settings(%L, ''{"owner_id":"x"}'')', test.v('A_id')), 'invalid_settings_key');
select test.err('invalid fee rate rejected', 'owner',
  format('select public.update_club_settings(%L, ''{"fee_rate_bp":99999}'')', test.v('A_id')), 'check');
select test.ok('owner enables allow_negative', 'owner',
  format('select public.update_club_settings(%L, ''{"allow_negative":true,"fee_rate_bp":1000}'')', test.v('A_id')));
select test.err('agent1 cannot remove agent2''s player', 'agent1',
  format('select public.remove_member(%L, %L)', test.v('A_id'), test.uid('p3')), 'forbidden');
select test.ok('owner removes p4 (balance 0)', 'owner', format('select public.remove_member(%L, %L)', test.v('A_id'), test.uid('p4')));
select test.err('cannot remove member with balance', 'agent1',
  format('select public.remove_member(%L, %L)', test.v('A_id'), test.uid('p2')), 'balance_not_zero');
select test.err('removed p4 sees no tables', 'p4', format('select public.join_table(%L)', test.v('T2')), 'table_not_found');
select test.err('cannot demote agent with downline', 'owner',
  format('select public.set_member_role(%L, %L, ''player'')', test.v('A_id'), test.uid('agent1')), 'agent_has_downline');
select test.ok('owner moves p2 under agent2', 'owner',
  format('select public.set_member_agent(%L, %L, %L)', test.v('A_id'), test.uid('p2'), test.uid('agent2')));
select test.err('agent1 can no longer pay p2', 'agent1',
  format('select public.transfer_points(%L, %L, 1)', test.v('A_id'), test.uid('p2')), 'forbidden');
select test.ok('p1 sets own alias', 'p1', format('select public.set_alias(%L, %L, ''ぴー1'')', test.v('A_id'), test.uid('p1')));
select test.err('p1 cannot set p2 alias', 'p1', format('select public.set_alias(%L, %L, ''x'')', test.v('A_id'), test.uid('p2')), 'forbidden');
select test.ok('agent2 sets downline alias', 'agent2', format('select public.set_alias(%L, %L, ''ぴー2'')', test.v('A_id'), test.uid('p2')));
select test.err('agent1 cannot remove owner-direct pending p5', 'agent1',
  format('select public.remove_member(%L, %L)', test.v('A_id'), test.uid('p5')), 'forbidden');
select test.err('agent1 cannot remove owner', 'agent1',
  format('select public.remove_member(%L, %L)', test.v('A_id'), test.uid('owner')), 'cannot_remove_owner');
select test.err('pending p5 cannot open table', 'p5',
  format('select public.open_table(%L, ''x'', 4, ''east'', 100, 0)', test.v('A_id')), 'forbidden');
select test.err('player cannot read agent summary', 'p1',
  format('select count(*) from public.agent_downline_summary(%L)', test.v('A_id')), 'forbidden');
select test.err('player cannot rotate invite code', 'p1', format('select public.rotate_invite_code(%L)', test.v('A_id')), 'forbidden');
select test.err('owner cannot set club status (platform only)', 'owner',
  format('select public.set_club_status(%L, ''closed'')', test.v('A_id')), 'forbidden');
select test.ok('owner rotates club invite code', 'owner', format('select public.rotate_invite_code(%L)', test.v('A_id')));
select test.err('old club invite code no longer works', 'p5',
  format('select public.request_join_club(%L, %L)', test.v('A_code'), test.v('A_inv')), 'invalid_club_or_code');

-- ---------- 3人卓・貸し越し可・中止 ----------
select test.setv('T3', test.ok('owner opens 3p table', 'owner',
  format('select public.open_table(%L, ''T3'', 3, ''south'', 100, 0)', test.v('A_id'))));
select test.err('3p rejects seat 3', 'p1', format('select public.join_table(%L, 3)', test.v('T3')), 'invalid_seat');
select test.ok('p1 joins T3', 'p1', format('select public.join_table(%L)', test.v('T3')));
select test.ok('p2 joins T3', 'p2', format('select public.join_table(%L)', test.v('T3')));
select test.ok('p3 joins T3', 'p3', format('select public.join_table(%L)', test.v('T3')));
select test.setv('G3', gen_random_uuid()::text);
select test.ok('service starts 3p game', 'service', format('select public.start_game(%L, %L)', test.v('T3'), test.v('G3')));
-- 35000持ち40000返し・ウマ15/0/-15・オカ15.0: スコア +40.0 / -5.0 / -35.0 → +4000 / -500 / -3500。Fee 10%(勝者)
select test.ok('service settles 3p game', 'service',
  format('select public.settle_game(%L, array[50000,35000,20000])::text', test.v('G3')));
select test.check('3p scores', (select string_agg(score_x10::text, ',' order by seat) from public.game_players where game_id = test.v('G3')::uuid) = '400,-50,-350');
select test.check('3p negative balance allowed when enabled', test.bal(test.v('A_id')::uuid, test.uid('p3')) = -3500,
  test.bal(test.v('A_id')::uuid, test.uid('p3'))::text);
select test.check('3p fee 10%', (select fee_total from public.games where id = test.v('G3')::uuid) = 400);
select test.check('invariant: total == issued (after 3p)', test.club_total(test.v('A_id')::uuid) = 100000);

select test.setv('T4', test.ok('owner opens table 4', 'owner', format('select public.open_table(%L, ''T4'', 3, ''east'', 100, 0)', test.v('A_id'))));
select test.err('no diamonds left', 'owner', format('select public.open_table(%L, ''T5'', 3, ''east'', 100, 0)', test.v('A_id')), 'insufficient_diamonds');
select test.ok('p1 joins T4', 'p1', format('select public.join_table(%L)', test.v('T4')));
select test.ok('p2 joins T4', 'p2', format('select public.join_table(%L)', test.v('T4')));
select test.ok('agent1 joins T4', 'agent1', format('select public.join_table(%L)', test.v('T4')));
select test.setv('G4', gen_random_uuid()::text);
select test.ok('service starts game 4', 'service', format('select public.start_game(%L, %L)', test.v('T4'), test.v('G4')));
select test.ok('service aborts game 4', 'service', format('select public.abort_game(%L, ''server crash'')', test.v('G4')));
select test.err('settle after abort', 'service', format('select public.settle_game(%L, array[35000,35000,35000])', test.v('G4')), 'game_not_playing');
select test.check('abort moved no points', not exists (select 1 from public.point_ledger where game_id = test.v('G4')::uuid));
select test.ok('seat released after abort (agent1 can collect from p1 again)', 'agent1',
  format('select public.transfer_points(%L, %L, -1)', test.v('A_id'), test.uid('p1')));

-- ---------- 最終の不変条件と改ざん検知 ----------
select test.check('final invariant: sum(all accounts) == issued - burned',
  test.club_total(test.v('A_id')::uuid) = test.club_issued(test.v('A_id')::uuid));
select test.check('final invariant: member total + treasury fees == distributed (fee only moves into treasury)',
  (select sum(balance) from public.point_balances where club_id = test.v('A_id')::uuid and account_kind = 'member')
  = 100000 - (select balance from public.point_balances where club_id = test.v('A_id')::uuid and account_kind = 'treasury'));
select test.check('final: chains verify clean', (select count(*) from private.verify_point_chain_impl(test.v('A_id')::uuid)) = 0
  and (select count(*) from private.verify_diamond_chain_impl(test.v('A_id')::uuid)) = 0);
select test.check('final: club B untouched', test.club_total(test.v('B_id')::uuid) = 0);

do $$
declare n int;
begin
  begin
    alter table public.point_ledger disable trigger user;
    update public.point_ledger set amount = amount + 1, balance_after = balance_after + 1
     where club_id = test.v('A_id')::uuid and seq = 3;
    select count(*) into n from private.verify_point_chain_impl(test.v('A_id')::uuid);
    raise exception 'rollback:%', n;
  exception when others then
    perform test.check('tamper (bypassing triggers) is detected by hash chain', sqlerrm ~ '^rollback:[1-9]', sqlerrm);
  end;
end $$;
select test.check('tamper test rolled back', (select count(*) from private.verify_point_chain_impl(test.v('A_id')::uuid)) = 0);

\o

-- U1 DB 테스트: 접근 차단 (NFR-U1-13, BR-U1-18)
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- ---------- anon ----------
set local role anon;

select throws_ok('select * from public.districts', '42501', null, 'anon: districts 조회 불가');
select throws_ok('select * from public.supply_type_standards', '42501', null, 'anon: supply_type_standards 조회 불가');
select throws_ok('select * from public.income_asset_thresholds', '42501', null, 'anon: income_asset_thresholds 조회 불가');
select throws_ok('select * from public.notices', '42501', null, 'anon: notices 조회 불가');
select throws_ok('select * from public.source_notices', '42501', null, 'anon: source_notices 조회 불가');
select throws_ok('select * from public.notice_districts', '42501', null, 'anon: notice_districts 조회 불가');
select throws_ok('select * from public.housing_units', '42501', null, 'anon: housing_units 조회 불가');
select throws_ok('select * from public.devices', '42501', null, 'anon: devices 조회 불가');
select throws_ok('select * from public.device_profiles', '42501', null, 'anon: device_profiles 조회 불가');
select throws_ok('select * from public.push_subscriptions', '42501', null, 'anon: push_subscriptions 조회 불가');
select throws_ok('select * from public.judgements', '42501', null, 'anon: judgements 조회 불가');
select throws_ok('select * from public.notification_log', '42501', null, 'anon: notification_log 조회 불가');
select throws_ok('select * from public.collect_runs', '42501', null, 'anon: collect_runs 조회 불가');
select throws_ok(
  $$insert into public.devices (id, token_hash) values (gen_random_uuid(), repeat('a', 64))$$,
  '42501', null, 'anon: devices 쓰기 불가');
select throws_ok(
  $$select public.register_device(gen_random_uuid(), repeat('a', 64))$$,
  '42501', null, 'anon: register_device 실행 불가');
select throws_ok(
  $$select public.delete_device(gen_random_uuid())$$,
  '42501', null, 'anon: delete_device 실행 불가');

reset role;

-- ---------- authenticated ----------
set local role authenticated;

select throws_ok('select * from public.districts', '42501', null, 'authenticated: districts 조회 불가');
select throws_ok('select * from public.supply_type_standards', '42501', null, 'authenticated: supply_type_standards 조회 불가');
select throws_ok('select * from public.income_asset_thresholds', '42501', null, 'authenticated: income_asset_thresholds 조회 불가');
select throws_ok('select * from public.notices', '42501', null, 'authenticated: notices 조회 불가');
select throws_ok('select * from public.source_notices', '42501', null, 'authenticated: source_notices 조회 불가');
select throws_ok('select * from public.notice_districts', '42501', null, 'authenticated: notice_districts 조회 불가');
select throws_ok('select * from public.housing_units', '42501', null, 'authenticated: housing_units 조회 불가');
select throws_ok('select * from public.devices', '42501', null, 'authenticated: devices 조회 불가');
select throws_ok('select * from public.device_profiles', '42501', null, 'authenticated: device_profiles 조회 불가');
select throws_ok('select * from public.push_subscriptions', '42501', null, 'authenticated: push_subscriptions 조회 불가');
select throws_ok('select * from public.judgements', '42501', null, 'authenticated: judgements 조회 불가');
select throws_ok('select * from public.notification_log', '42501', null, 'authenticated: notification_log 조회 불가');
select throws_ok('select * from public.collect_runs', '42501', null, 'authenticated: collect_runs 조회 불가');
select throws_ok(
  $$select public.save_device_profile(gen_random_uuid(), '{}'::jsonb)$$,
  '42501', null, 'authenticated: save_device_profile 실행 불가');

reset role;

-- ---------- 모든 테이블 RLS 켜짐 ----------
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'public의 모든 테이블에 RLS가 켜져 있다');

-- ---------- service_role은 접근 가능 ----------
set local role service_role;
select lives_ok('select count(*) from public.devices', 'service_role: devices 조회 가능');
reset role;

select * from finish();
rollback;

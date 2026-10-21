-- 변경 3 U6 DB 테스트: 관심 공고 바꾸기·마감 임박·마감 기록·스위치·권한·cascade (0014)
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

create temp table t as select (now() at time zone 'Asia/Seoul')::date as today;

insert into public.devices (id, token_hash, notify_hour) values
  ('cccccccc-0000-4000-8000-000000000001', repeat('c', 64), 9),
  ('cccccccc-0000-4000-8000-000000000002', repeat('d', 64), 9);
insert into public.notices (id, dedup_key, title, complex_name, provider, primary_source, tenure, apply_start, apply_end) values
  ('dddddddd-0000-4000-8000-000000000001', 'bd-1', '내일 마감 공고', '교산 A2', 'LH', 'lh_rental', 'rent', (select today from t) - 5, (select today from t) + 1),
  ('dddddddd-0000-4000-8000-000000000002', 'bd-2', '모레 마감 공고', null, 'LH', 'lh_rental', 'rent', (select today from t) - 5, (select today from t) + 2),
  ('dddddddd-0000-4000-8000-000000000003', 'bd-3', '내일 마감 둘째', null, 'LH', 'lh_rental', 'rent', (select today from t) - 5, (select today from t) + 1),
  ('dddddddd-0000-4000-8000-000000000004', 'bd-4', '마감일 없음', null, 'LH', 'lh_rental', 'rent', null, null);

-- ---------- 바꾸기 (BR-U6-D1·D5) ----------
select is(public.replace_device_bookmarks('cccccccc-0000-4000-8000-000000000001', array[
  'dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000004',
  'dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000009']::uuid[]), 3, '중복·없는 공고는 빼고 저장');
select is(public.replace_device_bookmarks('cccccccc-0000-4000-8000-000000000001', array[
  'dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000004']::uuid[]), 3, '통째로 바꾼다');
select is((select count(*)::int from public.device_bookmarks where device_id = 'cccccccc-0000-4000-8000-000000000001' and notice_id = 'dddddddd-0000-4000-8000-000000000002'), 0, '목록에서 빠진 공고는 지운다');
select is(public.replace_device_bookmarks('cccccccc-0000-4000-8000-000000000002', '{}'), 0, '빈 목록');
select is(public.replace_device_bookmarks('ffffffff-0000-4000-8000-000000000000', array['dddddddd-0000-4000-8000-000000000001']::uuid[]), 0, '없는 기기는 0');
select is((select count(*)::int from public.device_bookmarks where device_id = 'ffffffff-0000-4000-8000-000000000000'), 0, '없는 기기 행 없음');

-- ---------- 마감 임박 (BR-U6-D10~D12) ----------
select is(
  (select jsonb_agg(e ->> 'id') from jsonb_array_elements(public.dispatch_deadlines(array['cccccccc-0000-4000-8000-000000000001']::uuid[], (select today from t)) -> 'cccccccc-0000-4000-8000-000000000001') e),
  '["dddddddd-0000-4000-8000-000000000001", "dddddddd-0000-4000-8000-000000000003"]'::jsonb,
  '관심 공고 중 마감 내일만, 이름 순 (마감일 없음 빠짐)');
select is(public.dispatch_deadlines(array['cccccccc-0000-4000-8000-000000000002']::uuid[], (select today from t)), '{}'::jsonb, '관심 공고 없는 기기는 빈 값');

-- 마감 기록 → 다시 대상 아님 (BR-U6-D22)
select public.record_deadline_push('cccccccc-0000-4000-8000-000000000001', array['dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000009']::uuid[]);
select is((select count(*)::int from public.deadline_notification_log where device_id = 'cccccccc-0000-4000-8000-000000000001'), 1, '있는 공고만 기록');
select public.record_deadline_push('cccccccc-0000-4000-8000-000000000001', array['dddddddd-0000-4000-8000-000000000001']::uuid[]);
select is((select count(*)::int from public.deadline_notification_log where device_id = 'cccccccc-0000-4000-8000-000000000001'), 1, '두 번 기록해도 한 행');
select is(
  (select jsonb_agg(e ->> 'id') from jsonb_array_elements(public.dispatch_deadlines(array['cccccccc-0000-4000-8000-000000000001']::uuid[], (select today from t)) -> 'cccccccc-0000-4000-8000-000000000001') e),
  '["dddddddd-0000-4000-8000-000000000003"]'::jsonb, '기록한 공고는 빠짐');
select is((select count(*)::int from public.notification_log where device_id = 'cccccccc-0000-4000-8000-000000000001'), 0, '새 공고 알림 기록과 따로');

-- 스위치 끄면 빈 값 (BR-U6-D11)
update public.devices set deadline_enabled = false where id = 'cccccccc-0000-4000-8000-000000000001';
select is(public.dispatch_deadlines(array['cccccccc-0000-4000-8000-000000000001']::uuid[], (select today from t)), '{}'::jsonb, '마감 알림 끔 → 대상 없음');
select is((select deadline_enabled from public.devices where id = 'cccccccc-0000-4000-8000-000000000002'), true, '기본 켜짐');

-- ---------- 권한·cascade ----------
select ok(not has_function_privilege('anon', 'public.replace_device_bookmarks(uuid, uuid[])', 'execute'), 'anon은 바꾸기 함수 실행 불가');
select ok(not has_table_privilege('anon', 'public.device_bookmarks', 'select'), 'anon은 관심 공고 표 읽기 불가');
delete from public.devices where id = 'cccccccc-0000-4000-8000-000000000001';
select is((select count(*)::int from public.device_bookmarks where device_id = 'cccccccc-0000-4000-8000-000000000001')
  + (select count(*)::int from public.deadline_notification_log where device_id = 'cccccccc-0000-4000-8000-000000000001'), 0, '기기를 지우면 관심 공고·마감 기록도 지워짐');

select * from finish();
rollback;

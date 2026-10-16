-- U6 DB 테스트: 발송 대상·몫 잡기·기록·구독 저장·기준선·시험 한도·정리·권한 (logical-components §3)
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

create temp table t as select (now() at time zone 'Asia/Seoul')::date as today;

-- 기기 2대 (9시 알림), 공고 3건
insert into public.devices (id, token_hash, notify_hour) values
  ('aaaaaaaa-0000-4000-8000-000000000001', repeat('a', 64), 9),
  ('aaaaaaaa-0000-4000-8000-000000000002', repeat('b', 64), 9);
insert into public.notices (id, dedup_key, title, provider, primary_source, tenure, apply_start, apply_end) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'p-1', '열린 공고', 'LH', 'lh_rental', 'rent', (select today from t) - 1, (select today from t) + 3),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'p-2', '마감 공고', 'LH', 'lh_rental', 'rent', (select today from t) - 9, (select today from t) - 2),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'p-3', '미충족 공고', 'LH', 'lh_rental', 'rent', null, null);
insert into public.judgements (device_id, notice_id, verdict, in_district, score, detail, profile_version) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'eligible', true, 1, '{}', 1),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'eligible', true, 1, '{}', 1),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000003', 'ineligible', true, 0, '{}', 1);

-- ---------- 구독 저장 + 기준선 (BR-U6-10~13·53·54) ----------
select is(public.save_push_subscription('aaaaaaaa-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/e1', 'k', 'a',
  array['bbbbbbbb-0000-4000-8000-000000000001']::uuid[]) ->> 'baselined', 'true', '첫 구독: 기준선');
select is((select kind from public.notification_log where device_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'baseline', '기준선 기록 kind=baseline');
select isnt((select push_baseline_at from public.devices where id = 'aaaaaaaa-0000-4000-8000-000000000001'), null, '기준선 시각 기록');
select is(public.save_push_subscription('aaaaaaaa-0000-4000-8000-000000000001', 'https://fcm.googleapis.com/fcm/send/e2', 'k', 'a',
  array['bbbbbbbb-0000-4000-8000-000000000002']::uuid[]) ->> 'baselined', 'false', '두 번째 구독: 기준선 다시 안 넣음');
select is((select count(*)::int from public.notification_log where device_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 1, '기준선이 늘지 않음');

-- 같은 주소를 다른 기기가 저장하면 옮긴다
select public.save_push_subscription('aaaaaaaa-0000-4000-8000-000000000002', 'https://fcm.googleapis.com/fcm/send/e2', 'k2', 'a2', '{}');
select is((select device_id::text from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/e2'),
  'aaaaaaaa-0000-4000-8000-000000000002', '같은 주소는 새 기기로 옮김');

-- 기기당 5개
select public.save_push_subscription('aaaaaaaa-0000-4000-8000-000000000002', 'https://fcm.googleapis.com/fcm/send/m' || i, 'k', 'a', '{}')
from generate_series(1, 6) i;
select is((select count(*)::int from public.push_subscriptions where device_id = 'aaaaaaaa-0000-4000-8000-000000000002'), 5, '기기당 구독 5개');
select is(public.save_push_subscription(gen_random_uuid(), 'https://fcm.googleapis.com/fcm/send/x', 'k', 'a', '{}') ->> 'saved', 'false', '없는 기기는 저장 안 함');

-- ---------- 발송 대상 (BR-U6-02) ----------
select is(jsonb_array_length(public.dispatch_candidates(9, (select today from t))), 2, '9시 + 구독 있음 → 2대');
select is(jsonb_array_length(public.dispatch_candidates(10, (select today from t))), 0, '10시 → 0대');
update public.devices set notify_enabled = false where id = 'aaaaaaaa-0000-4000-8000-000000000002';
select is(jsonb_array_length(public.dispatch_candidates(9, (select today from t))), 1, '알림 끈 기기 제외');
select is(public.dispatch_candidates(9, (select today from t)) -> 0 -> 'subscriptions' -> 0 ->> 'endpoint',
  'https://fcm.googleapis.com/fcm/send/e1', '구독 목록 포함');

-- ---------- 판정 묶음 (1차 거름) ----------
select is(jsonb_array_length(public.dispatch_device_rows(array['aaaaaaaa-0000-4000-8000-000000000001']::uuid[], (select today from t))
  -> 'aaaaaaaa-0000-4000-8000-000000000001' -> 'rows'), 1, '미충족·마감은 거르고 1건');
select is(public.dispatch_device_rows(array['aaaaaaaa-0000-4000-8000-000000000001']::uuid[], (select today from t))
  -> 'aaaaaaaa-0000-4000-8000-000000000001' ->> 'count', '3', '통계: 판정 3건');
select is(public.dispatch_device_rows(array['aaaaaaaa-0000-4000-8000-000000000001']::uuid[], (select today from t))
  -> 'aaaaaaaa-0000-4000-8000-000000000001' -> 'notified' ->> 0, 'bbbbbbbb-0000-4000-8000-000000000001', '알림 기록(기준선 포함)');

-- ---------- 몫 잡기·되돌리기 (P-1) ----------
select is(public.claim_daily_push('aaaaaaaa-0000-4000-8000-000000000001', (select today from t)) ->> 'claimed', 'true', '첫 몫 잡기 성공');
select is(public.claim_daily_push('aaaaaaaa-0000-4000-8000-000000000001', (select today from t)) ->> 'claimed', 'false', '같은 날 두 번째는 실패');
select is(jsonb_array_length(public.dispatch_candidates(9, (select today from t))), 0, '오늘 보낸 기기는 대상 아님');
select public.release_daily_push('aaaaaaaa-0000-4000-8000-000000000001', (select today from t), null);
select is((select last_push_on from public.devices where id = 'aaaaaaaa-0000-4000-8000-000000000001'), null, '되돌리기');
update public.devices set last_push_on = (select today from t) where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select public.release_daily_push('aaaaaaaa-0000-4000-8000-000000000001', (select today from t) - 1, null);
select is((select last_push_on from public.devices where id = 'aaaaaaaa-0000-4000-8000-000000000001'), (select today from t),
  '다른 날 값이면 되돌리지 않음');

-- ---------- 보낸 직후 기록 (P-6·7) ----------
select public.record_push_result('aaaaaaaa-0000-4000-8000-000000000001',
  array['bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000ff']::uuid[],
  array['https://fcm.googleapis.com/fcm/send/e1'], '{}', '{}');
select is((select count(*)::int from public.notification_log where device_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 2, '없는 공고는 빼고 기록');
select is((select kind from public.notification_log where notice_id = 'bbbbbbbb-0000-4000-8000-000000000001'
  and device_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'baseline', '기준선은 그대로');
select isnt((select last_success_at from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/e1'), null, '성공 시각');

select public.record_push_result('aaaaaaaa-0000-4000-8000-000000000002', '{}', '{}',
  array['https://fcm.googleapis.com/fcm/send/m2'], array['https://fcm.googleapis.com/fcm/send/m3']);
select isnt((select failing_since from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/m2'), null, '실패 시작 시각');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/m3'), 0, '만료 구독 삭제');

-- ---------- 시험 한도 (BR-U6-66) ----------
select is(array(select public.try_test_push('aaaaaaaa-0000-4000-8000-000000000001') from generate_series(1, 4)),
  array[true, true, true, false], '1시간 3번까지');

-- ---------- 정리 (P-6 조정) ----------
update public.push_subscriptions set failing_since = now() - interval '8 days' where endpoint = 'https://fcm.googleapis.com/fcm/send/m2';
update public.push_subscriptions set failing_since = null, last_success_at = null, created_at = now() - interval '30 days'
  where endpoint = 'https://fcm.googleapis.com/fcm/send/m4';
update public.push_test_log set sent_at = now() - interval '2 days';
select public.run_cleanup_push();
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/m2'), 0, '7일 넘게 실패한 구독 삭제');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/m4'), 1,
  '보낼 일이 없던 오래된 구독은 남김');
select is((select count(*)::int from public.push_test_log), 0, '시험 기록 1일 정리');

-- ---------- cron·권한 ----------
select is((select schedule from cron.job where jobname = 'dispatch-hourly'), '0 * * * *', 'dispatch-hourly: 매시 정각');
set local role anon;
select throws_ok($$select public.claim_daily_push('aaaaaaaa-0000-4000-8000-000000000001', current_date)$$, '42501', null, 'anon: 몫 잡기 불가');

select * from finish();
rollback;

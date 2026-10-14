-- U1 DB 테스트: DB 함수 동작 (BR-U1-03·13·14·16, P-S4, 멱등성)
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- ---------- register_device ----------
select is(public.register_device('11111111-1111-4111-8111-111111111111', repeat('a', 64)), 'created', '새 기기 → created');
select is(public.register_device('11111111-1111-4111-8111-111111111111', repeat('a', 64)), 'existing', '같은 ID·같은 해시 → existing');
select is(public.register_device('11111111-1111-4111-8111-111111111111', repeat('b', 64)), 'conflict', '같은 ID·다른 해시 → conflict');
select is(
  (select token_hash from public.devices where id = '11111111-1111-4111-8111-111111111111'),
  repeat('a', 64),
  'conflict여도 기존 해시를 덮어쓰지 않는다');

-- 최근 1시간 신규 등록 20대 이상이면 rate_limited (위 1대 + 19대 = 20대)
insert into public.devices (id, token_hash)
select gen_random_uuid(), repeat('c', 64) from generate_series(1, 19);
select is(public.register_device(gen_random_uuid(), repeat('d', 64)), 'rate_limited', '1시간 내 20대 이상 → rate_limited');
select is(public.register_device('11111111-1111-4111-8111-111111111111', repeat('a', 64)), 'existing', '한도와 상관없이 재전송은 existing');
-- 1시간이 지난 등록은 세지 않는다
update public.devices set created_at = now() - interval '2 hours';
select is(public.register_device(gen_random_uuid(), repeat('e', 64)), 'created', '1시간이 지나면 다시 등록 가능');

-- ---------- delete_device + 연쇄 삭제 ----------
insert into public.notices (id, dedup_key, title, provider, primary_source, tenure)
values ('22222222-2222-4222-8222-222222222222', 'test-key-1', '테스트 공고', 'LH', 'applyhome', 'rent');
select is(public.save_device_profile('11111111-1111-4111-8111-111111111111',
  '{"schema_version":1,"data":{"a":1},"enc_monthly_income":"v1.x.y"}'::jsonb), 1, '프로필 첫 저장 → 버전 1');
select is(public.save_device_profile('11111111-1111-4111-8111-111111111111',
  '{"schema_version":1,"data":{"a":2}}'::jsonb), 2, '프로필 다시 저장 → 버전 2');
insert into public.push_subscriptions (endpoint, device_id, p256dh, auth)
values ('https://push.example/1', '11111111-1111-4111-8111-111111111111', 'k', 'a');
-- U2: 판정 저장은 프로필 버전을 함께 받는다 (P-U2-R3). 현재 프로필 버전 = 2
select is(public.replace_judgements_for_device('11111111-1111-4111-8111-111111111111', 2,
  '[{"notice_id":"22222222-2222-4222-8222-222222222222","verdict":"eligible","in_district":true,"detail":{}}]'::jsonb),
  1, '판정 1건 저장');
select is(public.replace_judgements_for_device('11111111-1111-4111-8111-111111111111', 2,
  '[{"notice_id":"33333333-3333-4333-8333-333333333333","verdict":"eligible","in_district":true,"detail":{}}]'::jsonb),
  0, '없는 공고의 판정은 넣지 않고, 기존 판정은 교체(삭제)된다');
select is(public.replace_judgements_for_device('11111111-1111-4111-8111-111111111111', 2,
  '[{"notice_id":"22222222-2222-4222-8222-222222222222","verdict":"unknown","in_district":true,"detail":{}}]'::jsonb),
  1, '같은 버전으로 다시 저장 가능');
select is(public.replace_judgements_for_device('11111111-1111-4111-8111-111111111111', 1, '[]'::jsonb),
  -1, '낮은 프로필 버전으로 계산한 저장은 건너뛴다 (-1)');
select is((select count(*)::int from public.judgements where device_id = '11111111-1111-4111-8111-111111111111'),
  1, '오래된 계산이 최신 판정을 지우지 않는다');
select is(public.replace_judgements_for_device('99999999-9999-4999-8999-999999999999', 1, '[]'::jsonb),
  -1, '프로필이 없는 기기는 저장하지 않는다 (-1)');
insert into public.notification_log (device_id, notice_id)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

select is(public.delete_device('11111111-1111-4111-8111-111111111111'), true, '기기 삭제 → true');
select is(
  (select count(*)::int from public.device_profiles where device_id = '11111111-1111-4111-8111-111111111111')
  + (select count(*)::int from public.push_subscriptions where device_id = '11111111-1111-4111-8111-111111111111')
  + (select count(*)::int from public.judgements where device_id = '11111111-1111-4111-8111-111111111111')
  + (select count(*)::int from public.notification_log where device_id = '11111111-1111-4111-8111-111111111111'),
  0, '연결된 프로필·구독·판정·알림 이력이 모두 삭제된다');
select is(public.delete_device('11111111-1111-4111-8111-111111111111'), false, '이미 없는 기기 → false');

-- ---------- cleanup_expired_devices (180일 경계) ----------
delete from public.devices;
insert into public.devices (id, token_hash, last_seen_at) values
  ('44444444-4444-4444-8444-444444444444', repeat('a', 64), '2026-04-17 00:00:00+00'),  -- 기준과 같음 → 보관
  ('55555555-5555-4555-8555-555555555555', repeat('a', 64), '2026-04-16 23:59:59+00');  -- 기준보다 이전 → 삭제
select is(public.cleanup_expired_devices('2026-04-17 00:00:00+00'), 1, '기준보다 오래된 기기만 삭제');
select is(public.cleanup_expired_devices('2026-04-17 00:00:00+00'), 0, '다시 실행해도 결과가 같다 (멱등)');

-- ---------- cleanup_expired_notices (365일 경계, 한국 날짜) ----------
delete from public.notices;
insert into public.notices (dedup_key, title, provider, primary_source, tenure, apply_end, announced_at, first_seen_at) values
  ('keep-365', '보관', 'LH', 'applyhome', 'rent', '2025-10-14', null, now()),
  ('drop-366', '삭제', 'LH', 'applyhome', 'rent', '2025-10-13', null, now()),
  ('fallback-announced', '모집공고일 기준 삭제', 'LH', 'applyhome', 'rent', null, '2025-01-01', now()),
  -- 2025-10-12T16:00Z = 한국 2025-10-13 → 삭제
  ('fallback-first-seen', '첫 수집일 기준 삭제', 'LH', 'applyhome', 'rent', null, null, '2025-10-12 16:00:00+00');
select is(public.cleanup_expired_notices('2026-10-14'::date - 365), 3, '기준일 < 오늘-365 인 공고만 삭제');
select is((select dedup_key from public.notices), 'keep-365', '정확히 365일째 공고는 보관');
select is(public.cleanup_expired_notices('2026-10-14'::date - 365), 0, '다시 실행해도 결과가 같다 (멱등)');

-- ---------- upsert_notice_bundle ----------
select is(
  public.upsert_notice_bundle('{"notice":{"dedup_key":"bundle-1","title":"A","provider":"LH","primary_source":"applyhome","tenure":"sale"},
    "sources":[{"source":"applyhome","source_notice_no":"N1","original_url":"https://a","content_hash":"h1"}],
    "units":[{"label":"59A","exclusive_area_m2":59.9,"supply_count":10}]}'::jsonb),
  public.upsert_notice_bundle('{"notice":{"dedup_key":"bundle-1","title":"A2","provider":"LH","primary_source":"applyhome","tenure":"sale"},
    "sources":[{"source":"lh_rental","source_notice_no":"L1","original_url":"https://b","content_hash":"h2"}],
    "units":[{"label":"59A","exclusive_area_m2":59.9,"supply_count":10}]}'::jsonb),
  '같은 dedup_key는 같은 대표 공고로 묶인다');
select is(
  (select count(*)::int from public.source_notices s join public.notices n on n.id = s.notice_id where n.dedup_key = 'bundle-1'),
  2, '두 소스의 원천 공고가 한 대표 공고에 연결된다');

select * from finish();
rollback;

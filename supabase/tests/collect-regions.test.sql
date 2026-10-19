-- 변경 요청 2 DB 테스트: 공고 지역 저장·AI 지역 유지, 관심 지역 판정(공유 표), 90일 관심 기기, 분석 대상, 권한, cron 두 묶음 (0010)
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
-- 아래 "관심 지역 공유 표"는 TS 테스트(collect/__tests__/interest-table.test.ts)가 이 파일을 읽어 U2 inInterestArea로도 확인한다
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

create temp table t_today as select (now() at time zone 'Asia/Seoul')::date as d;

create or replace function pg_temp.bundle(p_key text, p_no text, p_regions jsonb, p_districts jsonb default '[]'::jsonb, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'notice', jsonb_build_object('dedup_key', p_key, 'title', '지역 테스트 ' || p_key, 'provider', 'SH', 'primary_source', 'sh',
      'tenure', 'rent', 'apply_end', (select d from t_today) + 5, 'regions', p_regions),
    'sources', jsonb_build_array(jsonb_build_object('source', 'sh', 'source_notice_no', p_no, 'original_url', 'https://s/' || p_no,
      'content_hash', 'h-' || p_no, 'attachments', '[]'::jsonb)),
    'units', jsonb_build_array(jsonb_build_object('supply_type', 'happy_senior', 'requirements', '{}'::jsonb)),
    'district_ids', p_districts
  ) || p_extra;
$$;

-- ---------- 지역 저장·AI 지역 유지 (P-U3-C4) ----------
select public.upsert_notice_bundle(pg_temp.bundle('r-1', 'r1', '[{"sido":"서울","sigungu":null}]'));
select is((select regions from public.notices where dedup_key = 'r-1'), '[{"sido":"서울","sigungu":null}]'::jsonb, '수집 지역 저장');
select is((select regions_ai from public.notices where dedup_key = 'r-1'), null, '처음에는 AI 지역 없음');
select public.upsert_notice_bundle(pg_temp.bundle('r-1', 'r1', '[{"sido":"서울","sigungu":null}]', '[]',
  '{"regions_ai":[{"sido":"서울","sigungu":"강동구"}],"summary_status":"done"}'));
select is((select regions_ai from public.notices where dedup_key = 'r-1'), '[{"sido":"서울","sigungu":"강동구"}]'::jsonb, '분석 저장은 AI 지역을 쓴다');
select public.upsert_notice_bundle(pg_temp.bundle('r-1', 'r1', '[{"sido":"서울","sigungu":null}]'));
select is((select regions_ai from public.notices where dedup_key = 'r-1'), '[{"sido":"서울","sigungu":"강동구"}]'::jsonb, '다음 수집은 AI 지역을 덮지 않는다');
select public.upsert_notice_bundle(pg_temp.bundle('r-1', 'r1', '[{"sido":"서울","sigungu":null}]', '[]', '{"regions_ai":null}'));
select is((select regions_ai from public.notices where dedup_key = 'r-1'), null, '분석이 다시 돌아 고칠 것이 없으면 지운다');
select throws_ok($$update public.notices set regions_ai = '{"x":1}' where dedup_key = 'r-1'$$, '23514', null, 'AI 지역도 배열만');

-- ---------- 관심 지역 공유 표 (U2 BR-U2-C10~C12) ----------
-- [TABLE-START] (설명, 공고 지구, 공고 지역, 관심 prefs, 기대)
create temp table t_area (label text, districts text[], regions jsonb, prefs jsonb, expected boolean);
insert into t_area values
  ('지구 일치', array['gyosan'], '[]', '{"districtIds":["gyosan"],"regions":[]}', true),
  ('지구 불일치', array['gyosan'], '[]', '{"districtIds":["wangsuk"],"regions":[]}', false),
  ('시군구 일치', array[]::text[], '[{"sido":"서울","sigungu":"강서구"}]', '{"districtIds":[],"regions":[{"sido":"서울","sigungu":"강서구"}]}', true),
  ('시군구 불일치', array[]::text[], '[{"sido":"서울","sigungu":"강서구"}]', '{"districtIds":[],"regions":[{"sido":"서울","sigungu":"마포구"}]}', false),
  ('시도 전체 선택', array[]::text[], '[{"sido":"경기","sigungu":"수원시"}]', '{"districtIds":[],"regions":[{"sido":"경기","sigungu":null}]}', true),
  ('공고가 시도까지만', array[]::text[], '[{"sido":"경기","sigungu":null}]', '{"districtIds":[],"regions":[{"sido":"경기","sigungu":"성남시"}]}', true),
  ('시도 다름', array[]::text[], '[{"sido":"인천","sigungu":null}]', '{"districtIds":[],"regions":[{"sido":"서울","sigungu":null}]}', false),
  ('지구 공고 + 시군구 관심', array['gyosan'], '[{"sido":"경기","sigungu":"하남시"}]', '{"districtIds":[],"regions":[{"sido":"경기","sigungu":"하남시"}]}', true),
  ('강서구 관심 + 부천 대장', array['daejang'], '[{"sido":"경기","sigungu":"부천시"}]', '{"districtIds":[],"regions":[{"sido":"서울","sigungu":"강서구"}]}', false),
  ('버전 1 관심(regions 없음)', array[]::text[], '[{"sido":"서울","sigungu":"강서구"}]', '{"districtIds":["gyosan"]}', false),
  ('여러 지역 중 하나', array[]::text[], '[{"sido":"서울","sigungu":"강서구"},{"sido":"경기","sigungu":"고양시"}]', '{"districtIds":[],"regions":[{"sido":"경기","sigungu":"고양시"}]}', true),
  ('관심 없음', array[]::text[], '[{"sido":"서울","sigungu":null}]', '{"districtIds":[],"regions":[]}', false);
-- [TABLE-END]
select is(
  (select count(*)::int from t_area where public.interest_area_match(districts, regions, prefs) <> expected),
  0, '공유 표 12쌍이 모두 기대대로'
);
select is((select count(*)::int from t_area), 12, '공유 표는 12쌍');

-- ---------- 관심 기기 90일 · 분석 대상 (BR-U3-C17~C19) ----------
-- 이 테스트가 만든 공고만 본다 (로컬 DB에 다른 공고가 있을 수 있다)
create or replace function pg_temp.mine(p uuid) returns text language sql as $$
  select dedup_key from public.notices where id = p and dedup_key like 'r-%';
$$;
select public.upsert_notice_bundle(pg_temp.bundle('r-gangseo', 'g1', '[{"sido":"서울","sigungu":"강서구"}]'));
select public.upsert_notice_bundle(pg_temp.bundle('r-mapo', 'g2', '[{"sido":"서울","sigungu":"마포구"}]'));
select public.upsert_notice_bundle(pg_temp.bundle('r-ai', 'g3', '[{"sido":"서울","sigungu":null}]', '[]',
  '{"regions_ai":[{"sido":"서울","sigungu":"강서구"}],"summary_status":"pending"}'));

insert into public.devices (id, token_hash, last_seen_at) values
  ('eeeeeeee-0000-4000-8000-000000000001', repeat('e', 64), now() - interval '10 days'),
  ('eeeeeeee-0000-4000-8000-000000000002', repeat('f', 64), now() - interval '200 days');
insert into public.device_profiles (device_id, schema_version, data) values
  ('eeeeeeee-0000-4000-8000-000000000001', 2, '{"prefs":{"districtIds":[],"regions":[{"sido":"서울","sigungu":"강서구"}]}}'),
  ('eeeeeeee-0000-4000-8000-000000000002', 2, '{"prefs":{"districtIds":[],"regions":[{"sido":"서울","sigungu":"마포구"}]}}');

select ok(public.notice_in_any_interest((select id from public.notices where dedup_key = 'r-gangseo'), now() - interval '90 days'),
  '최근 기기의 관심 시군구 → 대상');
select ok(not public.notice_in_any_interest((select id from public.notices where dedup_key = 'r-mapo'), now() - interval '90 days'),
  '90일 넘게 안 연 기기의 관심만 있으면 → 대상 아님');
select ok(public.notice_in_any_interest((select id from public.notices where dedup_key = 'r-mapo'), now() - interval '365 days'),
  '기간을 넓히면 그 기기도 센다');
select ok(public.notice_in_any_interest((select id from public.notices where dedup_key = 'r-ai'), now() - interval '90 days'),
  'AI 지역이 있으면 그것으로 판정');

create temp table t_claim as select pg_temp.mine(id) as key from public.claim_notices_for_analysis(50, now()) as id;
select ok((select bool_or(key = 'r-gangseo') from t_claim), '관심 지역 공고는 분석 대상');
select ok((select bool_or(key = 'r-ai') from t_claim), 'AI 지역으로 관심 안인 공고도 대상');
select ok(not coalesce((select bool_or(key = 'r-mapo') from t_claim), false), '관심 밖 공고는 대상 아님 — pending 그대로');
select is((select summary_status from public.notices where dedup_key = 'r-mapo'), 'pending', '대상 아님은 실패로 세지 않는다');
select ok(public.analysis_backlog(now()) >= 0, '요약 대기 수 함수');

-- ---------- 권한 ----------
set local role anon;
select throws_ok($$select public.interest_area_match(array[]::text[], '[]', '{}')$$, '42501', null, 'anon: 관심 지역 판정 불가');
select throws_ok($$select public.notice_in_any_interest(gen_random_uuid(), now())$$, '42501', null, 'anon: 관심 기기 판정 불가');
select throws_ok($$select public.analysis_backlog(now())$$, '42501', null, 'anon: 대기 수 불가');
reset role;
set local role service_role;
select throws_ok($$select public.invoke_edge_function('collect', '{}'::jsonb)$$, '42501', null, 'service_role: 함수 호출(cron 전용) 불가');
reset role;

-- ---------- 두 묶음 cron (P-U3-C1) ----------
select is((select schedule from cron.job where jobname = 'collect-daily'), '0 20 * * *', 'api 묶음 KST 05:00');
select ok((select command from cron.job where jobname = 'collect-daily') like '%"group":"api"%', 'api 묶음 본문');
select ok((select command from cron.job where jobname = 'collect-crawl') like '%"group":"crawl"%', 'crawl 묶음 KST 05:10 본문');
select hasnt_function('public', 'invoke_edge_function', array['text'], '인수 하나짜리 호출 함수는 없다(기본값 있는 두 인수로)');

select * from finish();
rollback;

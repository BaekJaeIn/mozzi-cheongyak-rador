-- 변경 요청 3 DB 테스트 (0013): 신혼·생애최초 물량 시드, 분석 판 저장, 다시 분석 대상·하루 5건·실패 보존
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

select is((select count(*)::int from public.supply_type_standards where code in ('newlywed_special_supply', 'first_time_supply', 'rental_newlywed_supply')), 3, '신혼·생애최초 물량 공급유형 3개');

create temp table t_today as select (now() at time zone 'Asia/Seoul')::date as d;
create or replace function pg_temp.bundle(p_key text, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'notice', jsonb_build_object('dedup_key', p_key, 'title', '다시 분석 ' || p_key, 'provider', 'LH', 'primary_source', 'lh_rental',
      'tenure', 'rent', 'apply_end', (select d from t_today) + 5, 'regions', '[{"sido":"서울","sigungu":"강서구"}]'::jsonb),
    'sources', jsonb_build_array(jsonb_build_object('source', 'lh_rental', 'source_notice_no', p_key, 'original_url', 'https://x/' || p_key,
      'content_hash', 'h', 'attachments', '[]'::jsonb)),
    'units', jsonb_build_array(jsonb_build_object('supply_type', 'newlywed_special_supply', 'requirements', '{}'::jsonb))
  ) || p_extra;
$$;

-- 관심 기기 하나만 (다른 로컬 기기는 이 트랜잭션 안에서만 지움)
delete from public.device_profiles;
insert into public.devices (id, token_hash, last_seen_at) values ('eeeeeeee-0000-4000-8000-0000000000aa', repeat('a', 64), now());
insert into public.device_profiles (device_id, schema_version, data) values
  ('eeeeeeee-0000-4000-8000-0000000000aa', 3, '{"prefs":{"districtIds":[],"regions":[{"sido":"서울","sigungu":"강서구"}]}}');

-- 판 1 요약 완료 공고 7건 (변경 3 전 분석)
select public.upsert_notice_bundle(pg_temp.bundle('ra-' || i, '{"summary":{"eligibilityPlain":"a","forSeniorCouple":"b"},"summary_status":"done"}'))
from generate_series(1, 7) as i;
select is((select count(*)::int from public.notices where dedup_key like 'ra-%' and analysis_version = 1), 7, '기본 판 1');
select is((select supply_type from public.housing_units hu join public.notices n on n.id = hu.notice_id where n.dedup_key = 'ra-1'), 'newlywed_special_supply', '새 공급유형 주택형 저장 (외래 키)');

-- 분석 판 저장
select public.upsert_notice_bundle(pg_temp.bundle('ra-v2', '{"summary":{"eligibilityPlain":"a","forSeniorCouple":"b","forNewlywed":"c"},"summary_status":"done","analysis_version":2}'));
select is((select analysis_version from public.notices where dedup_key = 'ra-v2'), 2, '분석 저장은 판 2');
select is((select summary ->> 'forNewlywed' from public.notices where dedup_key = 'ra-v2'), 'c', '신혼부부가 볼 점 저장');
select public.upsert_notice_bundle(pg_temp.bundle('ra-v2'));
select is((select analysis_version from public.notices where dedup_key = 'ra-v2'), 2, '수집 저장은 판을 건드리지 않음');

-- 다시 분석: 하루 5건
create temp table t_claim1 as select id from public.claim_notices_for_reanalysis(10, now()) as id;
select is((select count(*)::int from t_claim1 c join public.notices n on n.id = c.id where n.dedup_key like 'ra-%'), 5, '하루 5건까지');
select ok(not exists (select 1 from t_claim1 c join public.notices n on n.id = c.id where n.dedup_key = 'ra-v2'), '판 2는 대상 아님');
update public.notices set ai_claimed_at = null where dedup_key like 'ra-%';
select is((select count(*)::int from public.claim_notices_for_reanalysis(10, now())), 0, '같은 날 더는 없음');

-- 실패: 요약·판 그대로, 시도 +1
select public.release_reanalysis((select id from t_claim1 limit 1));
select is((select summary ->> 'eligibilityPlain' from public.notices where id = (select id from t_claim1 limit 1)), 'a', '실패해도 요약 그대로');
select is((select reanalysis_attempts from public.notices where id = (select id from t_claim1 limit 1)), 1, '시도 +1');

set local role anon;
select throws_ok($$select public.claim_notices_for_reanalysis(1, now())$$, '42501', null, 'anon: 다시 분석 예약 불가');
reset role;

select * from finish();
rollback;

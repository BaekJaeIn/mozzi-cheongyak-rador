-- 변경 요청 4 U3 DB 테스트 (0016): 신청 대상 저장·보존, AI 대상, 실패 이유, skipped, 다시 분석 판 3
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

create or replace function pg_temp.bundle(p_key text, p_extra jsonb default '{}'::jsonb, p_notice jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'notice', jsonb_build_object('dedup_key', p_key, 'title', '대상 ' || p_key, 'provider', 'GH', 'primary_source', 'gh',
      'tenure', 'rent', 'regions', '[{"sido":"경기","sigungu":"연천군"}]'::jsonb) || p_notice,
    'sources', jsonb_build_array(jsonb_build_object('source', 'gh', 'source_notice_no', p_key, 'original_url', 'https://x/' || p_key,
      'content_hash', 'h', 'attachments', '[]'::jsonb)),
    'units', '[]'::jsonb
  ) || p_extra;
$$;

select public.upsert_notice_bundle(pg_temp.bundle('ca-1', '{"summary_status":"pending"}', '{"audiences":["dormitory"]}'));
select is((select audiences from public.notices where dedup_key = 'ca-1'), array['dormitory'], '수집 저장: 신청 대상 저장');

-- 분석 저장(notice에 audiences 키 없음)은 수집 값을 지우지 않는다
select public.upsert_notice_bundle(pg_temp.bundle('ca-1', '{"audiences_ai":["youth","senior"],"ai_last_error":null,"summary_status":"done"}'));
select is((select audiences from public.notices where dedup_key = 'ca-1'), array['dormitory'], '분석 저장: 수집 대상 그대로');
select is((select audiences_ai from public.notices where dedup_key = 'ca-1'), array['youth', 'senior'], 'AI 대상 저장');

select public.upsert_notice_bundle(pg_temp.bundle('ca-1', '{"audiences_ai":null}'));
select is((select audiences_ai from public.notices where dedup_key = 'ca-1'), null::text[], 'AI 대상 null(모름)');

select throws_ok($$ select public.upsert_notice_bundle(pg_temp.bundle('ca-2', '{}', '{"audiences":["모름"]}')) $$, '23514', null, '표에 없는 대상은 막는다');

-- 실패 이유
select public.release_notice_claim((select id from public.notices where dedup_key = 'ca-1'), true, 'gemini_error: HTTP 402 ' || repeat('가', 300));
select is((select char_length(ai_last_error) from public.notices where dedup_key = 'ca-1'), 200, '실패 이유는 200자로 자른다');
select is((select summary_status from public.notices where dedup_key = 'ca-1'), 'failed', '실패 상태');
select public.upsert_notice_bundle(pg_temp.bundle('ca-1', '{"ai_last_error":null,"summary_status":"done"}'));
select is((select ai_last_error from public.notices where dedup_key = 'ca-1'), null, '성공 저장은 실패 이유를 지운다');

-- 분석 대상 아님
select lives_ok($$ select public.upsert_notice_bundle(pg_temp.bundle('ca-3', '{"summary_status":"skipped"}')) $$, 'skipped 상태 저장');
select is(
  (select count(*)::int from public.claim_notices_for_analysis(10, now()) as c(id) where c.id = (select id from public.notices where dedup_key = 'ca-3')),
  0, 'skipped 공고는 분석 예약하지 않는다');

select * from finish();
rollback;

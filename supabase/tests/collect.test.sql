-- U3 DB 테스트: 묶음 저장·상태 조회·분석 예약·해제·cron (logical-components §2, P-U3-R3·P2)
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

create temp table t_today as select (now() at time zone 'Asia/Seoul')::date as d;

-- 번들 하나 만들기 (dedup, 원천 gh:no, 마감일 오프셋)
create or replace function pg_temp.bundle(p_key text, p_no text, p_end_offset integer, p_extra jsonb default '{}'::jsonb)
returns jsonb language sql as $$
  select jsonb_build_object(
    'notice', jsonb_build_object('dedup_key', p_key, 'title', '테스트 ' || p_key, 'provider', 'GH', 'primary_source', 'gh',
      'tenure', 'rent', 'apply_end', (select d from t_today) + p_end_offset),
    'sources', jsonb_build_array(jsonb_build_object('source', 'gh', 'source_notice_no', p_no, 'original_url', 'https://g/' || p_no,
      'content_hash', 'h-' || p_no, 'attachments', jsonb_build_array(jsonb_build_object('name', '공고문.pdf', 'url', 'https://g/' || p_no || '.pdf')))),
    'units', jsonb_build_array(jsonb_build_object('supply_type', 'happy_senior', 'requirements', '{}'::jsonb)),
    'district_ids', '[]'::jsonb
  ) || p_extra;
$$;

-- ---------- 저장·상태 조회 ----------
select is((select count(*)::int from public.collect_state('[{"source":"gh","source_notice_no":"none"}]')), 0, '없는 원천 → 상태 없음');

select isnt(public.upsert_notice_bundle(pg_temp.bundle('c-1', '1', 5)), null, '새 공고 저장');
select is((select summary_status from public.notices where dedup_key = 'c-1'), 'pending', '새 공고는 pending');
select is((select ai_attempts from public.notices where dedup_key = 'c-1'), 0, '새 공고는 시도 0');
select is((select attachments -> 0 ->> 'url' from public.source_notices where source = 'gh' and source_notice_no = '1'),
  'https://g/1.pdf', '첨부 저장');
select is((select content_hash || '/' || summary_status from public.collect_state('[{"source":"gh","source_notice_no":"1"}]')),
  'h-1/pending', '상태 조회: 해시·AI 상태');

-- ---------- AI 필드는 있을 때만 덮어쓴다 ----------
select public.upsert_notice_bundle(pg_temp.bundle('c-1', '1', 5,
  '{"summary":{"eligibilityPlain":"쉬운 설명","forSeniorCouple":"부부","generatedAt":"2026-10-15T00:00:00Z"},"summary_status":"done","ai_attempts":1,"ai_source_url":"https://g/1.pdf","release_claim":true}'));
select is((select summary_status || '/' || ai_attempts from public.notices where dedup_key = 'c-1'), 'done/1', '분석 결과 저장');
select public.upsert_notice_bundle(pg_temp.bundle('c-1', '1', 5));
select is((select summary ->> 'eligibilityPlain' from public.notices where dedup_key = 'c-1'), '쉬운 설명', '키가 없으면 요약 유지');
select is((select summary_status from public.notices where dedup_key = 'c-1'), 'done', '키가 없으면 상태 유지');

-- ---------- 원천이 다른 묶음으로 옮겨 가면 옛 공고 삭제 ----------
select public.upsert_notice_bundle(pg_temp.bundle('c-old', '9', 5));
select public.upsert_notice_bundle(pg_temp.bundle('c-new', '9', 5));
select is((select count(*)::int from public.notices where dedup_key = 'c-old'), 0, '원천이 모두 옮겨 간 옛 공고는 지운다');
select is((select n.dedup_key from public.source_notices s join public.notices n on n.id = s.notice_id
  where s.source = 'gh' and s.source_notice_no = '9'), 'c-new', '원천은 새 공고에 연결');

-- ---------- 예약 ----------
select public.upsert_notice_bundle(pg_temp.bundle('c-soon', '2', 1));
select public.upsert_notice_bundle(pg_temp.bundle('c-closed', '3', -1));
select public.upsert_notice_bundle(pg_temp.bundle('c-failed3', '4', 2, '{"summary_status":"failed","ai_attempts":3}'));
select public.upsert_notice_bundle(pg_temp.bundle('c-failed1', '5', 3, '{"summary_status":"failed","ai_attempts":1}'));
-- 대상: c-soon(+1), c-failed1(+3), c-new(+5). 제외: c-closed(마감), c-failed3(3회), c-1(done)

create temp table t_claim1 as select * from public.claim_notices_for_analysis(2, now()) as id;
select is(
  (select array_agg(n.dedup_key order by n.apply_end) from t_claim1 c join public.notices n on n.id = c.id),
  array['c-soon', 'c-failed1'], '마감 임박 순으로 2건 예약');
select is((select count(*)::int from public.claim_notices_for_analysis(10, now())), 1, '이미 예약된 공고는 다시 고르지 않는다 (남은 c-new만)');
select is((select count(*)::int from public.claim_notices_for_analysis(10, now())), 0, '모두 예약되면 0건');
select is((select count(*)::int from public.claim_notices_for_analysis(10, now() + interval '11 minutes')), 3, '10분 지난 예약은 다시 고를 수 있다');
select is((select count(*)::int from public.claim_notices_for_analysis(0, now() + interval '30 minutes')), 0, '한도 0이면 0건');

-- ---------- 해제 ----------
select public.release_notice_claim((select id from public.notices where dedup_key = 'c-soon'), true);
select is((select summary_status || '/' || ai_attempts || '/' || coalesce(ai_claimed_at::text, 'null') from public.notices where dedup_key = 'c-soon'),
  'failed/1/null', '실패 해제: 시도 + 1, failed, 예약 풀림');
select public.release_notice_claim((select id from public.notices where dedup_key = 'c-new'), false);
select is((select summary_status || '/' || ai_attempts || '/' || coalesce(ai_claimed_at::text, 'null') from public.notices where dedup_key = 'c-new'),
  'pending/0/null', '실패 아닌 해제: 예약만 풀림');

-- ---------- cron·호출 ----------
select is((select schedule from cron.job where jobname = 'collect-daily'), '0 20 * * *', 'collect-daily: KST 05:00');
select is((select schedule from cron.job where jobname = 'analyze-hourly'), '30 * * * *', 'analyze-hourly: 매시 30분');
select is(public.invoke_edge_function('no_such_fn'), null::bigint, 'Vault 값이 없으면 호출하지 않는다');
-- 이 테스트가 부른 함수의 기록만 센다 (로컬 DB에서는 실제 cron이 analyze 호출 기록을 남길 수 있다)
select is((select count(*)::int from public.collect_runs where source = 'all' and not ok and error like 'Vault 값 없음: no_such_fn_url%'), 1, '호출 안 함을 기록');

-- ---------- 권한 ----------
set local role anon;
select throws_ok($$select public.claim_notices_for_analysis(1, now())$$, '42501', null, 'anon: claim 실행 불가');
reset role;

select * from finish();
rollback;

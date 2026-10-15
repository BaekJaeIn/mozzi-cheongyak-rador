-- U3: 수집·분석 파이프라인 (logical-components §2, infrastructure-design §2·§3)
-- 규칙은 supabase/functions/_shared/__tests__/collect-fakes.ts(메모리 구현)와 같다 — 바꿀 때 함께 바꾼다.

-- ---------- 컬럼 ----------
alter table public.notices
  add column if not exists ai_attempts integer not null default 0 check (ai_attempts >= 0),
  add column if not exists ai_source_url text,
  add column if not exists ai_claimed_at timestamptz;

-- analyze 대상 찾기 (P-U3-R3)
create index if not exists notices_ai_pending_idx on public.notices (summary_status, apply_end);

alter table public.source_notices
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ---------- 묶음 저장 (0004 보완) ----------
-- 추가: 첨부 저장, AI 필드(있을 때만 덮어씀), 예약 해제, 원천이 모두 옮겨 간 옛 공고 삭제
create or replace function public.upsert_notice_bundle(p_bundle jsonb)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_notice jsonb := p_bundle -> 'notice';
  v_sources jsonb := coalesce(p_bundle -> 'sources', '[]'::jsonb);
  v_id uuid;
  v_previous uuid[];
begin
  insert into public.notices (
    dedup_key, title, complex_name, location, sido, sigungu, provider, primary_source, tenure,
    announced_at, apply_start, apply_end, result_at, contract_start, contract_end
  ) values (
    v_notice ->> 'dedup_key', v_notice ->> 'title', v_notice ->> 'complex_name', v_notice ->> 'location',
    v_notice ->> 'sido', v_notice ->> 'sigungu', v_notice ->> 'provider', v_notice ->> 'primary_source',
    v_notice ->> 'tenure',
    (v_notice ->> 'announced_at')::date, (v_notice ->> 'apply_start')::date, (v_notice ->> 'apply_end')::date,
    (v_notice ->> 'result_at')::date, (v_notice ->> 'contract_start')::date, (v_notice ->> 'contract_end')::date
  )
  on conflict (dedup_key) do update set
    title = excluded.title,
    complex_name = excluded.complex_name,
    location = excluded.location,
    sido = excluded.sido,
    sigungu = excluded.sigungu,
    provider = excluded.provider,
    primary_source = excluded.primary_source,
    tenure = excluded.tenure,
    announced_at = excluded.announced_at,
    apply_start = excluded.apply_start,
    apply_end = excluded.apply_end,
    result_at = excluded.result_at,
    contract_start = excluded.contract_start,
    contract_end = excluded.contract_end,
    updated_at = now()
  returning id into v_id;

  -- AI 필드: 번들에 키가 있을 때만 (없으면 기존 값 유지)
  update public.notices set
    summary = case when p_bundle ? 'summary' then nullif(p_bundle -> 'summary', 'null'::jsonb) else summary end,
    summary_status = case when p_bundle ? 'summary_status' then p_bundle ->> 'summary_status' else summary_status end,
    ai_attempts = case when p_bundle ? 'ai_attempts' then (p_bundle ->> 'ai_attempts')::integer else ai_attempts end,
    ai_source_url = case when p_bundle ? 'ai_source_url' then p_bundle ->> 'ai_source_url' else ai_source_url end,
    ai_claimed_at = case when coalesce((p_bundle ->> 'release_claim')::boolean, false) then null else ai_claimed_at end
  where id = v_id;

  -- 이번 원천이 전에 연결돼 있던 다른 공고 (묶음 키가 바뀐 경우)
  select coalesce(array_agg(distinct sn.notice_id), '{}') into v_previous
  from public.source_notices sn
  join jsonb_to_recordset(v_sources) as s(source text, source_notice_no text)
    on sn.source = s.source and sn.source_notice_no = s.source_notice_no
  where sn.notice_id <> v_id;

  insert into public.source_notices (source, source_notice_no, notice_id, original_url, raw, content_hash, attachments)
  select s.source, s.source_notice_no, v_id, s.original_url, s.raw, s.content_hash, coalesce(s.attachments, '[]'::jsonb)
  from jsonb_to_recordset(v_sources) as s(
    source text, source_notice_no text, original_url text, raw jsonb, content_hash text, attachments jsonb)
  on conflict (source, source_notice_no) do update set
    notice_id = excluded.notice_id,
    original_url = excluded.original_url,
    raw = excluded.raw,
    content_hash = excluded.content_hash,
    attachments = excluded.attachments,
    last_seen_at = now();

  -- 원천이 하나도 남지 않은 옛 공고는 지운다 (판정·주택형은 연쇄 삭제)
  delete from public.notices n
  where n.id = any (v_previous)
    and not exists (select 1 from public.source_notices sn where sn.notice_id = n.id);

  delete from public.housing_units where notice_id = v_id;
  insert into public.housing_units (
    notice_id, label, supply_type, exclusive_area_m2, supply_count,
    standard_requirements, extracted_requirements, requirements
  )
  select v_id, u.label, coalesce(u.supply_type, 'other'), u.exclusive_area_m2, u.supply_count,
         u.standard_requirements, u.extracted_requirements, coalesce(u.requirements, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_bundle -> 'units', '[]'::jsonb)) as u(
    label text, supply_type text, exclusive_area_m2 numeric, supply_count integer,
    standard_requirements jsonb, extracted_requirements jsonb, requirements jsonb);

  delete from public.notice_districts where notice_id = v_id;
  insert into public.notice_districts (notice_id, district_id)
  select v_id, d.district_id
  from jsonb_array_elements_text(coalesce(p_bundle -> 'district_ids', '[]'::jsonb)) as d(district_id)
  where exists (select 1 from public.districts x where x.id = d.district_id)
  on conflict do nothing;

  return v_id;
end;
$$;

-- ---------- 기존 상태 한 번에 조회 (P-U3-P2) ----------
-- p_keys: [{source, source_notice_no}]
create or replace function public.collect_state(p_keys jsonb)
returns table (
  source text, source_notice_no text, notice_id uuid, dedup_key text,
  content_hash text, summary_status text, ai_attempts integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  select sn.source, sn.source_notice_no, n.id, n.dedup_key, sn.content_hash, n.summary_status, n.ai_attempts
  from jsonb_to_recordset(coalesce(p_keys, '[]'::jsonb)) as k(source text, source_notice_no text)
  join public.source_notices sn on sn.source = k.source and sn.source_notice_no = k.source_notice_no
  join public.notices n on n.id = sn.notice_id;
$$;

-- ---------- 분석 예약 (P-U3-R3) ----------
-- 대기·실패(3회 미만) 중 예약이 없거나 10분 지난 것, 마감 전(한국 날짜)만, 마감 임박 순
create or replace function public.claim_notices_for_analysis(p_limit integer, p_now timestamptz)
returns setof uuid
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return query
  with picked as (
    select n.id
    from public.notices n
    where (n.summary_status = 'pending' or (n.summary_status = 'failed' and n.ai_attempts < 3))
      and (n.ai_claimed_at is null or n.ai_claimed_at < p_now - interval '10 minutes')
      and coalesce(n.apply_end, '9999-12-31'::date) >= (p_now at time zone 'Asia/Seoul')::date
    order by n.apply_end nulls last, n.first_seen_at, n.id
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.notices n set ai_claimed_at = p_now
  from picked
  where n.id = picked.id
  returning n.id;
end;
$$;

-- 예약 해제. 실패면 시도 + 1, 상태 failed
create or replace function public.release_notice_claim(p_notice_id uuid, p_failed boolean)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.notices set
    ai_claimed_at = null,
    ai_attempts = case when p_failed then ai_attempts + 1 else ai_attempts end,
    summary_status = case when p_failed then 'failed' else summary_status end
  where id = p_notice_id;
end;
$$;

-- ---------- Edge Function 호출 (cron) ----------
-- Vault: <name>_url, cron_secret. 없으면 호출하지 않고 collect_runs에 남긴다
create or replace function public.invoke_edge_function(p_name text)
returns bigint
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = p_name || '_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    insert into public.collect_runs (source, ok, error, started_at, finished_at)
    values ('all', false, format('Vault 값 없음: %s_url 또는 cron_secret (%s 호출 안 함)', p_name, p_name), now(), now());
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 150000
  );
end;
$$;

-- ---------- 권한: service_role만 (invoke_edge_function은 cron(postgres)만) ----------
revoke all on function public.upsert_notice_bundle(jsonb) from public, anon, authenticated;
revoke all on function public.collect_state(jsonb) from public, anon, authenticated;
revoke all on function public.claim_notices_for_analysis(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.release_notice_claim(uuid, boolean) from public, anon, authenticated;
revoke all on function public.invoke_edge_function(text) from public, anon, authenticated, service_role;
grant execute on function public.upsert_notice_bundle(jsonb) to service_role;
grant execute on function public.collect_state(jsonb) to service_role;
grant execute on function public.claim_notices_for_analysis(integer, timestamptz) to service_role;
grant execute on function public.release_notice_claim(uuid, boolean) to service_role;

-- ---------- 예약 작업 (UTC) — 재실행 안전 ----------
select cron.unschedule('collect-daily') where exists (select 1 from cron.job where jobname = 'collect-daily');
select cron.unschedule('analyze-hourly') where exists (select 1 from cron.job where jobname = 'analyze-hourly');

-- 매일 KST 05:00 = UTC 20:00 (정리 04:00 다음)
select cron.schedule('collect-daily', '0 20 * * *', $$select public.invoke_edge_function('collect')$$);
-- 매시 30분
select cron.schedule('analyze-hourly', '30 * * * *', $$select public.invoke_edge_function('analyze')$$);

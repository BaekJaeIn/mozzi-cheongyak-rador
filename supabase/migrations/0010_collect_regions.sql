-- 변경 요청 2 (U3 NFR 설계 P-U3-C1~C5, logical-components §5): 공고 지역 저장, AI 지역, 요약 대상 제한, 두 묶음 수집 호출
-- 재실행 안전: if not exists / create or replace / drop … if exists / cron 이름 지우고 다시 등록
-- (원천 'sh'는 0002 검사 제약에 이미 있다)

-- ---------- 칸 ----------
alter table public.notices add column if not exists regions_ai jsonb;
alter table public.notices drop constraint if exists notices_regions_ai_array;
alter table public.notices add constraint notices_regions_ai_array
  check (regions_ai is null or (jsonb_typeof(regions_ai) = 'array' and jsonb_array_length(regions_ai) <= 50));

-- ---------- 묶음 저장 (0007 + 지역) ----------
-- 바뀐 점: notice.regions 저장, regions_ai는 번들에 키가 있을 때만(분석 저장) — 수집 저장은 건드리지 않는다
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
    announced_at, apply_start, apply_end, result_at, contract_start, contract_end, regions
  ) values (
    v_notice ->> 'dedup_key', v_notice ->> 'title', v_notice ->> 'complex_name', v_notice ->> 'location',
    v_notice ->> 'sido', v_notice ->> 'sigungu', v_notice ->> 'provider', v_notice ->> 'primary_source',
    v_notice ->> 'tenure',
    (v_notice ->> 'announced_at')::date, (v_notice ->> 'apply_start')::date, (v_notice ->> 'apply_end')::date,
    (v_notice ->> 'result_at')::date, (v_notice ->> 'contract_start')::date, (v_notice ->> 'contract_end')::date,
    coalesce(v_notice -> 'regions', '[]'::jsonb)
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
    regions = excluded.regions,
    updated_at = now()
  returning id into v_id;

  -- AI 필드: 번들에 키가 있을 때만 (없으면 기존 값 유지)
  update public.notices set
    summary = case when p_bundle ? 'summary' then nullif(p_bundle -> 'summary', 'null'::jsonb) else summary end,
    summary_status = case when p_bundle ? 'summary_status' then p_bundle ->> 'summary_status' else summary_status end,
    ai_attempts = case when p_bundle ? 'ai_attempts' then (p_bundle ->> 'ai_attempts')::integer else ai_attempts end,
    ai_source_url = case when p_bundle ? 'ai_source_url' then p_bundle ->> 'ai_source_url' else ai_source_url end,
    ai_claimed_at = case when coalesce((p_bundle ->> 'release_claim')::boolean, false) then null else ai_claimed_at end,
    regions_ai = case when p_bundle ? 'regions_ai' then nullif(p_bundle -> 'regions_ai', 'null'::jsonb) else regions_ai end
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

-- ---------- 관심 지역 (U2 BR-U2-C10~C12와 같은 규칙 — pgTAP·TS가 같은 표로 확인, P-U3-C3) ----------
-- 공고(지구 목록·지역) 하나 × 관심(prefs: districtIds·regions) 하나. 버전 1 프로필(regions 없음)은 빈 목록
create or replace function public.interest_area_match(p_notice_districts text[], p_notice_regions jsonb, p_prefs jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from jsonb_array_elements_text(
        case when jsonb_typeof(p_prefs -> 'districtIds') = 'array' then p_prefs -> 'districtIds' else '[]'::jsonb end
      ) d(id)
      where d.id = any (coalesce(p_notice_districts, '{}'))
    )
    or exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(p_notice_regions) = 'array' then p_notice_regions else '[]'::jsonb end) r,
           jsonb_array_elements(case when jsonb_typeof(p_prefs -> 'regions') = 'array' then p_prefs -> 'regions' else '[]'::jsonb end) k
      where r ->> 'sido' = k ->> 'sido'
        and (k ->> 'sigungu' is null or r ->> 'sigungu' is null or r ->> 'sigungu' = k ->> 'sigungu')
    );
$$;

-- 관심 기기(프로필 있음 + p_since 이후 앱을 연 기기) 중 하나라도 관심 지역 안인가 (BR-U3-C17·C18)
create or replace function public.notice_in_any_interest(p_notice_id uuid, p_since timestamptz)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.notices n
    join public.device_profiles p on true
    join public.devices d on d.id = p.device_id
    where n.id = p_notice_id
      and d.last_seen_at >= p_since
      and public.interest_area_match(
        array(select nd.district_id from public.notice_districts nd where nd.notice_id = n.id),
        coalesce(n.regions_ai, n.regions),
        p.data -> 'prefs'
      )
  );
$$;

-- ---------- 분석 대상 (0007 + 관심 지역, BR-U3-C18·C19) ----------
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
      and public.notice_in_any_interest(n.id, p_now - interval '90 days')
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

-- 요약 대기 공고 수 (관측, NFR-U3-C11)
create or replace function public.analysis_backlog(p_now timestamptz)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.notices n
  where (n.summary_status = 'pending' or (n.summary_status = 'failed' and n.ai_attempts < 3))
    and coalesce(n.apply_end, '9999-12-31'::date) >= (p_now at time zone 'Asia/Seoul')::date
    and public.notice_in_any_interest(n.id, p_now - interval '90 days');
$$;

-- ---------- Edge Function 호출에 본문 (0007 + p_body) ----------
-- 인수 하나짜리를 지우고 기본값 있는 두 인수로 — 기존 cron 호출 invoke_edge_function('analyze')는 그대로 동작
drop function if exists public.invoke_edge_function(text);
create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
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
    body := coalesce(p_body, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 150000
  );
end;
$$;

-- ---------- 권한: service_role만 (invoke_edge_function은 cron(postgres)만) ----------
revoke all on function public.upsert_notice_bundle(jsonb) from public, anon, authenticated;
revoke all on function public.interest_area_match(text[], jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.notice_in_any_interest(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.claim_notices_for_analysis(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.analysis_backlog(timestamptz) from public, anon, authenticated;
revoke all on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.upsert_notice_bundle(jsonb) to service_role;
grant execute on function public.interest_area_match(text[], jsonb, jsonb) to service_role;
grant execute on function public.notice_in_any_interest(uuid, timestamptz) to service_role;
grant execute on function public.claim_notices_for_analysis(integer, timestamptz) to service_role;
grant execute on function public.analysis_backlog(timestamptz) to service_role;

-- ---------- 예약 작업 (UTC) — 두 묶음 (P-U3-C1) ----------
select cron.unschedule('collect-daily') where exists (select 1 from cron.job where jobname = 'collect-daily');
select cron.unschedule('collect-crawl') where exists (select 1 from cron.job where jobname = 'collect-crawl');
-- KST 05:00 = UTC 20:00 — 청약홈·LH
select cron.schedule('collect-daily', '0 20 * * *', $q$select public.invoke_edge_function('collect', '{"group":"api"}'::jsonb)$q$);
-- KST 05:10 = UTC 20:10 — GH·SH
select cron.schedule('collect-crawl', '10 20 * * *', $q$select public.invoke_edge_function('collect', '{"group":"crawl"}'::jsonb)$q$);

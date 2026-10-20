-- 변경 요청 3 (U3 BR-U3-D1~D33, U2 BR-U2-D50): 신혼·생애최초 물량 공급유형, 분석 판·다시 분석 (2026-10-20)
-- 재실행 안전: if not exists / create or replace / on conflict

-- ---------- 공급유형 시드 (요건 = U2 신청 방법 표준, reference-data.ts와 같아야 함 — reference-data.test.ts가 대조) ----------
insert into public.supply_type_standards (code, formal_label, plain_label, tenure, requirements, effective_from) values
  ('newlywed_special_supply', '신혼부부 특별공급', '신혼부부 몫 분양', 'sale', '{"marriage":{"maxYears":7,"engagedAllowed":"unknown"},"homeless":{"minYears":null},"income":{"basis":"urban_worker","percent":140,"dualIncomePercent":160,"priorityPercent":100,"priorityDualIncomePercent":120,"overLottery":{"realEstateMaxManwon":33100}},"savings":{"minMonths":6,"minPayments":6},"residence":{"sidoIn":["서울","인천","경기"]}}'::jsonb, '2026-01-01'),
  ('first_time_supply', '생애최초 특별공급', '처음 집 사는 분 몫 분양', 'sale', '{"firstTime":{"neverOwned":true,"incomeTaxYears":5,"marriedOrChildRequired":true},"homeless":{"minYears":null},"income":"unknown","asset":"unknown","savings":{"minMonths":12,"minPayments":12},"residence":{"sidoIn":["서울","인천","경기"]}}'::jsonb, '2026-01-01'),
  ('rental_newlywed_supply', '신혼부부 계층 임대', '신혼부부 몫 임대', 'rent', '{"marriage":{"maxYears":7,"engagedAllowed":"unknown"},"homeless":{"minYears":null},"income":"unknown","asset":"unknown","car":"unknown"}'::jsonb, '2026-01-01')
on conflict (code) do update set
  formal_label = excluded.formal_label, plain_label = excluded.plain_label, tenure = excluded.tenure,
  requirements = excluded.requirements, effective_from = excluded.effective_from;

-- ---------- 칸 (BR-U3-D30~D32) ----------
alter table public.notices add column if not exists analysis_version integer not null default 1 check (analysis_version >= 1);
alter table public.notices add column if not exists reanalysis_attempts integer not null default 0 check (reanalysis_attempts >= 0);
alter table public.notices add column if not exists reanalyzed_at timestamptz;

-- ---------- 묶음 저장 (0010 + analysis_version) ----------
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
    regions_ai = case when p_bundle ? 'regions_ai' then nullif(p_bundle -> 'regions_ai', 'null'::jsonb) else regions_ai end,
    analysis_version = case when p_bundle ? 'analysis_version' then (p_bundle ->> 'analysis_version')::integer else analysis_version end
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

-- ---------- 다시 분석 대상 (BR-U3-D31): 판 1 + done + 관심 지역 안 + 마감 전 + 시도 3회 미만, 한국 날짜 하루 5건 ----------
create or replace function public.claim_notices_for_reanalysis(p_limit integer, p_now timestamptz)
returns setof uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today date := (p_now at time zone 'Asia/Seoul')::date;
  v_used integer;
begin
  select count(*) into v_used from public.notices
  where reanalyzed_at is not null and (reanalyzed_at at time zone 'Asia/Seoul')::date = v_today;
  return query
  with picked as (
    select n.id
    from public.notices n
    where n.summary_status = 'done'
      and n.analysis_version < 2
      and n.reanalysis_attempts < 3
      and (n.reanalyzed_at is null or (n.reanalyzed_at at time zone 'Asia/Seoul')::date < v_today) -- 같은 공고는 하루 한 번 (AI 호출 수 = 오늘 예약 수)
      and (n.ai_claimed_at is null or n.ai_claimed_at < p_now - interval '10 minutes')
      and coalesce(n.apply_end, '9999-12-31'::date) >= v_today
      and public.notice_in_any_interest(n.id, p_now - interval '90 days')
    order by n.apply_end nulls last, n.first_seen_at, n.id
    limit greatest(least(p_limit, 5 - v_used), 0)
    for update skip locked
  )
  update public.notices n set ai_claimed_at = p_now, reanalyzed_at = p_now
  from picked
  where n.id = picked.id
  returning n.id;
end;
$$;

-- 다시 분석 실패: 요약·주택형·판은 그대로, 시도 +1 (BR-U3-D32)
create or replace function public.release_reanalysis(p_notice_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.notices set ai_claimed_at = null, reanalysis_attempts = reanalysis_attempts + 1 where id = p_notice_id;
$$;

revoke all on function public.upsert_notice_bundle(jsonb) from public, anon, authenticated;
revoke all on function public.claim_notices_for_reanalysis(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.release_reanalysis(uuid) from public, anon, authenticated;
grant execute on function public.upsert_notice_bundle(jsonb) to service_role;
grant execute on function public.claim_notices_for_reanalysis(integer, timestamptz) to service_role;
grant execute on function public.release_reanalysis(uuid) to service_role;

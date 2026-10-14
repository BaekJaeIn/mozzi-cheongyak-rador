-- U1: 원자적 다단계 쓰기 DB 함수 (logical-components.md §2, NFR Design Q4=A)
-- 모두 security invoker, search_path 고정, service_role만 실행 가능.
-- "틀" 함수(upsert_notice_bundle, replace_judgements_*, save_device_profile)는 사용하는 Unit이 새 마이그레이션으로 보완할 수 있다.

-- 기기 등록 (BR-U1-03·04·05, P-S4)
-- 결과: 'created' | 'existing'(같은 ID·같은 해시) | 'conflict'(같은 ID·다른 해시) | 'rate_limited'(최근 1시간 신규 20대 이상)
create or replace function public.register_device(p_id uuid, p_token_hash text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_existing text;
  v_recent integer;
begin
  -- 동시 등록이 한도를 넘지 않도록 등록 처리를 직렬화한다
  perform pg_advisory_xact_lock(hashtext('public.register_device'));

  select token_hash into v_existing from public.devices where id = p_id;
  if found then
    return case when v_existing = p_token_hash then 'existing' else 'conflict' end;
  end if;

  select count(*) into v_recent from public.devices where created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    return 'rate_limited';
  end if;

  insert into public.devices (id, token_hash) values (p_id, p_token_hash);
  return 'created';
end;
$$;

-- 기기와 연결된 모든 데이터 삭제 (US-20, BR-U1-16). 연쇄 삭제는 FK on delete cascade
create or replace function public.delete_device(p_id uuid)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
begin
  delete from public.devices where id = p_id;
  return found;
end;
$$;

-- 미접속 기기 삭제 (BR-U1-13). last_seen_at < p_before
create or replace function public.cleanup_expired_devices(p_before timestamptz)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from public.devices where last_seen_at < p_before;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 보관 기간 지난 공고 삭제 (BR-U1-14). 기준일 = 마감일 ?? 모집공고일 ?? 첫 수집일(한국 날짜), 기준일 < p_before_date
create or replace function public.cleanup_expired_notices(p_before_date date)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from public.notices
  where coalesce(apply_end, announced_at, (first_seen_at at time zone 'Asia/Seoul')::date) < p_before_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 기기의 판정 전체 교체 (U2 사용). p_rows: [{notice_id, verdict, in_district, score, detail, profile_version, computed_at}]
create or replace function public.replace_judgements_for_device(p_device_id uuid, p_rows jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from public.judgements where device_id = p_device_id;

  insert into public.judgements (device_id, notice_id, verdict, in_district, score, detail, profile_version, computed_at)
  select p_device_id, x.notice_id, x.verdict, x.in_district, x.score, x.detail, x.profile_version,
         coalesce(x.computed_at, now())
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    notice_id uuid, verdict text, in_district boolean, score numeric, detail jsonb,
    profile_version integer, computed_at timestamptz)
  where exists (select 1 from public.notices n where n.id = x.notice_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 공고들의 판정 교체 (U2 사용). p_rows: [{device_id, notice_id, ...}] 중 p_notice_ids에 속한 것만 넣는다
create or replace function public.replace_judgements_for_notices(p_notice_ids uuid[], p_rows jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from public.judgements where notice_id = any (p_notice_ids);

  insert into public.judgements (device_id, notice_id, verdict, in_district, score, detail, profile_version, computed_at)
  select x.device_id, x.notice_id, x.verdict, x.in_district, x.score, x.detail, x.profile_version,
         coalesce(x.computed_at, now())
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    device_id uuid, notice_id uuid, verdict text, in_district boolean, score numeric, detail jsonb,
    profile_version integer, computed_at timestamptz)
  where x.notice_id = any (p_notice_ids)
    and exists (select 1 from public.devices d where d.id = x.device_id)
    and exists (select 1 from public.notices n where n.id = x.notice_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 원천 공고 + 대표 공고 + 주택형 + 지구 연결 한 번에 저장 (U3 사용·보완, BR-U1-22·23)
-- p_bundle: { notice: {...notices 컬럼(id·first_seen_at·summary 제외)}, sources: [...], units: [...], district_ids: [...] }
-- 대표 공고는 dedup_key로 upsert하며 요약(summary)과 첫 수집 시각은 덮어쓰지 않는다. 대표 공고 id 반환
create or replace function public.upsert_notice_bundle(p_bundle jsonb)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_notice jsonb := p_bundle -> 'notice';
  v_id uuid;
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

  insert into public.source_notices (source, source_notice_no, notice_id, original_url, raw, content_hash)
  select s.source, s.source_notice_no, v_id, s.original_url, s.raw, s.content_hash
  from jsonb_to_recordset(coalesce(p_bundle -> 'sources', '[]'::jsonb)) as s(
    source text, source_notice_no text, original_url text, raw jsonb, content_hash text)
  on conflict (source, source_notice_no) do update set
    notice_id = excluded.notice_id,
    original_url = excluded.original_url,
    raw = excluded.raw,
    content_hash = excluded.content_hash,
    last_seen_at = now();

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

-- 프로필 저장 (U4 사용). 저장할 때마다 profile_version + 1, 새 버전 반환
-- p_profile: { schema_version, data, enc_monthly_income, enc_total_asset, enc_car_value }
create or replace function public.save_device_profile(p_device_id uuid, p_profile jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_version integer;
begin
  insert into public.device_profiles (
    device_id, schema_version, data, enc_monthly_income, enc_total_asset, enc_car_value
  ) values (
    p_device_id, (p_profile ->> 'schema_version')::integer, p_profile -> 'data',
    p_profile ->> 'enc_monthly_income', p_profile ->> 'enc_total_asset', p_profile ->> 'enc_car_value'
  )
  on conflict (device_id) do update set
    schema_version = excluded.schema_version,
    data = excluded.data,
    enc_monthly_income = excluded.enc_monthly_income,
    enc_total_asset = excluded.enc_total_asset,
    enc_car_value = excluded.enc_car_value,
    profile_version = public.device_profiles.profile_version + 1,
    updated_at = now()
  returning profile_version into v_version;
  return v_version;
end;
$$;

-- 실행 권한: service_role만
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.register_device(uuid, text)',
    'public.delete_device(uuid)',
    'public.cleanup_expired_devices(timestamptz)',
    'public.cleanup_expired_notices(date)',
    'public.replace_judgements_for_device(uuid, jsonb)',
    'public.replace_judgements_for_notices(uuid[], jsonb)',
    'public.upsert_notice_bundle(jsonb)',
    'public.save_device_profile(uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

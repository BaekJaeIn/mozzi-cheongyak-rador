-- U2: 판정 기준 데이터 + 판정 저장 함수 교체 (U2 logical-components §3)
-- 값의 원본은 supabase/functions/_shared/eligibility/reference-data.ts 이며,
-- reference-data.test.ts가 이 파일의 시드와 대조한다. 한 행은 한 줄로 유지할 것 (테스트가 줄 단위로 읽음).

-- ---------- 지구: 동 키워드 추가 + 6개 지구 ----------
alter table public.districts add column if not exists area_keywords text[] not null default '{}';

insert into public.districts (id, name, sido, sigungu, keywords, area_keywords, active, sort_order) values
  ('wangsuk', '남양주 왕숙', '경기', '{남양주시}', '{왕숙}', '{진접읍,진건읍,일패동,이패동,퇴계원}', true, 1),
  ('gyosan', '하남 교산', '경기', '{하남시}', '{교산}', '{천현동,교산동,춘궁동,상사창동,하사창동,항동}', true, 2),
  ('changneung', '고양 창릉', '경기', '{"고양시 덕양구"}', '{창릉}', '{용두동,화전동,도내동,원흥동,동산동}', true, 3),
  ('daejang', '부천 대장', '경기', '{부천시}', '{부천대장}', '{대장동,오정동,원종동}', true, 4),
  ('gyeyang', '인천 계양', '인천', '{계양구}', '{인천계양,계양테크노밸리}', '{귤현동,동양동,박촌동,병방동,상야동}', true, 5),
  ('gwangmyeong_siheung', '광명 시흥', '경기', '{광명시,시흥시}', '{광명시흥}', '{광명동,옥길동,가학동,노온사동,과림동,무지내동}', true, 6)
on conflict (id) do update set
  name = excluded.name, sido = excluded.sido, sigungu = excluded.sigungu, keywords = excluded.keywords,
  area_keywords = excluded.area_keywords, active = excluded.active, sort_order = excluded.sort_order;

-- ---------- 소득 기준표: 원 단위, 100% 금액만 ----------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'income_asset_thresholds' and column_name = 'amount_manwon') then
    alter table public.income_asset_thresholds rename column amount_manwon to amount_won;
  end if;
end $$;
alter table public.income_asset_thresholds alter column amount_won type bigint;
alter table public.income_asset_thresholds drop constraint if exists income_asset_thresholds_kind_check;
alter table public.income_asset_thresholds add constraint income_asset_thresholds_kind_check check (kind = 'monthly_income');
alter table public.income_asset_thresholds drop constraint if exists income_asset_thresholds_basis_check;
alter table public.income_asset_thresholds add constraint income_asset_thresholds_basis_check check (basis in ('urban_worker', 'median'));

-- 출처: 마이홈포털 국민임대주택 입주자격(도시근로자), 통합공공임대주택 입주자격(기준 중위소득) — 2026년도 적용, 2026-10-14 확인
-- https://www.myhome.go.kr/hws/portal/cont/selectNationalRentalHouseView.do
-- https://www.myhome.go.kr/hws/portal/cont/selectIntegratedPubRentalHouseView.do
insert into public.income_asset_thresholds (year, kind, household_size, basis, amount_won) values
  (2026, 'monthly_income', 1, 'urban_worker', 3813363),
  (2026, 'monthly_income', 2, 'urban_worker', 5866270),
  (2026, 'monthly_income', 3, 'urban_worker', 8168429),
  (2026, 'monthly_income', 4, 'urban_worker', 8802202),
  (2026, 'monthly_income', 5, 'urban_worker', 9326985),
  (2026, 'monthly_income', 6, 'urban_worker', 9906263),
  (2026, 'monthly_income', 7, 'urban_worker', 10485541),
  (2026, 'monthly_income', 1, 'median', 2564238),
  (2026, 'monthly_income', 2, 'median', 4199292),
  (2026, 'monthly_income', 3, 'median', 5359036),
  (2026, 'monthly_income', 4, 'median', 6494738),
  (2026, 'monthly_income', 5, 'median', 7556719),
  (2026, 'monthly_income', 6, 'median', 8555952),
  (2026, 'monthly_income', 7, 'median', 9515150),
  (2026, 'monthly_income', 8, 'median', 10474348)
on conflict (year, kind, household_size, basis) do update set amount_won = excluded.amount_won;

-- ---------- 공급유형 표준 요건 (effective_from 2026-01-01) ----------
-- 출처: 마이홈포털(국민임대·통합공공임대·영구임대), LH청약플러스 행복주택 입주자격, SH 공공분양 일반공급, 무순위 청약 개편 보도(2025) — 2026-10-14 확인
-- "unknown" = 2026 공식 수치 미확인 → 공고 추출 값이 없으면 "확인 필요" (OI-U2-3)
-- 행복주택 고령자 자동차: 출처 3,708만 vs 4,542만 → 너그러운 값 4,542만 (BR-U2-34)
insert into public.supply_type_standards (code, formal_label, plain_label, tenure, requirements, effective_from) values
  ('public_sale_general', '공공분양 일반공급', '공공 분양 아파트', 'sale', '{"homeless":{"minYears":null},"income":{"basis":"urban_worker","percent":100,"dualIncomePercent":200,"appliesToAreaMaxM2":60},"asset":"unknown","car":"unknown","savings":{"minMonths":12,"minPayments":12},"residence":{"sidoIn":["서울","인천","경기"]}}'::jsonb, '2026-01-01'),
  ('private_sale_general', '민영주택 일반공급', '민간 분양 아파트', 'sale', '{"savings":{"minMonths":12,"depositRule":"private_by_region_area"},"residence":{"sidoIn":["서울","인천","경기"]}}'::jsonb, '2026-01-01'),
  ('senior_welfare', '고령자 복지주택', '어르신 복지주택 (복지시설 함께)', 'rent', '{"age":{"minAge":65,"who":"member"},"homeless":{"minYears":null},"asset":"unknown","car":"unknown","welfare":{"anyOf":["livelihood_or_medical"],"orIncome":{"basis":"urban_worker","percent":50,"percentBySize":{"1":70,"2":60}}}}'::jsonb, '2026-01-01'),
  ('national_rental_senior', '국민임대 고령자 우선공급', '오래 사는 임대 — 어르신 우선 물량', 'rent', '{"age":{"minAge":65,"who":"member"},"homeless":{"minYears":null},"income":{"basis":"urban_worker","percent":70,"percentBySize":{"1":90,"2":80}},"asset":{"maxManwon":34500},"car":{"maxManwon":4542}}'::jsonb, '2026-01-01'),
  ('permanent_rental_senior', '영구임대 고령자 대상', '아주 저렴한 임대 — 어르신 대상', 'rent', '{"age":{"minAge":65,"who":"member"},"homeless":{"minYears":null},"asset":"unknown","car":"unknown","welfare":{"anyOf":["livelihood_or_medical","near_poverty"],"orIncome":{"basis":"urban_worker","percent":50,"percentBySize":{"1":70,"2":60}}}}'::jsonb, '2026-01-01'),
  ('happy_senior', '행복주택 고령자 계층', '행복주택 — 어르신 몫', 'rent', '{"age":{"minAge":65,"who":"member"},"homeless":{"minYears":null},"income":{"basis":"urban_worker","percent":100,"percentBySize":{"1":120,"2":110}},"asset":{"maxManwon":34500},"car":{"maxManwon":4542}}'::jsonb, '2026-01-01'),
  ('integrated_rental', '통합공공임대', '소득 맞춤형 공공임대', 'rent', '{"homeless":{"minYears":null},"income":{"basis":"median","percent":150,"percentBySize":{"1":170,"2":160}},"asset":{"maxManwon":34500},"car":{"maxManwon":4542}}'::jsonb, '2026-01-01'),
  ('unranked', '무순위·잔여세대', '남은 집 추가 모집', 'sale', '{"homeless":{"minYears":null},"residence":"unknown"}'::jsonb, '2026-01-01'),
  ('other', '기타 공급', '기타', 'rent', '{"unclassified":true}'::jsonb, '2026-01-01')
on conflict (code) do update set
  formal_label = excluded.formal_label, plain_label = excluded.plain_label, tenure = excluded.tenure,
  requirements = excluded.requirements, effective_from = excluded.effective_from;

-- ---------- 판정 저장: 프로필 버전 확인 (P-U2-R3) ----------
drop function if exists public.replace_judgements_for_device(uuid, jsonb);
drop function if exists public.replace_judgements_for_notices(uuid[], jsonb);

-- p_rows: [{notice_id, verdict, in_district, score, detail, computed_at}]
-- 계산에 쓴 프로필 버전이 현재보다 낮거나 프로필이 없으면 저장하지 않고 -1 (오래된 계산)
create or replace function public.replace_judgements_for_device(p_device_id uuid, p_profile_version integer, p_rows jsonb)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current integer;
  v_count integer;
begin
  -- 같은 기기의 판정 저장이 동시에 끼어들지 못하게 프로필 행을 잠근다
  select profile_version into v_current from public.device_profiles where device_id = p_device_id for update;
  if not found or p_profile_version < v_current then
    return -1;
  end if;

  delete from public.judgements where device_id = p_device_id;

  insert into public.judgements (device_id, notice_id, verdict, in_district, score, detail, profile_version, computed_at)
  select p_device_id, x.notice_id, x.verdict, x.in_district, x.score, x.detail, p_profile_version,
         coalesce(x.computed_at, now())
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
    notice_id uuid, verdict text, in_district boolean, score numeric, detail jsonb, computed_at timestamptz)
  where exists (select 1 from public.notices n where n.id = x.notice_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_judgements_for_device(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.replace_judgements_for_device(uuid, integer, jsonb) to service_role;

-- U2 DB 테스트: 기준 데이터 시드 (0006)
-- 값 자체의 정확성은 reference-data.test.ts(Vitest)가 TS 원본과 대조한다. 여기서는 DB에 실제로 들어갔는지 확인.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

select is((select count(*)::int from public.districts where active), 6, '활성 지구 6개');
select is(
  (select area_keywords from public.districts where id = 'daejang'),
  array['대장동', '오정동', '원종동'],
  '부천 대장은 동 키워드로만 "대장"을 쓴다');
select is((select keywords from public.districts where id = 'daejang'), array['부천대장'], '"대장" 단독 키워드 없음');
select is((select sigungu from public.districts where id = 'changneung'), array['고양시 덕양구'], '공백 있는 시군구 보존');

select is((select count(*)::int from public.income_asset_thresholds where year = 2026), 15, '2026 소득 기준표 15행');
select is(
  (select amount_won from public.income_asset_thresholds where year = 2026 and basis = 'urban_worker' and household_size = 2),
  5866270::bigint,
  '2026 도시근로자 2인 100% = 5,866,270원');

select is((select count(*)::int from public.supply_type_standards), 10, '공급유형 10개 (0012 신혼희망타운 포함)');
select is(
  (select requirements -> 'asset' ->> 'maxManwon' from public.supply_type_standards where code = 'happy_senior'),
  '34500',
  '행복주택 고령자 총자산 3억 4,500만원');
select is(
  (select requirements ->> 'unclassified' from public.supply_type_standards where code = 'other'),
  'true',
  'other는 분류 실패');

select * from finish();
rollback;

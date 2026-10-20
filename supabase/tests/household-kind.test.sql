-- 변경 요청 3 DB 테스트 (0012): 신혼희망타운 공급유형 시드, v3 프로필 저장
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select is((select tenure from public.supply_type_standards where code = 'newlywed_hope_town'), 'sale', '신혼희망타운 시드');
select is((select requirements -> 'marriage' ->> 'maxYears' from public.supply_type_standards where code = 'newlywed_hope_town'), '7', '혼인 7년 요건');
select is((select requirements ->> 'income' from public.supply_type_standards where code = 'newlywed_hope_town'), 'unknown', '소득 기준은 확인 필요(원문 미확인)');

-- v3 프로필(가구 종류·신혼 정보·배우자 소득 암호문)도 지금 RPC로 저장된다
insert into public.devices (id, token_hash) values ('dddddddd-0000-4000-8000-000000000003', repeat('d', 64));
select ok(public.save_device_profile('dddddddd-0000-4000-8000-000000000003',
  '{"schema_version":3,"data":{"householdKind":"newlywed","newlywed":{"marriage":"engaged"},"money":{"spouseEarns":true,"encSpouseMonthlyIncome":"v1.x"}},"enc_monthly_income":"v1.y","enc_total_asset":null,"enc_car_value":null}'::jsonb) >= 1,
  'v3 프로필 저장');

select * from finish();
rollback;

-- 변경 요청 4 DB 테스트 (0015): 공고 신청 대상 칸·값 제약, 계층 모름 공급유형 시드
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select has_column('public', 'notices', 'audiences', 'notices.audiences 칸');
select col_not_null('public', 'notices', 'audiences', 'audiences는 null 아님');
select col_default_is('public', 'notices', 'audiences', '{}'::text[], '기본값 빈 배열 (누구나·모름)');

insert into public.notices (dedup_key, title, provider, primary_source, tenure)
values ('aud-1', '대상 테스트', 'GH', 'gh', 'rent');
select is((select audiences from public.notices where dedup_key = 'aud-1'), '{}'::text[], '새 공고는 빈 대상');

select lives_ok($$ update public.notices set audiences = array['dormitory', 'senior'] where dedup_key = 'aud-1' $$, '표의 대상 값은 저장된다');
select throws_ok($$ update public.notices set audiences = array['모름'] where dedup_key = 'aud-1' $$, '23514', null, '표에 없는 값은 막는다');

select is(
  (select count(*)::int from public.supply_type_standards
   where (code = 'happy_unknown' and requirements = (select requirements from public.supply_type_standards where code = 'happy_senior'))
      or (code = 'national_rental_unknown' and requirements = (select requirements from public.supply_type_standards where code = 'national_rental_senior'))),
  2, '계층 모름 2개 = 고령자 줄과 같은 요건');

select * from finish();
rollback;

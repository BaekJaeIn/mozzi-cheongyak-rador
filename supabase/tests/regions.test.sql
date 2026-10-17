-- 변경 요청 2 DB 테스트: 공고 지역 칸 (0009)
-- 실행: npm run db:test (로컬 Supabase, Docker 필요)
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select has_column('public', 'notices', 'regions', '공고에 지역 칸이 있다');
select col_not_null('public', 'notices', 'regions', '지역 칸은 비어 있을 수 없다(빈 배열)');

insert into public.notices (id, dedup_key, title, provider, primary_source, tenure)
values ('cccccccc-0000-4000-8000-000000000001', 'regions-test-1', '지역 기본값', 'LH', 'lh_rental', 'rent');
select is((select regions from public.notices where id = 'cccccccc-0000-4000-8000-000000000001'), '[]'::jsonb, '기본값은 빈 배열(지구로만 매칭)');

select lives_ok(
  $$update public.notices set regions = '[{"sido":"서울","sigungu":"강서구"},{"sido":"경기","sigungu":null}]' where id = 'cccccccc-0000-4000-8000-000000000001'$$,
  '지역 배열을 저장할 수 있다'
);
select throws_ok(
  $$update public.notices set regions = '{"sido":"서울"}' where id = 'cccccccc-0000-4000-8000-000000000001'$$,
  '23514', null, '배열이 아니면 거부'
);

select * from finish();
rollback;

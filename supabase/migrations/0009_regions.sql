-- 변경 요청 2 (U2 domain-entities 변경 2): 공고 지역. 값은 U3 수집이 채운다. 칸 추가만이라 옛 코드와 함께 돌아도 안전
-- 형식: [{"sido":"서울|경기|인천","sigungu":"강서구"|null}, …]  (sigungu null = 시도까지만 확인)
-- 재실행 안전: if not exists / drop constraint if exists

alter table public.notices add column if not exists regions jsonb not null default '[]'::jsonb;
alter table public.notices drop constraint if exists notices_regions_array;
alter table public.notices add constraint notices_regions_array check (jsonb_typeof(regions) = 'array' and jsonb_array_length(regions) <= 50);

-- 관심 지역 매칭은 판정(TS)에서 하고, 요약 대상 고르기(U3)에서 시도·시군구로 찾는다
create index if not exists notices_regions_idx on public.notices using gin (regions jsonb_path_ops);

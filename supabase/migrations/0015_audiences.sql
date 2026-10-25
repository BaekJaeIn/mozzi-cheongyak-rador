-- 변경 4 U2: 공고 신청 대상·계층 모름 공급유형 (U2 domain-entities "변경 요청 4", BR-U2-E10·E20·E21)
-- 추가만 — 옛 코드는 audiences 칸을 읽지 않아도 동작한다

-- 공고 신청 대상 (U3가 채움). 빈 배열 = 누구나 또는 모름
alter table public.notices
  add column if not exists audiences text[] not null default '{}';

alter table public.notices drop constraint if exists notices_audiences_check;
alter table public.notices add constraint notices_audiences_check check (
  audiences <@ array['dormitory', 'startup', 'artist', 'student', 'youth', 'disabled', 'low_income', 'senior', 'newlywed']::text[]
);

-- 계층 모름 국민임대·행복주택 — 표준 요건은 고령자 줄과 같다 (부모님 판정 그대로)
insert into public.supply_type_standards (code, formal_label, plain_label, tenure, requirements, effective_from) values
  ('national_rental_unknown', '국민임대', '국민임대 (계층은 공고문 확인)', 'rent', '{"age":{"minAge":65,"who":"member"},"homeless":{"minYears":null},"income":{"basis":"urban_worker","percent":70,"percentBySize":{"1":90,"2":80}},"asset":{"maxManwon":34500},"car":{"maxManwon":4542}}'::jsonb, '2026-01-01'),
  ('happy_unknown', '행복주택', '행복주택 (계층은 공고문 확인)', 'rent', '{"age":{"minAge":65,"who":"member"},"homeless":{"minYears":null},"income":{"basis":"urban_worker","percent":100,"percentBySize":{"1":120,"2":110}},"asset":{"maxManwon":34500},"car":{"maxManwon":4542}}'::jsonb, '2026-01-01')
on conflict (code) do update set
  formal_label = excluded.formal_label, plain_label = excluded.plain_label, tenure = excluded.tenure,
  requirements = excluded.requirements, effective_from = excluded.effective_from;

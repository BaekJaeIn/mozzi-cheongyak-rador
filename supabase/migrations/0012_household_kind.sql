-- 변경 요청 3 (U2): 신혼희망타운 공급유형 시드 (2026-10-20)
-- 프로필 v3(가구 종류·신혼 정보)는 device_profiles.data(jsonb)에 들어가고, 배우자 월소득은 암호문으로 data 안에 둔다 — 칸 추가 없음
-- 신혼희망타운 소득·자산은 2026 원문 미확인 → "unknown"(확인 필요, BR-U2-D41). 노부부 가구는 혼인 조건 미충족 (BR-U2-D14)
insert into public.supply_type_standards (code, formal_label, plain_label, tenure, requirements, effective_from) values
  ('newlywed_hope_town', '신혼희망타운', '신혼부부 전용 공공주택', 'sale', '{"marriage":{"maxYears":7,"engagedAllowed":true},"homeless":{"minYears":null},"income":"unknown","asset":"unknown"}'::jsonb, '2026-01-01')
on conflict (code) do update set
  formal_label = excluded.formal_label, plain_label = excluded.plain_label, tenure = excluded.tenure,
  requirements = excluded.requirements, effective_from = excluded.effective_from;

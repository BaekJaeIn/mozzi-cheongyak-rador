# U2 eligibility-engine — 변경 요청 4 코드 요약

> 계획: `construction/plans/U2-eligibility-engine-change-4-code-generation-plan.md` · 설계: 기능 설계 변경 4 (domain-entities "변경 요청 4", business-rules §12, business-logic-model §8)

## 새 파일

| 파일 | 내용 |
|---|---|
| `domain/audiences.ts` | `NoticeAudience` 9개, 표 순서, 가구 종류별 허용 대상, `audienceBlocked`, `parseAudiences` (BR-U2-E10·E12) |
| `eligibility/__tests__/legacy/change3/` | **변경 4 전 engine·routes·area·supply-types 고정본**(테스트 전용) — P-C4-5 비교 기준 |
| `eligibility/__tests__/change4.test.ts` | 예시 16개: 신고 공고 9건(두 가구 모두 숨김), 맞는 공고(부천대장 지구·부천시) 보임, 시도까지만 공고, 여러 대상·은빛주택·사유 순서, 계층 모름 |
| `eligibility/__tests__/change4.pbt.test.ts` | P-C4-1~6 (지역 단조성, 시도까지만 oracle, 대상 표, 막힘 → 숨김, 변경 3과 같음, 분류) |
| `supabase/migrations/0015_audiences.sql` | `notices.audiences text[] not null default '{}'` + 값 제약, `happy_unknown`·`national_rental_unknown` 시드(고령자 줄 요건 복사) |
| `supabase/tests/audiences.test.sql` | pgTAP 7개 (칸·기본값·제약·시드) |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `eligibility/area.ts` | `regionMatches`: 공고가 시도까지만이면 시도 전체를 고른 경우에만 (BR-U2-E1). 위치 표시 순서도 같은 함수 |
| `domain/supply-types.ts` | 계층 모름 코드 2개, 분류: 국민임대·행복주택은 고령자·어르신 말이 있을 때만 `*_senior` (E20) |
| `eligibility/routes.ts` | 신혼: `*_unknown` → 신혼부부 몫 임대, `*_senior` → 신청 방법 없음(어르신 대상) (E22) |
| `eligibility/reference-data.ts` | 계층 모름 표준 요건 = 고령자 줄 (공용 상수로 묶음) |
| `eligibility/types.ts` | `NoticeForJudgement.audiences`, `CriterionKey` + `audience` |
| `eligibility/messages.ts` | `AUDIENCE_MSG` 9개 |
| `eligibility/engine.ts` | 대상이 막히면 모든 주택형 미충족 + 대상 조건 1개(신혼은 `routes: []`), **주택형이 없어도 공고 미충족** (E11 — PBT가 찾은 빈틈) |
| `_lib/db/repositories.ts`, `src/server/db/notice-repository.ts` | 판정 입력 읽기에 `audiences` (칸이 없으면 빈 배열) |
| `feed/visible.ts`, `features/notice/model/display.ts`·`judgement.ts` | 저장된 `audience` 조건 읽기, 이름 "신청 대상", 고치기 링크 없음 |
| 테스트 | change2(시도까지만 기대 바꿈), 관심 지역 공유 표(SQL은 AI 분석 대상이라 넓게 유지 — 다른 줄 명시), 분류·번들·신청 방법 기대값(`*_unknown`), 시드 15개 |

## 남은 것 (다음 Unit)

- U3: `audiences` 채우기(제목·상세·공고문 AI), `upsert_notice_bundle`에 칸 저장, 시군구 찾기, 저장된 제목 분류 주택형 다시 분류(E23)
- SQL `interest_area_match`(AI 분석 대상)는 일부러 그대로 — 시도까지만 공고도 분석해야 시군구를 찾는다

## 검증 (2026-10-25)

- typecheck·lint·deno check 통과
- 단위 871개 통과 (3회)
- pgTAP 192개 통과 (로컬 Supabase, 0015 적용)
- 로컬 E2E 89 통과·3 건너뜀(알림 권한 — 전과 같음)

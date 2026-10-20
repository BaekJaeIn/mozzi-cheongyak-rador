# U5 feed-detail — 변경 요청 3 코드 요약

> 계획: `plans/U5-feed-detail-change-3-code-generation-plan.md` (Step 0~5 완료, 2026-10-20)
> 설계: functional-design domain-entities §9, business-rules §17 (BR-U5-D1~D32), frontend-components §9

## 바뀐 파일

| 파일 | 내용 |
|---|---|
| `supabase/functions/_shared/feed/visible.ts` | `RouteHint`, `routeHintOf(units)`, `FeedItem.routeHint?`(신혼만) — 피드·알림 공용 |
| `src/features/feed/model/cache.ts` | 피드 저장본 검사에 `routeHint` |
| `src/features/notice/model/judgement.ts` | `JudgementGroup.routes`(판정 → 방법 표 순서), 묶음 기준에 방법별 결과, `routeHintText`·`withEuro`(으로/로), `summarySection`, `showChildHint`, 소득 "(두 분 합계)", 혼인 링크 → `marriage` 그룹 |
| `src/features/notice/NoticeDetailView.tsx` | `GroupBlock` 신청 방법 목록(첫 방법 펼침, 나머지 `details`), 방법 하나면 제목에 "· ○○으로", `RouteBlock`·`CriteriaList`로 나눔, 자녀 안내, `AiSummary` 가구 종류별 볼 점 절·준비 중 |
| `src/features/feed/FeedView.tsx` | 카드 신청 방법 한 줄 |

## 테스트

| 파일 | 내용 |
|---|---|
| `notice/model/__tests__/legacy/judgement.ts` | 변경 3 전 사본 — P-U5-D1 비교 대상 |
| `notice/model/__tests__/change3.test.ts` (10) | 방법 순서·묶기, 자녀 안내, 카드 한 줄·문구(으로/로), 볼 점 절, 두 분 합계, 링크 |
| `notice/model/__tests__/change3.pbt.test.ts` (4) | P-U5-D1~D4 |
| `notice/model/__tests__/arbitraries.ts` | `routedUnitsArb` |
| `e2e/helpers.ts` | `SAMPLE_NEWLYWED_PROFILE`(v3), `seedNewlywedNotice`(교산 공공분양, 신혼부부가 볼 점 있음) |
| `e2e/feed.spec.ts` (+2 × 2기기) | 신혼 가구 카드 한 줄·상세 신청 방법·신혼 볼 점 / 노부부 그대로 |

## 만들면서 고친 것

- 카드 문구 조사: "신혼부부 몫 임대**으로**"가 되지 않게 받침을 보고 "로"/"으로"를 고르는 `withEuro`

## 검증 (2026-10-20)

| 항목 | 결과 |
|---|---|
| typecheck·lint·deno check | 통과 |
| 단위 (seed 11·22·33) | 815 / 815 / 815 |
| pgTAP | 168/168 |
| 로컬 E2E | 83 통과, 3 건너뜀 |

## 배포 메모

- `visible.ts`는 Edge Function(dispatch)과 앱이 함께 쓴다 → 함수 배포와 push 둘 다(DB 0012·0013 → 함수 → push)
- DB 바꿈 없음

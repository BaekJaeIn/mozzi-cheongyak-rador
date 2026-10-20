# U5 feed-detail — 변경 요청 3 코드 생성 계획

> 근거: U5 기능 설계 변경 3 (domain-entities §9, business-rules §17 BR-U5-D1~D32, frontend-components §9, 2026-10-20 승인)
> 원칙: 노부부 판정(`routes` 없음)은 지금 코드 경로 그대로(P-U5-D1). DB 바꿈 없음. 피드 API에 `routeHint`(신혼만)를 더한다.

## 단계

- [x] **Step 0 — 노부부 비교용 사본** `src/features/notice/model/__tests__/legacy/judgement.ts` (지금 `groupJudgement`)
- [x] **Step 1 — 피드 카드 값** `supabase/functions/_shared/feed/visible.ts`: `routeHintOf(units)`, `FeedItem.routeHint?` (BR-U5-D20~D22)
- [x] **Step 2 — 판정 묶기·문구** `src/features/notice/model/judgement.ts`
  - `JudgementGroup.routes`(방법별 판정·조건·자녀 안내, 판정 → 방법 표 순서), 묶음 기준에 routes (BR-U5-D10~D14)
  - `routeHintText`, `summarySection(summary, kind)`, `withUserValue` "(두 분 합계)", 혼인 링크 → `marriage` 그룹 (BR-U5-D1·D2·D30·D31)
- [x] **Step 3 — 화면** `NoticeDetailView.tsx`(AiSummary 볼 점 절, GroupBlock 신청 방법 목록·RouteBlock), `FeedView.tsx`(카드 한 줄)
- [x] **Step 4 — 테스트**
  - 예시: `routeHintOf`·`routeHintText`, 신혼 묶음(방법 3개·1개), 자녀 안내, 볼 점 절 3경우, 금액 꼬리, 링크
  - PBT: P-U5-D1~D4 (신혼 판정 생성기는 U2 `newlywedProfileArb` + 엔진으로)
  - E2E `e2e/feed.spec.ts`: 신혼 프로필 기기 — 카드 한 줄, 상세 신청 방법 목록·볼 점 절 / 노부부 기기 그대로
- [x] **Step 5 — 검증과 문서**: typecheck·lint·deno check·단위(seed 3회)·pgTAP·로컬 E2E, `code-summary-change-3.md`, 로컬 커밋

## 배포 메모

- `visible.ts`는 Edge Function(dispatch)과 앱이 함께 쓴다 → 함수 배포·push 둘 다 (Build and Test 순서 그대로: DB → 함수 → push)

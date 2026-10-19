# U5 feed-detail — 변경 요청 2 코드 생성 계획

> 근거: U5 기능 설계 변경 2 (domain-entities §8, business-rules §16 BR-U5-C1~C8, business-logic-model §11, frontend-components §8, 2026-10-19 승인)
> 원칙: 노출·정렬·알림은 바꾸지 않는다. API에는 칸을 더하기만 한다(옛 앱·옛 피드 저장본이 깨지지 않게). DB 바꿈 없음(0009·0010 운영 적용됨).

## 단계

- [x] **Step 1 — 위치 이름 공용 함수** `supabase/functions/_shared/feed/place.ts` (새)
  - `orderRegions`, `regionName`, `placeLabel`, `placeNeedsCheck`, `summaryView` (domain-entities §8.2)
- [x] **Step 2 — 피드 행에 지역** `_shared/feed/visible.ts`
  - `FeedRow.notice.regions`, `FeedItem.regions`(관심 지역 먼저), 피드를 만드는 함수가 관심 지역(`RegionPick[]`)을 받게
  - 같은 함수를 쓰는 U6 발송(`push/plan.ts`·`dispatch.ts`)은 값만 넘김 (알림 문구·대상 그대로)
- [x] **Step 3 — 서버 읽기**
  - `src/server/db/feed-repository.ts`, Deno `_lib/db/repositories.ts`(발송용 피드): 공고 `regions`·`regions_ai` 선택 → `regions_ai ?? regions`
  - `src/server/handlers/feed.ts`: 서버 프로필 평문 prefs에서 관심 지역도 읽기
  - 상세(`NoticeDetail`)·관심 공고 목록(`NoticeSummary`)에 `regions`
- [x] **Step 4 — 기기 형식** `src/features/notice/model/api-types.ts`, 피드 저장본 읽기(`feed/model/cache.ts`): `regions` 없으면 빈 목록
- [x] **Step 5 — 화면**
  - 피드 카드·관심 공고 카드 위치 줄 (`placeLabel`)
  - 상세: 위치 줄 + "정확한 위치는 공고문에서 확인해 주세요", "관심 지역 밖의 공고예요" + [관심 지역 고치기], 요약 자리 3가지
- [x] **Step 6 — 테스트**
  - 예시: 위치 표시 4경우(business-logic-model §11.1), 요약 자리 3가지, API 응답의 `regions`, 옛 저장본
  - PBT `_shared/feed/__tests__/place.pbt.test.ts`: P-U5-C1~C3
  - 기존 피드·발송 테스트의 행 생성기·기대값에 `regions`
  - E2E `e2e/feed.spec.ts`: 지구 없는 "서울 강서구" 공고 + 강서구를 고른 프로필 → 카드·상세 위치, 관심 지역 밖 공고의 요약 자리
- [x] **Step 7 — 검증과 문서**
  - typecheck·lint·deno check·단위(seed 바꿔 3회)·pgTAP·로컬 E2E·통합 스모크(발송 포함)
  - `aidlc-docs/construction/U5-feed-detail/code/code-summary-change-2.md`, 로컬 커밋

## 배포 메모 (Build and Test에서 확정)

- Vercel(push) + Edge Function `dispatch` 다시 배포(공용 피드 코드가 바뀜). DB 바꿈 없음

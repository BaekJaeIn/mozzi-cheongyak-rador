# U5 feed-detail — 변경 요청 2 코드 요약

> 계획: `construction/plans/U5-feed-detail-change-2-code-generation-plan.md` · 설계: 기능 설계 변경 2 절 (domain-entities §8, business-rules §16, business-logic-model §11, frontend-components §8)

## 새 파일

| 파일 | 내용 |
|---|---|
| `supabase/functions/_shared/feed/place.ts` | 서버·기기 공용: `orderRegions`(관심 지역 먼저 → 공용 목록 순서), `regionName`("서울 강서구"/"서울"), `placeNames`(지구 이름, 없으면 지역 이름), `placeNeedsCheck`, `summaryView`(요약 / 관심 지역 밖 / 준비 중) |
| `_shared/feed/__tests__/place.test.ts` | 예시 6개 (위치 4경우, 요약 자리 3가지, 피드 카드 지역 순서) |
| `_shared/feed/__tests__/place.pbt.test.ts` | P-U5-C1~C3 |

## 바뀐 파일

| 파일 | 바뀐 것 |
|---|---|
| `_shared/feed/visible.ts` | `FeedRow.notice.regions`(선택 — 알림 발송은 안 넘겨도 됨), `FeedItem.regions`, `buildFeed(…, interestRegions = [])` |
| `src/server/db/feed-repository.ts` | 피드·상세·관심 공고 조회에 `regions`·`regions_ai` → `regions_ai ?? regions` |
| `src/server/feed/types.ts`·`build.ts` | `NoticeCore.regions`, 상세·관심 공고 요약 응답에 `regions`(공용 목록 순서) |
| `src/server/handlers/feed.ts` | `interestRegions(stored)` — 서버 프로필 평문 prefs, 피드 순서에 사용 |
| `src/features/notice/model/api-types.ts` | `NoticeDetail.regions`, `NoticeSummary.regions` |
| `src/features/feed/model/cache.ts` | 변경 2 전 피드 저장본은 `regions` 빈 목록으로 읽기 |
| `src/features/feed/FeedView.tsx` | 카드 위치 줄 = `placeNames` |
| `src/features/bookmarks/model/store.ts`·`BookmarksProvider.tsx`·`notice/ui/format.ts` | 관심 공고 저장본의 `districts` 칸에 위치 이름(지구 또는 지역)을 담음 — 저장 형식은 그대로, 순서는 기기 관심 지역 |
| `src/features/notice/NoticeDetailView.tsx` | 위치 줄 + "정확한 위치는 공고문에서 확인해 주세요", "관심 지역 밖의 공고예요" + [관심 지역 고치기], 요약 자리 3가지 |
| `e2e/helpers.ts`·`e2e/feed.spec.ts` | 지구 없는 서울 강서구·마포구 공고(로컬 DB), 강서구를 고른 프로필, 시나리오 2개 |
| 기존 테스트 | 피드·관심 공고·저장소 예시에 `regions` (저장소 테스트는 AI 지역 우선도 확인) |

## 설계에서 정하지 않았던 결정 (구현 중)

- 관심 공고 저장본은 칸 이름(`districts`)을 그대로 두고 **위치 이름**을 담는다. 옛 저장본(지구 이름)도 같은 화면으로 보이고, 형식 버전을 올리지 않아도 된다
- 상세의 위치 줄은 지구가 없는 공고에만 보인다(지구 공고는 위쪽 기관·지구 줄에 이미 지구 이름이 있음)

## 검증 (2026-10-19)

| 항목 | 결과 |
|---|---|
| typecheck·lint·deno check | 통과 |
| 단위 (FC_SEED 11·222·3333) | 723 / 723 / 723 |
| pgTAP | 150/150 |
| 로컬 E2E | 71 통과 + 3 건너뜀 |
| 통합 스모크(로컬 함수, 목업 수집·발송) | 13/13 — 첫 실행은 함수 서버가 막 뜬 직후 collect 응답이 비어 중간에 멈춤, 다시 실행해 통과 |

## 운영 반영 (Build and Test에서 확정)

- push(Vercel) + Edge Function `dispatch` 다시 배포(공용 피드 코드). DB 바꿈 없음

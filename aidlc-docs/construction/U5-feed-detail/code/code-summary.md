# U5 feed-detail — 코드 생성 요약

> 계획: `aidlc-docs/construction/plans/U5-feed-detail-code-generation-plan.md`
> 설계: `aidlc-docs/construction/U5-feed-detail/functional-design/`

## 1. 생성·변경 파일

| 영역 | 파일 |
|---|---|
| 순수 로직 (화면) | `src/features/notice/model/`: `api-types.ts`(API 응답 형식), `display.ts`(D-day·기간·NEW·타임라인·면적·세대수·조건 이름), `judgement.ts`(묶기·내 금액·한 줄 요약·설정 링크), `calendar.ts`(.ics·Google 링크·기기 판별). `src/features/bookmarks/model/store.ts`(관심 공고 저장소·정렬), `src/features/feed/model/seen.ts`(열어 본 기록), `cache.ts`(피드 저장본) |
| 순수 로직 (서버) | `src/server/feed/build.ts`(`buildFeed`·`needsRecompute`·`pickSources`·`toNoticeDetail`·`toNoticeSummary`·판정 상세 읽기), `types.ts`(`FeedQueryRepository` 형식) |
| 저장소 | `src/server/db/feed-repository.ts` (피드 행·판정 통계·공고 묶음 조회) |
| API | `src/server/handlers/feed.ts`, 라우트 `src/app/api/feed/route.ts`, `src/app/api/notices/route.ts`, `src/app/api/notices/[id]/route.ts`, `src/app/api/notices/[id]/calendar/route.ts`, `src/server/deps.ts` 연결 |
| 화면 | `src/features/feed/FeedView.tsx`(카드 포함), `src/features/notice/NoticeDetailView.tsx`, `src/features/notice/ui/badges.tsx`·`format.ts`, `src/features/bookmarks/BookmarksProvider.tsx`·`BookmarkButton.tsx`·`BookmarksView.tsx`, 라우트 `src/app/page.tsx`(피드 연결), `src/app/notice/[id]/page.tsx`, `src/app/bookmarks/page.tsx`(준비 중 화면 교체), `src/app/layout.tsx`(BookmarksProvider) |
| U4 수정 | `storage.ts`: `SEEN_KEY`·`FEED_CACHE_KEY`, `clearAllPersonal`이 함께 지움. `ProfileProvider.tsx`: 저장 시 피드 저장본 지움(BR-U5-54), `resendAll()` 추가 |
| 공용 수정 | `_shared/http/errors.ts`: `NOT_FOUND` 오류 코드 |
| 테스트 | `notice/model/__tests__/notice-model.test.ts`(34), `u5.pbt.test.ts`(P-U5-1~13, 16개), `arbitraries.ts`, `bookmarks/model/__tests__/stores.test.ts`, `server/feed/__tests__/build.test.ts`, `server/db/__tests__/feed-repository.test.ts`, `server/handlers/__tests__/feed.test.ts`(16), `fake-db.ts`(`neq`·`or`·`count`), `e2e/feed.spec.ts`(8개 × 2기기), `e2e/helpers.ts`(로컬 전용 공고 넣기·지우기) |
| 문서 | README "화면과 API (U5)" 절 |

## 2. 설계·계획 대비 조정

| 설계·계획 | 실제 | 이유 |
|---|---|---|
| Step 8: `JudgementRepository`·`NoticeRepository`에 조회 메서드 추가 | **Node 전용 `FeedQueryRepository`** 를 따로 둠 | 두 인터페이스는 Deno(`_lib`)도 구현한다(계약 K2). 메서드를 더하면 Edge Function 코드까지 바꿔야 해서 U5 조회는 분리 |
| BR-U5-64 "U4 동기화를 바로 보낸다" | `resendAll()`: 보낸 것도 모두 대기로 돌린 뒤 보냄 | 기기 저장 상태가 이미 "보냄"이면 `flushNow`는 아무것도 보내지 않아 서버 프로필이 복구되지 않는다 |
| frontend-components: 세대수 `<table>` | 주택형마다 카드 목록(제목 + 면적 + 세대수) | 360px·쉬운 모드에서 4열 표는 가로 스크롤이 생긴다(NFR-1). 내용은 같다 |
| 카드 링크 이름 = 단지명 | 카드 안 글자 전체(배지·단지명·지구·유형·기간) | 화면 낭독기에서 한 번에 공고 상태를 들을 수 있다 |
| BR-U5-133 캘린더 404 | 마감된 공고도 파일은 줌, 일정이 없거나 없는 공고만 404 | 버튼은 화면에서 숨기므로 마감 공고 링크를 막을 이유가 없다 |
| business-logic-model §9 "E2E에서 첫 피드 표시 시간 측정" | 측정하지 않음 → Build and Test로 넘김 | 4G 흉내 조건을 정하지 않았다. 저장본 먼저 그리기는 E2E로 확인함 |

### 코드 생성 중 고친 다른 Unit의 결함

| 위치 | 내용 |
|---|---|
| U3 `supabase/tests/collect.test.sql` 22번 | "Vault 값 없음" 기록을 **전부** 세서, 로컬 DB에서 실제 `analyze-hourly` cron이 남긴 기록까지 셈(2 ≠ 1). 테스트가 부른 함수(`no_such_fn`) 기록만 세게 고침. CI도 매시 30분에 걸리면 같은 실패가 날 수 있었다 |
| U4 `e2e/profile.spec.ts` | 마법사를 끝까지 지나가는 테스트가 WebKit·병렬 실행에서 30초를 넘음(31.8초) → `test.slow()` |

### push 뒤 CI에서 발견 (f48a26f)

| 위치 | 내용 |
|---|---|
| U5 `e2e/feed.spec.ts` 쉬운 모드 테스트 | `getByRole("heading", { level: 1 })`이 앱 머리글 h1과 공고 제목 h1 두 개를 찾아 iPhone에서 실패(41/42). 로컬에서는 상세가 그려지기 전에 확인이 끝나 우연히 통과했다 — 가로 스크롤 검사가 내용 없이 돌던 약한 테스트. 공고 제목·"판정 이유"가 보인 뒤에 재도록 고침, 로컬 16/16 |

## 3. 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm test` | ✅ 49개 파일, **520개 테스트** (U5 추가 약 100개), 서로 다른 seed 3번 + PBT 파일 단독 5번 |
| `npm run deno:check` | ✅ |
| `npm run build` | ✅ (`/notice/[id]`, `/api/feed`, `/api/notices`, `/api/notices/[id]`, `/api/notices/[id]/calendar`) |
| DB 테스트 (pgTAP, 로컬 Supabase) | ✅ **89/89** (U3 테스트 격리 수정 후) |
| E2E (로컬 Supabase, 실제 DB) | ✅ **42/42** — Android(Chromium)·iPhone(WebKit), U5 16개 + U1·U4 26개, axe 위반 0. 운영을 가리키는 `.env.local` 대신 로컬 값을 환경 변수로 넣어 실행. 테스트 공고는 끝나고 지워짐 확인 |

## 4. 남은 일

| 단계 | 내용 |
|---|---|
| push | 사용자 확인 후 → CI `ci`·`db-and-e2e` |
| 배포 | `main` push 시 Vercel 자동 배포. **DB 변경 없음** |
| U6 연결 | 알림 클릭 → `/notice/[id]`(1건) 또는 `/`(2건 이상) |
| Build and Test | 4G 조건에서 첫 피드 표시 시간 측정(NFR-4.1) |
| 실기기 확인 | iPhone 홈 화면 앱에서 [캘린더에 추가] → 캘린더 추가 화면이 열리는지 (E2E는 응답 형식까지만 확인) |

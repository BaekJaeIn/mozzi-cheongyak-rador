# U5 feed-detail — 코드 생성 계획

> **이 계획이 U5 코드 생성의 유일한 기준이다.** 단계를 끝낼 때마다 [x]로 표시한다.
> 설계: `aidlc-docs/construction/U5-feed-detail/functional-design/` (business-rules BR-U5-*, domain-entities, business-logic-model, frontend-components)
> NFR Requirements·NFR Design·Infrastructure Design은 생략(unit-of-work: NFR-4.1은 FD에 기록, 새 인프라 없음). **DB 마이그레이션 없음**(필요한 테이블·인덱스는 U1 0002·U3 0007에 있음).

## Unit 맥락

| 항목 | 내용 |
|---|---|
| 스토리 | US-12 피드, US-13 상세, US-14 판정 이유, US-15 AI 요약, US-16 캘린더, US-17 관심 공고 (기여: US-11 알림 이동 대상 `/notice/[id]`·`/`) |
| 의존 (U1) | route guard(`withDevice`), `respond`, api-client, `ErrorMessage`, `BottomNav`, 크기 토큰, `supplyTypeLabelsCache`·`districtsCache`, Playwright·axe |
| 의존 (U2) | `isVisible`(K5), `compareFeedItems`, `noticeStatus`, `UnitJudgement`·`CriterionResult` 형식, `judgementService().recomputeForDevice`, 날짜 함수(`diffDays`·`toKstDate`) |
| 의존 (U3) | 공고·주택형·출처 데이터, 요약 형식 `{ eligibilityPlain, forSeniorCouple }` |
| 의존 (U4) | `ProfileProvider`(기기 프로필·`flushNow`·`saveProfile`), `HomeGate` 피드 자리, `formatManwon`(한글 금액), `clearAllPersonal`, `BOOKMARKS_KEY` |
| 제공 (U6) | 알림 이동 경로 `/notice/[id]`, `/` (계약 K8) |
| 코드 위치 | 순수 로직 `src/features/{feed,notice,bookmarks}/model/`, 서버 순수 로직 `src/server/feed/`, 화면 `src/features/{feed,notice,bookmarks}/`, 핸들러 `src/server/handlers/feed.ts`, 라우트 `src/app/` |
| 테스트 | Vitest(node, `*.test.ts`) — 순수 로직 예시·PBT(P-U5-1~13), 핸들러·저장소. 화면은 Playwright E2E(로컬 Supabase, CI `db-and-e2e`) |

### 계획 단계 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| E2E 공고 데이터 | `e2e/helpers.ts`에 **로컬 Supabase일 때만** 공고·주택형·지구·출처를 넣고 지우는 함수 추가(U4 `releaseRegistrationLimit`과 같은 안전 장치: 주소가 127.0.0.1·localhost가 아니면 아무것도 하지 않고 테스트를 건너뜀). 판정은 화면에서 프로필을 저장해 **실제 U2 재계산**으로 만든다 | 판정을 손으로 넣으면 U2와 어긋날 수 있다. 운영 DB는 절대 건드리지 않는다 |
| 서버 프로필 읽기 | 피드·상세는 `ProfileRepository.get`의 평문 부분(`prefs.districtIds`)과 `profileVersion`만 쓴다. **금액 복호화 안 함** | 필요 없는 개인 정보는 열지 않는다 |
| 상세의 날짜 | 상세 응답의 상태는 서버 `today` 기준. 화면은 응답의 `today`로 D-day·타임라인 계산 | 기기 시계가 틀려도 서버와 같은 결과 |

---

## Part A. 순수 로직 (React 없음)

- [x] **Step 1. 표시 함수** `src/features/notice/model/display.ts`: `ddayLabel`(BR-U5-30~37), `periodLabel`(BR-U5-23), `isNew`(BR-U5-40), `timeline`(BR-U5-75~77), `areaLabel`·`unitRows`(BR-U5-78~81), 조건 이름 표 — US-12·13
- [x] **Step 2. 판정 이유** `src/features/notice/model/judgement.ts`: `groupJudgement`(BR-U5-86·87), `withUserValue`(BR-U5-90, U4 `formatManwon` 사용), 한 줄 요약 문구(BR-U5-85), 행동 문구의 설정 링크 대상(BR-U5-89) — US-14
- [x] **Step 3. 캘린더** `src/features/notice/model/calendar.ts`: `calendarEvent`(BR-U5-105·110), `buildIcs`(이스케이프·75바이트 접기·UTF-8 경계·DTEND+1·마감 전날 09:00 KST 알림 — BR-U5-107·108), `googleCalendarUrl`(BR-U5-109), `calendarTarget`(iOS·iPadOS 판별 — BR-U5-106) — US-16
- [x] **Step 4. 기기 저장** `src/features/bookmarks/model/store.ts`(`BookmarkStore`: list·has·toggle·remove·refresh, 100개, 깨진 항목 버림 — BR-U5-115~124, `sortBookmarks` — BR-U5-121), `src/features/feed/model/seen.ts`(`mz.seen` 기록·정리 — BR-U5-41~43), `src/features/feed/model/cache.ts`(`mz.feed` 저장·읽기·버전 검사, `redrawCachedFeed` — BR-U5-50~55). U4 `clearAllPersonal`에 `mz.seen`·`mz.feed` 추가 — US-12·17
- [x] **Step 5. 서버 순수 로직** `src/server/feed/`: `buildFeed`(isVisible·카드 공급유형·지구 순서·compareFeedItems — BR-U5-01·10·22·25), `judgementFreshness`(BR-U5-04 판단), `pickSources`(http(s)·대표 — BR-U5-100~102), `toNoticeDetail`·`toNoticeSummary`(응답에서 빼는 값 — BR-U5-134), 요약 표시 조건(BR-U5-95) — US-12·13·15
- [x] **Step 6. 예시 테스트** 각 `model/__tests__/*.test.ts`, `src/server/feed/__tests__/`: D-day 표 각 줄, 타임라인 오늘 위치(앞·중간·끝·날짜 없음·순서 어긋남), 면적 표기(59·84.97·0.5·null), 세대수 합계("이상"), 판정 묶기(같음·주택형마다 다름·미충족만), 내 금액 붙이기, .ics 내용(고정 날짜 2026-10-20~23), Google 링크, 관심 공고(가득 참·깨짐·gone), 저장본 다시 그리기, business-logic-model §8 예시 4건 → 피드
- [x] **Step 7. 속성 기반 테스트** `*.pbt.test.ts` + 생성기 `arbitraries.ts`(판정 행·주택형 판정·일정·관심 공고 명령열): P-U5-1~13 (domain-entities §7)

## Part B. 서버 API (S4)

- [x] **Step 8. 저장소**: `JudgementRepository.listFeedRows(deviceId, today)`(verdict≠ineligible·in_district·마감일≥오늘 또는 없음 + 공고·지구), `freshness(deviceId)`(개수·최소 profile_version), `getForNotice(deviceId, noticeId)`; `NoticeRepository.getDetail(id)`(주택형·지구·출처), `listSummaries(ids)`, `countRetained()`. 인터페이스 `_shared/db/repositories.ts`, Node 구현 `src/server/db/`, 테스트 가짜 — US-12·13·17
- [x] **Step 9. 핸들러·라우트** `src/server/handlers/feed.ts`: `GET /api/feed`(no_profile·재계산 1번·outdated — BR-U5-03~05·130), `GET /api/notices/[id]`(UUID 검사·404 — BR-U5-131), `GET /api/notices?ids=`(1~100, 400 — BR-U5-132), `GET /api/notices/[id]/calendar`(인증 없음, text/calendar — BR-U5-133). 라우트 `src/app/api/feed/route.ts`, `src/app/api/notices/route.ts`, `src/app/api/notices/[id]/route.ts`, `src/app/api/notices/[id]/calendar/route.ts`. `deps.ts` 연결, 로그(건수만) — US-12·13·16·17
- [x] **Step 10. 핸들러 테스트** `src/server/handlers/__tests__/feed.test.ts`: 401, no_profile, ready 정렬·노출, 오래된 판정 → 재계산 1번 → ready, 재계산 실패 → outdated, 상세 404(형식·없음)·판정 없음·프로필 없음·지구 밖·마감, ids 400(형식·101개)·missing, 캘린더 404·헤더·내용, 응답·로그에 금지 값 없음(BR-U5-134)

## Part C. 화면

- [x] **Step 11. 공용 부품** `src/features/notice/ui/`: `DdayBadge`, `NewBadge`, `VerdictBadge`, `Toast`, `BookmarkButton` + `BookmarksProvider`(context, `storage` 이벤트, 모두 지우기 뒤 다시 읽기) — `layout.tsx`에 연결 — US-12·17
- [x] **Step 12. 피드** `src/features/feed/FeedView.tsx`(`NoticeCard`, `FeedStatusBar`, `FeedEmpty`, 저장본 먼저·no_profile → flushNow 1번·오류 — BR-U5-50~65), `src/app/page.tsx`의 `HomeGate feed`에 연결, U4 `saveProfile` 뒤 `mz.feed` 지움(BR-U5-54) — US-12
- [x] **Step 13. 상세** `src/features/notice/NoticeDetailView.tsx`(`OriginalLinkButton`, `StatusNotice`, `VerdictSummary`, `ScheduleTimeline`, `UnitTable`, `JudgementReasons`·`CriterionLine`, `AiSummary`, `CalendarButton`, 찾을 수 없음 화면, 열어 본 기록), 라우트 `src/app/notice/[id]/page.tsx` — US-13·14·15·16·17 (US-11 경로)
- [x] **Step 14. 관심 공고** `src/features/bookmarks/BookmarksView.tsx`(먼저 그리기 → 갱신, gone, [지우기], 빈 화면), `src/app/bookmarks/page.tsx` 교체(프로필 없으면 `/`) — US-17

## Part D. E2E·문서·검증

- [x] **Step 15. E2E** `e2e/helpers.ts`(로컬 전용 공고 넣기·지우기), `e2e/feed.spec.ts`: 프로필 저장 → 피드 카드(관심 지구·미충족 숨김·마감 제외·정렬·배지·D-day·NEW) → 상세(원문 링크 주소·타임라인·세대수·판정 이유·내 금액·AI 요약/준비 중) → NEW 사라짐; 별 저장 → 관심 공고 화면 → 지우기; 저장본 표시(오프라인); 캘린더 버튼(Android: Google 링크, iPhone: `/api/notices/[id]/calendar` 응답 확인); 없는 공고 화면; axe(피드·상세·관심 공고, 쉬운 모드 가로 스크롤 없음). U4 E2E의 피드 자리 테스트 수정
- [x] **Step 16. 문서**: README("화면과 API (U5)" 절), `aidlc-docs/construction/U5-feed-detail/code/code-summary.md`(파일·설계 대비 조정·검증)
- [x] **Step 17. 검증**: typecheck·lint·test(+PBT seed 반복)·build·deno check, 로컬 Supabase pgTAP·E2E(Android·iPhone), 커밋 (push는 사용자 확인 후)

## 스토리 추적

| 스토리 | Step |
|---|---|
| US-12 피드 | 1, 4, 5, 6, 7, 8, 9, 11, 12, 15 |
| US-13 상세 | 1, 5, 8, 9, 13, 15 |
| US-14 판정 이유 | 2, 6, 7, 13, 15 |
| US-15 AI 요약 | 5, 13, 15 |
| US-16 캘린더 | 3, 6, 7, 9, 13, 15 |
| US-17 관심 공고 | 4, 8, 9, 11, 14, 15 |
| US-11 (경로) | 13 |

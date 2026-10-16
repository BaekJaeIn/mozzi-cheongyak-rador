# U5 feed-detail — 화면 구성

> U1 뼈대(AppHeader·BottomNav·api-client·ErrorMessage, 크기 토큰)와 U4(ProfileProvider·HomeGate·한글 금액 표기·`clearAllPersonal`)를 그대로 쓴다. 문구·규칙은 business-rules.md, 형식은 domain-entities.md.
> 위치: 화면 `src/features/feed/`·`src/features/notice/`·`src/features/bookmarks/`, 순수 로직 각 폴더의 `model/`(React 없음, 단위·속성 테스트 대상), 서버 쪽 순수 로직(`buildFeed`·`pickSources`·`buildIcs`)은 `src/server/feed/`, 핸들러 `src/server/handlers/feed.ts`.

---

## 1. 화면(경로)

| 경로 | 화면 | 하단 메뉴 | 스토리 |
|---|---|---|---|
| `/` | 프로필 있음 → `FeedView` (U4 `HomeGate`의 `feed` 자리) | 보임 | US-12 |
| `/notice/[id]` | `NoticeDetailView` — 프로필이 없어도 열림 (BR-U5-74) | 보임 | US-13~17, US-11(알림 이동) |
| `/bookmarks` | `BookmarksView` (지금의 준비 중 화면을 바꿈) | 보임 | US-17 |

- `/bookmarks`는 U4 규칙대로 프로필이 없으면 `/`로 보낸다. `/notice/[id]`는 보내지 않는다.
- `/notice/[id]`에서 위쪽 [뒤로]: 앱 안에서 왔으면 이전 화면, 알림·외부에서 바로 왔으면 `/`.

## 2. 컴포넌트 구조

```text
HomeGate (U4) ── feed ──▶ FeedView
                          ├─ FeedStatusBar        ("새 공고를 확인하고 있어요" / 연결 안내 + [다시 시도] / outdated·no_profile 안내)
                          ├─ h1 "맞춤 공고" + "N건"
                          ├─ FeedEmpty            (BR-U5-61)
                          └─ ul > NoticeCard × N
                                 ├─ Link(카드 전체 → /notice/[id])
                                 │    지구 · 단지명 · 공급유형 · 접수 기간 · DdayBadge · NewBadge · VerdictBadge
                                 └─ BookmarkButton    (링크 밖, 별)

NoticeDetailView (/notice/[id])
├─ OriginalLinkButton      (큰 [원문 보기] + 다른 출처 작은 링크)
├─ StatusNotice            (마감 / 미충족 / 지구 밖)
├─ 제목 영역               (공고명 h1, 단지명, 기관, 분양·임대, 공급유형)
├─ VerdictSummary          (한 줄 요약 + VerdictBadge | 프로필 없음 안내)
├─ BookmarkButton
├─ ScheduleTimeline        (5단계 세로 + "오늘" 표시)
├─ UnitTable               (주택형 · 공급유형 · 면적 · 세대수 + 합계)
├─ JudgementReasons
│   ├─ JudgementGroupBlock × N (펼침)
│   │    └─ CriterionLine × N  (기호 · 조건 이름 · 사유 · 내 금액 · 행동 문구/링크)
│   ├─ details "신청이 어려운 유형 N개" > JudgementGroupBlock × N (접힘)
│   └─ 참고 문구 (BR-U5-92)
├─ AiSummary               (두 절 + AI 안내 | "요약을 준비 중이에요" + [원문 보기])
└─ CalendarButton          ([캘린더에 추가] | 비활성 안내 | 숨김)

BookmarksView (/bookmarks)
├─ h1 "관심 공고" + "N개"
├─ BookmarksEmpty
└─ ul > BookmarkItem × N   (Link 상세 | "더 이상 볼 수 없는 공고") · DdayBadge/"마감" · [지우기]

공용: DdayBadge, NewBadge, VerdictBadge, BookmarkButton, Toast(role="status")
```

## 3. 상태와 데이터 흐름

| 상태 | 위치 | 누가 바꾸나 |
|---|---|---|
| 피드 응답 | `FeedView` 안 `useReducer` (`cache` → `loading` → `fresh` / `error`) + `mz.feed` | GET /api/feed, U4 프로필 저장(지움) |
| 열어 본 공고 | `mz.seen` (작은 hook `useSeen`) | 상세를 그린 뒤 |
| 관심 공고 | `mz.bookmarks` ↔ `BookmarksProvider` (React context, 피드·상세·관심 공고 화면이 같은 상태를 봄) | BookmarkButton, BookmarksView, 모두 지우기 |
| 상세 응답 | `NoticeDetailView` 안 상태 (저장하지 않음) | GET /api/notices/[id] |
| 기기 프로필(내 금액) | U4 `ProfileProvider.stored` | 읽기만 |

- `BookmarksProvider`는 `ProfileProvider` 안에 둔다. 모두 지우기(U4) 뒤에는 빈 목록을 다시 읽는다.
- 다른 탭·창에서 바꾼 관심 공고는 `storage` 이벤트로 다시 읽는다.

## 4. 컴포넌트별 속성·동작

| 컴포넌트 | 속성 | 동작·접근성 |
|---|---|---|
| `NoticeCard` | `item: FeedItem`, `today`, `isNew` | `<li>` 안에 `<article>`. 링크 이름 = 단지명(또는 공고명). 배지는 글자로 읽힘 |
| `DdayBadge` | `applyStart`, `applyEnd`, `today` | `ddayLabel` 결과. 강조는 빨간 글자 + 굵게 (글자로도 구분) |
| `VerdictBadge` | `verdict` | "자격 충족" / "확인 필요" / "신청 어려움"(상세만) |
| `BookmarkButton` | `notice` 화면용 정보 | `aria-pressed`, 이름 "관심 공고 저장"/"관심 공고에서 빼기", 최소 터치 크기, 결과는 Toast |
| `OriginalLinkButton` | `sources` | `<a target="_blank" rel="noopener noreferrer">`, 주 버튼 크기. 주소 없으면 비활성 버튼 + 안내 |
| `ScheduleTimeline` | `schedule`, `today` | `<ol>`, 단계마다 "지남"/"오늘"/날짜 글자. "오늘" 표시는 `todayIndex` 위치 |
| `UnitTable` | `units` | `<table>` + `<caption>`, 열 머리 `scope="col"`. 좁은 화면에서 가로 스크롤 없이 줄마다 카드 모양으로 바뀜 |
| `JudgementReasons` | `judgement`, `notice.units`, 기기 프로필 | 미충족 묶음은 `<details>`/`<summary>` |
| `CriterionLine` | `criterion`, `userValueText` | 기호는 `aria-hidden`, 화면 낭독기용 "맞음/안 맞음/확인 필요" 글자 |
| `AiSummary` | `summary` | 글자로만 그림(문단 나눔) |
| `CalendarButton` | `noticeId`, `event` | `calendarTarget`에 따라 `/api/notices/[id]/calendar` 이동 또는 Google 링크 새 창 |
| `BookmarkItem` | `bookmark`, `today` | [지우기] 이름 "{단지명} 지우기" |

## 5. 사용하는 API

| 화면 | API | 비고 |
|---|---|---|
| `FeedView` | `GET /api/feed` | U1 api-client (인증·재등록·재시도) |
| `FeedView` (no_profile) | U4 `flushNow()` → `PUT /api/profile` | 1번만 |
| `NoticeDetailView` | `GET /api/notices/[id]` | 404는 오류가 아니라 "찾을 수 없어요" 화면 |
| `CalendarButton` (iPhone) | `GET /api/notices/[id]/calendar` | 인증 없음, 페이지 이동 |
| `BookmarksView` | `GET /api/notices?ids=` | 실패해도 저장된 정보로 보임 |

## 6. U4·U6 연결

| 대상 | 변경 |
|---|---|
| U4 `src/app/page.tsx` | `HomeGate feed={<FeedView />}` (지금의 준비 중 화면을 바꿈) |
| U4 `clearAllPersonal` | 지우는 키에 `mz.seen`, `mz.feed` 추가 |
| U4 프로필 저장 (`saveProfile`) | 성공·대기 모두 `mz.feed` 지움 (BR-U5-54) |
| U6 알림 클릭 | `/notice/[id]` 또는 `/` 로 이동 (계약 K8, 이 Unit은 경로만 제공) |

## 7. 접근성·고령자 UX (NFR-1)

- 글씨 크기 토큰(`text-body`/`title`/`heading`)과 쉬운 모드 배율을 그대로 따른다. 카드·버튼 터치 영역 `min-h-touch` 이상.
- 상태는 색에만 의존하지 않는다(배지 글자, D-day 글자, 타임라인 "지남/오늘").
- 안내(저장했어요, 지웠어요, 불러오는 중)는 `role="status"`로 읽힌다.
- 쉬운 모드·좁은 화면(360px)에서 가로 스크롤 없음. E2E에서 axe 위반 0을 확인한다.
- 화면마다 h1 하나: "맞춤 공고", 공고명, "관심 공고".

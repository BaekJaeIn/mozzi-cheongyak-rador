# U5 feed-detail — 업무 흐름

> 규칙 번호는 business-rules.md, 형식은 domain-entities.md.

---

## 1. 홈(`/`)에서 피드 보기

```text
HomeGate (U4): 기기에 프로필 있음 → FeedView
FeedView
  1. mz.feed 저장본이 있으면 redrawCachedFeed(저장본, 기기 오늘)로 바로 그림 + "새 공고를 확인하고 있어요"
     없으면 "공고를 불러오고 있어요…"
  2. GET /api/feed
     ├─ ready / outdated → 화면 교체, mz.feed 저장 (BR-U5-50)
     ├─ no_profile       → U4 flushNow() → 성공하면 GET /api/feed 한 번 더 (BR-U5-64)
     └─ 실패             → 저장본 유지 + "인터넷 연결을 확인해 주세요 …" + [다시 시도]
  3. 카드마다 NEW = isNew(firstSeenAt, 지금, mz.seen), D-day = ddayLabel(…, 오늘)
```

- 기기 프로필이 바뀌면(U4 저장) `mz.feed`를 지우고 피드를 다시 받는다(BR-U5-54).
- 하단 메뉴로 홈에 돌아오면 다시 받는다. 받는 중에도 지금 목록은 그대로 둔다.

## 2. 서버: `GET /api/feed`

```text
1. 기기 인증 (U1 route guard)
2. today = KST 오늘
3. 서버 프로필 읽기 (평문 부분과 profile_version만, 금액 복호화 안 함)
   └─ 없음 → { state: "no_profile", items: [] }
4. 판정 최신 여부 = (판정 개수, 판정 최소 profile_version)
   └─ 최신 아님 (BR-U5-04) → recomputeForDevice(기기, today) 1번
        └─ 실패 → 로그, state = "outdated"
5. 이 기기 판정 중 verdict ≠ ineligible AND in_district, 공고 마감일 ≥ today 또는 없음  (DB에서 1차로 거름)
   + 공고 정보 + 지구
6. buildFeed(행, today, 공급유형 이름, 관심 지구) — isVisible로 최종 확인, 카드 값, compareFeedItems 정렬
7. 200 { state, today, generatedAt, items }
```

- 다시 계산이 성공했지만 그 사이 프로필이 또 바뀌어 저장이 `stale`이면 `outdated`로 응답(다음 요청에서 다시).
- DB 왕복: 프로필 1 + 판정 상태 1 + 목록 1 (+ 다시 계산할 때 U2 재계산). 공급유형·지구 이름은 서버 캐시.

## 3. 공고 상세 (`/notice/[id]`)

```text
NoticeDetailView
  1. GET /api/notices/[id]
     ├─ 404 → "공고를 찾을 수 없어요" (+ 관심 공고에 있으면 [관심 공고에서 지우기])
     ├─ 실패 → 오류 안내 + [다시 시도]
     └─ 200 → 그리기, mz.seen에 기록 (BR-U5-41)
  2. 그리기 순서 (BR-U5-70)
     [원문 보기] → 상태 안내(마감·미충족·지구 밖) → 공고명 → 판정 요약 → 별
     → 타임라인 → 세대수 표 → 판정 이유(groupJudgement + 내 금액) → AI 요약 → [캘린더에 추가]
```

서버:

```text
1. 기기 인증
2. id가 UUID가 아니면 404 (DB 조회 안 함)
3. 공고 + 주택형 + 지구 + 출처 읽기 → 없으면 404
4. 이 기기의 판정 1행, 서버 프로필 있는지·버전
5. pickSources (http(s)만, 대표 정하기), 요약은 BR-U5-95 조건일 때만 넣음
6. 200 { today, profile, notice, judgement }
```

- 상세는 다시 계산하지 않는다(피드가 맡음). 판정이 오래됐으면 `outdated: true`로 알려 준다.

## 4. 판정 이유 보이기

```text
groupJudgement(judgement.units, notice.units)
  공급유형별로 모음 → 그 안에서 (판정, 조건 줄 목록)이 모두 같으면 한 그룹, 아니면 주택형마다 그룹
  → 정렬: 충족 → 확인 필요 → 미충족, 쉬운 말 이름 순
화면
  충족·확인 필요 그룹: 펼침
  미충족 그룹: "신청이 어려운 유형 N개" 아래 접음 (충족·확인 필요가 없으면 펼침)
  줄마다: 기호 + 조건 이름 + 사유 + withUserValue(조건, 기기 프로필) + (확인 필요면) 행동 문구
```

## 5. 캘린더에 추가

```text
calendarTarget(navigator.userAgent, navigator.maxTouchPoints)
  ├─ "ics"    → /api/notices/[id]/calendar 로 이동 (서버가 buildIcs)
  └─ "google" → googleCalendarUrl(event)를 새 창으로
시작·마감일 중 하나라도 없음 → 비활성 "일정이 정해지면 넣을 수 있어요"
마감 → 버튼 없음
```

## 6. 관심 공고

```text
별 버튼 (카드·상세)
  BookmarkStore.toggle(공고 화면용 정보)
    ├─ added   → "저장했어요"
    ├─ removed → "관심 공고에서 뺐어요"
    └─ full    → "관심 공고는 100개까지 …"
  저장 실패 → "이 휴대폰에 저장하지 못했어요"

관심 공고 화면 (/bookmarks)
  1. list() → sortBookmarks(오늘) 로 바로 그림
  2. 1개 이상이면 GET /api/notices?ids=…(최대 100)
     ├─ 성공 → refresh(items, missing) → 다시 그림 (missing은 "더 이상 볼 수 없는 공고")
     └─ 실패 → 그대로
  3. [지우기] → remove(id) → "지웠어요"
```

## 7. 알림에서 들어오기 (U6 연결, US-11, 계약 K8)

- 새 공고 1건 → `/notice/[id]`: 상세가 열리고 맨 위 [원문 보기]까지 1탭 → **알림 → 원문 2탭**.
- 2건 이상 → `/`: 피드가 열리고 새 공고에 NEW(아직 열어 보지 않았으므로).
- 프로필이 없는 기기로 상세 링크가 열려도 공고는 보인다(BR-U5-74).

## 8. 예시

어머니 기기, 오늘 2026-10-20(화), 관심 지구 하남 교산, 월소득 450만원(기기에만):

| 공고 | 일정 | 판정 | 피드 | 카드 D-day |
|---|---|---|---|---|
| 교산 A2 고령자 전세 | 10-20 ~ 10-23 | 충족 | 1번째 (접수 중) | 마감까지 D-3 (빨간색) |
| 교산 신혼희망타운 | 10-27 ~ 10-29 | 확인 필요 | 2번째 (접수 예정) | 접수까지 D-7 |
| 왕숙 공공분양 | 10-21 ~ 10-24 | 충족 | 안 나옴 (관심 지구 밖) | – |
| 교산 청년 매입임대 | 10-15 ~ 10-17 | 미충족 | 안 나옴 (미충족·마감) | – |

교산 A2 상세의 소득 줄: "✔ 소득: 2인 가구 기준 월 645만 2,897원 이하 → 입력하신 금액 월 450만원".

## 9. 성능 (NFR-4.1: 4G에서 피드 3초 이내)

| 수단 | 효과 |
|---|---|
| 저장본 먼저 그리기 (BR-U5-50) | 두 번째부터는 앱을 열자마자 목록이 보임 |
| 피드 API는 DB 왕복 3번, 판정은 미리 계산된 것 | 서버 처리 목표 500ms 이내(재계산 없을 때) |
| 응답에 카드에 필요한 값만 (요약·사유·주택형 제외) | 응답 크기 작음 (공고 50건 기준 수십 KB 이내) |
| 공급유형·지구 이름 서버 캐시 | 조회 줄임 |

E2E에서 첫 피드 표시 시간을 측정해 기록한다(4G 흉내 조건은 Code Generation에서 정함).

## 10. 테스트 방향

- **순수 함수 + 속성 기반 테스트**: domain-entities §7의 P-U5-1~13.
- **예시 테스트**: D-day 표 각 줄, 타임라인 오늘 위치, 판정 묶기(같음·다름), 내 금액 붙이기, .ics 내용, API 핸들러(인증·404·400·다시 계산·no_profile).
- **E2E (로컬 Supabase)**: 공고·판정을 넣어 두고 피드 카드 → 상세 → 원문 링크, 별 저장 → 관심 공고 화면 → 지우기, 저장본 표시(오프라인), 접근성 axe.

---

## 11. 변경 요청 2 (2026-10-19)

> 규칙 business-rules §16, 형식 domain-entities §8.

```text
GET /api/feed (서버)
  공고 읽기에 regions_ai·regions 추가 → FeedRow.notice.regions
  서버 프로필 평문 prefs에서 관심 지구 + 관심 지역 읽기 (금액 복호화 없음)
  FeedItem.districts = orderDistricts(지구, 관심 지구)        (그대로)
  FeedItem.regions   = orderRegions(공고 지역, 관심 지역)       BR-U5-C2

GET /api/notices/{id}, POST /api/notices/summaries (서버)
  notice.regions = 공고 지역 (순서는 기기에서)

기기
  카드:  placeLabel(지구 이름, 지역)                            BR-U5-C1~C3
  상세:  위치 줄 = 지역 전체 이름(orderRegions with 기기 관심 지역)
         placeNeedsCheck → "정확한 위치는 공고문에서 확인해 주세요"   BR-U5-C4
         상태 안내 "관심 지역 밖의 공고예요" + [관심 지역 고치기]     BR-U5-C6
         요약 자리 = summaryView(summary, judgement)                 BR-U5-C7
```

### 11.1 예시

| 공고 | 지구 | 지역 | 카드 위치 | 상세 |
|---|---|---|---|---|
| 하남 교산 A2 (LH) | 교산 | 경기 하남시 | 하남 교산 | 하남 교산 |
| 강서구 행복주택 (SH) | 없음 | 서울 강서구 | 서울 강서구 | 서울 강서구 |
| 고덕강일 3단지 (SH, AI 전) | 없음 | 서울 | 서울 | 서울 + "정확한 위치는 공고문에서 확인해 주세요" |
| 통합 공고 (청약홈) | 없음 | 서울 마포구, 경기 고양시, 서울 강서구 | (강서구 관심) 서울 강서구, 서울 마포구 외 1 | 서울 강서구, 서울 마포구, 경기 고양시 |

### 11.2 테스트 방향

- 순수 함수 예시 + P-U5-C1~C3 (`_shared/feed/__tests__`)
- 피드·상세·요약 목록 API 응답에 `regions` (기존 handler 테스트 + 저장소 매핑)
- E2E: 로컬 DB에 지구 없는 서울 강서구 공고를 넣고 관심 지역을 강서구로 고른 프로필 → 피드 카드 "서울 강서구", 상세 위치 줄. 관심 지역 밖 공고 상세 → 요약 자리 문구

---

## 12. 변경 요청 4 (2026-10-25) — 뒤로 버튼

```text
앱 열기 ─ start → (지원하면) CloseWatcher 켬, 지킴이 없음
첫 터치 ─ gesture → 지킴이 넣음 (조작 중이라 건너뛰어지지 않음)
상세에서 뒤로 ─ CloseWatcher 또는 지킴이가 받음 → 들어온 목록으로 replace → (받은 쪽 다시 준비: 감시는 바로, 지킴이는 다음 터치)
맞춤 공고에서 뒤로 ─ 받음 → "종료하시려면 뒤로가기 버튼을 한번 더 클릭해주세요." 3초
                     감시 끔 + 남은 지킴이 조용히 뺌 → 3초 안에 다시 뒤로 = 브라우저가 앱을 닫음
3초 지남 ─ 감시 다시 켬, 지킴이는 다음 터치 때
```

### 12.1 시나리오 (예시 테스트로 고정, PBT-10)

| # | 브라우저 | 순서 | 기대 |
|---|---|---|---|
| S1 | CloseWatcher 있음 | 열기 → 카드 터치 → 상세 → 뒤로 | 맞춤 공고 |
| S2 | CloseWatcher 없음 | 열기 → 카드 터치 → 상세 → 뒤로(방문 기록) | 맞춤 공고 (지킴이는 터치 때 넣음) |
| S3 | 둘 다 | 맞춤 공고 → 뒤로 → 안내 → 3초 안에 뒤로 | 받는 것이 없음 → 종료 |
| S4 | 둘 다 | 맞춤 공고 → 뒤로 → 안내 → 3초 지남 → 터치 → 뒤로 | 다시 안내 |
| S5 | CloseWatcher 있음 | 알림으로 상세를 바로 열기(조작 없음) → 뒤로 | 맞춤 공고 |
| S6 | 둘 다 | 설정에서 창 열기 → 뒤로 | 창만 닫힘 |

### 12.2 테스트 가능한 속성 (PBT-01)

| # | 속성 | 종류 |
|---|---|---|
| P-U5-E1 | 지킴이는 늘 많아야 한 칸이고, pushGuard는 gesture 사건이거나 조작한 적이 있을 때(sticky)만 나온다 | Invariant |
| P-U5-E2 | 종료 안내 직후(3초 안) 상태는 받는 것이 없다: watcher=false, guard=false — 다음 뒤로는 앱을 닫는다 | Invariant |
| P-U5-E3 | 안내 중이 아니면, 갈 곳이 있는 뒤로 사건은 항상 navigate(그 주소) 하나를 낸다 — 어느 길(watcher·history)로 와도 같다 | Invariant (모델 비교) |
| P-U5-E4 | 아무 사건 순서 뒤에도 exitTimeout + gesture를 지나면 다시 받을 준비가 된다(지원 시 watcher, 지킴이 한 칸) | Liveness (유한 순서) |

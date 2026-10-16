# U5 feed-detail — 도메인 엔티티

> 규칙 번호는 business-rules.md. DB 테이블은 새로 만들지 않는다(U1 0002·U3 0007 그대로). 날짜는 `IsoDate`("YYYY-MM-DD", KST), 시각은 ISO 문자열.

---

## 1. 읽는 데이터 (기존)

| 출처 | 쓰는 값 |
|---|---|
| `judgements` (기기별) | `notice_id`, `verdict`, `in_district`, `score`, `detail = { baseDate, units: UnitJudgement[] }`, `profile_version` |
| `device_profiles` | 있는지, `profile_version` (BR-U5-04) |
| `notices` | 공고명·단지명·위치·기관·분양/임대·일정 6개·요약·요약 상태·`first_seen_at`·`primary_source` |
| `notice_districts` + `districts` | 지구 ID·이름·정렬 순서 |
| `housing_units` | 주택형 ID·이름·공급유형·전용면적·세대수 |
| `source_notices` | 출처·원문 주소·`last_seen_at` |
| `supply_type_standards` | 공급유형 코드 → 공식 이름·쉬운 말 (서버 메모리 캐시, U1 cache) |

`UnitJudgement`(U2): `{ unitId, supplyType, verdict, criteria: CriterionResult[] }`, `CriterionResult = { key, verdict, code, reason, action?, userValue? }`.

## 2. 피드 API 응답 `FeedResponse`

```ts
type FeedState = "ready" | "outdated" | "no_profile";

interface FeedResponse {
  state: FeedState;
  today: IsoDate;          // 서버가 계산한 KST 오늘
  generatedAt: string;     // ISO 시각
  items: FeedItem[];       // 정렬 끝난 순서 (BR-U5-10)
}

interface FeedItem {
  id: string;
  title: string;
  complexName: string | null;
  districts: { id: string; name: string }[];   // 관심 지구 먼저 (BR-U5-25 — 순서는 서버가 정함)
  tenure: "sale" | "rent";
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  status: "open" | "upcoming";                 // 응답 시점 상태
  verdict: "eligible" | "unknown";
  score: number;
  supplyTypes: { code: string; plain: string }[];  // 충족·확인 필요 주택형의 유형, 중복 없음 (BR-U5-22)
  firstSeenAt: string;
}
```

- 서버의 순수 함수 `buildFeed(rows, today, labels, interestDistrictIds) → FeedItem[]`가 노출(`isVisible`)·카드 값·정렬을 맡는다. DB 조회와 분리해 테스트한다.
- `interestDistrictIds`는 서버 프로필의 `prefs.districtIds`(평문 부분, 금액 아님).

## 3. 상세 API 응답 `NoticeDetailResponse`

```ts
interface NoticeDetailResponse {
  today: IsoDate;
  profile: "present" | "none";
  notice: NoticeDetail;
  judgement: JudgementView | null;   // 프로필 없음·판정 없음이면 null
}

interface NoticeDetail {
  id: string;
  title: string;
  complexName: string | null;
  location: string | null;
  provider: string;
  tenure: "sale" | "rent";
  schedule: {
    announcedAt: IsoDate | null; applyStart: IsoDate | null; applyEnd: IsoDate | null;
    resultAt: IsoDate | null; contractStart: IsoDate | null; contractEnd: IsoDate | null;
  };
  status: "upcoming" | "open" | "closed";
  districts: { id: string; name: string }[];
  units: { id: string; label: string | null; supplyType: string; plain: string; formal: string;
           exclusiveAreaM2: number | null; supplyCount: number | null }[];
  summary: { eligibilityPlain: string; forSeniorCouple: string } | null;  // BR-U5-95 조건을 만족할 때만
  sources: { source: SourceCode; label: string; url: string; primary: boolean }[];  // http(s)만, 대표 1개 (BR-U5-100~102)
  firstSeenAt: string;
}

interface JudgementView {
  verdict: "eligible" | "ineligible" | "unknown";
  inDistrict: boolean;
  visible: boolean;          // isVisible 결과 (피드에 나오는지)
  outdated: boolean;         // 판정 profile_version < 현재 프로필 버전
  baseDate: IsoDate;
  units: UnitJudgement[];    // U2 형식 그대로 (사유·행동 문구 포함, 내 금액 없음)
}
```

## 4. 관심 공고 요약 API 응답 `NoticeSummariesResponse`

```ts
interface NoticeSummary {
  id: string; title: string; complexName: string | null;
  districts: string[];                 // 이름
  applyStart: IsoDate | null; applyEnd: IsoDate | null;
  status: "upcoming" | "open" | "closed";
  supplyTypes: string[];               // 공고 전체 유형의 쉬운 말, 최대 3개
}
interface NoticeSummariesResponse { today: IsoDate; items: NoticeSummary[]; missing: string[] }
```

## 5. 화면에서 만드는 값 (순수 함수)

| 이름 | 입력 → 출력 | 규칙 |
|---|---|---|
| `ddayLabel` | `(applyStart, applyEnd, today)` → `{ text, urgent }` | BR-U5-30~37 |
| `isNew` | `(firstSeenAt, now, seen)` → boolean | BR-U5-40 |
| `periodLabel` | `(applyStart, applyEnd, today)` → "10월 20일(월) ~ 10월 23일(목)" | BR-U5-23 |
| `timeline` | `(schedule, today)` → `{ steps: { key, label, date, state: "past"|"today"|"future"|"unknown" }[], todayIndex }` | BR-U5-75~77 (`todayIndex` = "오늘" 표시를 넣을 위치 0~5) |
| `areaLabel` | `(m2)` → "전용 59㎡ (약 18평)" | BR-U5-79 |
| `unitRows` | `(units)` → 정렬된 줄 + 합계 문구 | BR-U5-80·81 |
| `groupJudgement` | `(units: UnitJudgement[], unitInfo)` → `JudgementGroup[]` | BR-U5-86·87 |
| `withUserValue` | `(criterion, localProfile)` → 줄 끝 문구 \| null | BR-U5-90 |
| `pickSources` | 출처 목록 → 대표·나머지 | BR-U5-100~102 (서버에서 사용) |
| `buildIcs` | `(event)` → 문자열 | BR-U5-107·108 |
| `googleCalendarUrl` | `(event)` → URL | BR-U5-109 |
| `calendarTarget` | `(userAgent, maxTouchPoints)` → "ics" \| "google" | BR-U5-106 |
| `redrawCachedFeed` | `(cache, today)` → `FeedItem[]` | BR-U5-52 (마감 빼기, 순서 유지) |

```ts
interface JudgementGroup {
  supplyType: string; plain: string; formal: string;
  verdict: Verdict;
  areas: (number | null)[];          // 묶인 주택형들의 면적 (작은 순)
  unitLabels: (string | null)[];
  criteria: CriterionResult[];
}
// 화면: verdict가 ineligible인 그룹은 접힌 영역으로 (BR-U5-87)

interface CalendarEvent {
  noticeId: string; title: string;      // "[청약 접수] …"
  start: IsoDate; end: IsoDate;         // 포함 범위
  description: string; url: string | null;
}
```

## 6. 기기 저장 형식 (localStorage)

| 키 | 형식 | 지우는 때 |
|---|---|---|
| `mz.bookmarks` | `{ version: 1, items: Bookmark[] }` | 모두 지우기 (U4에 이미 포함) |
| `mz.seen` | `{ version: 1, items: { [noticeId]: 열어 본 ISO 시각 } }` | 모두 지우기, 14일 지난 항목·500개 초과분 (BR-U5-42) |
| `mz.feed` | `{ version: 1, savedAt: string, response: FeedResponse }` | 모두 지우기, 내 정보 저장 시 (BR-U5-53·54) |

```ts
interface Bookmark {
  id: string;
  savedAt: string;
  snapshot: {
    title: string; complexName: string | null; districts: string[];
    applyStart: IsoDate | null; applyEnd: IsoDate | null;
    supplyTypes: string[];          // 최대 3
  };
  gone?: true;                      // 서버에서 지워짐 (BR-U5-120)
}
```

- U4 `clearAllPersonal`의 지우는 키 목록에 `mz.seen`, `mz.feed`를 더한다(`mz.display`만 남기는 규칙 유지).
- 관심 공고 저장소 `BookmarkStore`: `list()`, `has(id)`, `toggle(item) → "added" | "removed" | "full"`, `remove(id)`, `refresh(summaries, missing)`. 모든 쓰기는 읽기 → 바꾸기 → 저장 순서이고, 읽을 때 깨진 항목은 버린다(BR-U5-124).

## 7. 속성 기반 테스트 대상 (PBT-01 식별)

| ID | 속성 | 대상 | 종류 |
|---|---|---|---|
| P-U5-1 | `buildFeed` 결과의 모든 항목은 `isVisible`이 참이고, `isVisible`이 참인 판정은 **모두** 결과에 있다(빠짐·중복 없음) | `buildFeed` | 불변식 |
| P-U5-2 | `buildFeed` 결과는 `compareFeedItems`로 정렬돼 있고, 입력 행 순서를 섞어도 결과가 같다 | `buildFeed` | 불변식·순서 무관 |
| P-U5-3 | 카드 공급유형은 충족·확인 필요 주택형의 유형 집합과 같고 중복이 없다 | `buildFeed` | 불변식 |
| P-U5-4 | `ddayLabel`: 표시 숫자는 항상 1 이상, 상태가 같은 동안 오늘이 하루 늘면 숫자가 1 줄거나 "오늘 …"로 바뀐다, closed면 "접수 마감" | `ddayLabel` | 불변식·단조 |
| P-U5-5 | `timeline`: `todayIndex` 앞의 날짜 있는 단계는 모두 오늘 이하, 뒤는 모두 오늘 초과(날짜가 순서대로일 때). 단계는 항상 5개, 순서 고정 | `timeline` | 불변식 |
| P-U5-6 | `groupJudgement`: 모든 주택형이 정확히 한 그룹에 들어가고, 한 그룹의 주택형은 공급유형·판정·조건 줄이 모두 같다. 판정 순서는 충족 → 확인 필요 → 미충족 | `groupJudgement` | 분할 불변식 |
| P-U5-7 | `areaLabel`의 평 값은 면적에 대해 단조 증가(같거나 큼) | `areaLabel` | 단조 |
| P-U5-8 | .ics 글자 이스케이프 왕복(`unescape(escape(s)) = s`), 모든 줄 ≤ 75바이트, 접힌 줄을 펴면 원래 줄, `DTEND` = 마감일 + 1일 | `buildIcs` | 왕복·불변식 |
| P-U5-9 | Google 링크를 다시 읽으면 제목·메모·날짜가 같다 | `googleCalendarUrl` | 왕복 |
| P-U5-10 | 관심 공고 저장소: 임의의 `toggle`·`remove`·`refresh` 순서 뒤 ID는 유일, 개수 ≤ 100, 같은 항목 `toggle` 두 번 = 원래 상태, 저장 → 읽기 왕복 | `BookmarkStore` (메모리 저장소) | 상태 기반·왕복 |
| P-U5-11 | 관심 공고 정렬은 입력 순서와 무관하고, 마감 안 됨 → 마감 → 볼 수 없음 순서를 지킨다 | `sortBookmarks` | 불변식 |
| P-U5-12 | 저장본 다시 그리기: 결과는 저장본의 부분열(순서 유지)이고 마감된 항목이 없으며, 오늘이 늦어질수록 결과는 줄기만 한다 | `redrawCachedFeed` | 부분열·단조 |
| P-U5-13 | 열어 본 기록: `markSeen` 뒤 그 공고는 `isNew` 거짓, 정리 뒤 개수 ≤ 500, 14일 지난 항목 없음 | `seen` 저장소 | 불변식 |

예시 기반 테스트(PBT-10): 실제 U3 공고 묶음 픽스처로 피드 항목·상세 응답 모양, D-day 표의 각 줄, 2026-10-20(월)~23(목) 같은 고정 날짜.

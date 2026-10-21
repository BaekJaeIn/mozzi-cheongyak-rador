# U6 pwa-push — 도메인 엔티티

> 규칙 번호는 business-rules.md. 날짜는 `IsoDate`(KST), 시각은 ISO 문자열.

---

## 1. 저장 데이터 (DB)

기존(U1) 테이블에 U6에 필요한 칸을 더한다. 마이그레이션 `0008_push.sql`(Code Generation).

| 테이블 | 칸 | 상태 | 용도 |
|---|---|---|---|
| `push_subscriptions` | `endpoint`(기본키), `device_id`, `p256dh`, `auth`, `created_at`, `last_success_at` | 있음 | 구독 (기기당 여러 개, 최대 5 — BR-U6-54) |
| `notification_log` | `device_id`, `notice_id`(함께 기본키), `notified_at` | 있음 | 알린 공고 — 같은 공고 두 번 없음 (BR-U6-24) |
| `notification_log` | **`kind`** `'sent' \| 'baseline'` (기본 `'sent'`) | 추가 | 기준선 구분 (BR-U6-12) |
| `devices` | **`last_push_on`** date null | 추가 | 하루 1번 (BR-U6-20·21) |
| `devices` | **`push_baseline_at`** timestamptz null | 추가 | 첫 구독 기준선을 넣었는지 (BR-U6-11) |
| `push_test_log` | **`device_id`, `sent_at`** | 새 테이블 | 시험 알림 한도 (BR-U6-66). 하루 지난 행은 정리 cron(U1 0005)에서 지움 |

- RLS·권한: U1과 같이 anon 전면 차단, 서버 키로만 접근. 발송에 쓰는 DB 함수(몫 잡기 등)는 service_role만 실행.
- 기기를 지우면(모두 지우기·180일 정리) 구독·알림 기록·시험 기록이 함께 지워진다(외래 키 cascade).

## 2. 발송 계획 (C14)

```ts
interface DispatchCandidate {          // 대상 기기 1대 (BR-U6-02)
  deviceId: string;
  lastPushOn: IsoDate | null;
  subscriptions: PushTarget[];
}

interface PushTarget { endpoint: string; p256dh: string; auth: string }

interface DispatchItem {               // 실제로 보낼 것
  deviceId: string;
  notices: { id: string; name: string; verdict: "eligible" | "unknown" }[];   // 피드 정렬 순서
  counts: { eligible: number; unknown: number };
}
```

순수 함수 `planDevice(judgementRows, notifiedIds, today) → DispatchItem | null`: U5 `buildFeed`와 같은 노출·정렬을 쓰고, 알림 기록이 있는 공고를 뺀다. 0건이면 `null`(BR-U6-05).

## 3. 알림 내용 (C15)

```ts
interface PushPayload {
  title: "모찌네 청약 알리미";
  body: string;            // BR-U6-31·32
  url: string;             // "/notice/{id}" | "/" | "/settings"(시험)
  tag: string;             // "daily-YYYY-MM-DD" | "test"
}
```

`buildPayload(item, today) → PushPayload`. JSON으로 2KB 이하(BR-U6-36). 공고 이름·건수만 담는다(BR-U6-35).

## 4. 발송 결과 (C15·C16)

```ts
type SendOutcome =
  | { kind: "sent" }
  | { kind: "gone" }                       // 404·410 → 구독 삭제
  | { kind: "retryable"; status: number | null }   // 5xx·429·네트워크 → 1번 더
  | { kind: "rejected"; status: number };  // 400·401·403·413 등 → 재시도 없음

type DeviceResult = "sent" | "failed" | "skipped_empty" | "skipped_claimed";
```

`settleDevice(outcomes) → { delivered: boolean; removeEndpoints: string[]; successEndpoints: string[] }`: 하나라도 `sent`면 delivered(BR-U6-40), `gone`은 지울 목록(BR-U6-41).

몫 잡기(BR-U6-21·22): DB 함수 `claim_daily_push(device, today) → previous | null`(이미 오늘이면 null), `release_daily_push(device, previous)`.

## 5. 구독 형식 검사

```ts
interface SubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }
```

`validateSubscription(body) → { ok: true; value } | { ok: false; field }`: https, 허용 호스트(BR-U6-51), 길이, 키 바이트 수(BR-U6-52), 다른 키 없음(BR-U6-50).

## 6. 화면 쪽 상태 (기기)

| 이름 | 위치 | 내용 |
|---|---|---|
| 설치 상태 | 브라우저에서 계산 | `{ installed: boolean; platform: "ios_safari" \| "ios_other" \| "android" \| "other"; canPrompt: boolean }` |
| 설치 안내 띠 닫기 | `mz.installHint` = `{ version: 1, dismissedAt }` | 7일 (BR-U6-72), 모두 지우기에서 남김 (BR-U6-76) |
| 알림 권한 | `Notification.permission` | `"default" \| "granted" \| "denied"` |
| `PushSubscribeResult` (U4 확장) | | `"subscribed" \| "denied" \| "unsupported" \| "needs_install" \| "error"` |

순수 함수: `installPlatform(userAgent, maxTouchPoints)`, `shouldShowInstallHint(installed, dismissedAt, now)`, `deniedHelp(platform, installed)`, `safeClickUrl(url, origin)`.

## 7. 속성 기반 테스트 대상 (PBT-01 식별)

| ID | 속성 | 대상 | 종류 |
|---|---|---|---|
| P-U6-1 | 알릴 공고 = (U5 `buildFeed` 결과) − (알림 기록). 피드에 없는 공고는 절대 알리지 않고, 기록이 없는 피드 공고는 모두 들어간다 | `planDevice` | 불변식(피드 일치) |
| P-U6-2 | 임의의 실행 순서(같은 시각 재실행·시각 변경·실패 섞임)에서 한 기기 × 한 공고는 **최대 1번** 보내지고(`sent` 기록 유일), 한 기기는 한국 날짜당 **최대 1번** 받는다 | 발송 시뮬레이터(메모리 DB + 가짜 발송) | 상태 기반·멱등 |
| P-U6-3 | 모든 구독이 실패한 실행 뒤에는 알림 기록과 `last_push_on`이 실행 전과 같다(되돌림) | 발송 시뮬레이터 | 불변식 |
| P-U6-4 | 알림 내용: 건수 합 = 공고 수, 1건이면 주소가 `/notice/{그 ID}`, 2건 이상이면 `/`, 본문은 비어 있지 않고 2KB 이하, 공고 이름 말고는 입력 문자열이 들어가지 않는다 | `buildPayload` | 불변식 |
| P-U6-5 | 발송 결과 정리: `gone`인 구독만 지울 목록에 들어가고, `sent`가 하나라도 있을 때만 delivered | `settleDevice` | 불변식 |
| P-U6-6 | 구독 검사: 받아들인 입력은 https·허용 호스트·키 길이를 만족하고, 받아들인 값을 다시 검사해도 통과(멱등) | `validateSubscription` | 불변식·멱등 |
| P-U6-7 | 기준선: 첫 구독 뒤 바로 계획하면 0건, 이후 새로 보이는 공고만 들어감. 다시 구독해도 기준선이 늘지 않는다 | 발송 시뮬레이터 | 상태 기반 |
| P-U6-8 | 시험 알림 한도: 임의의 시각 순서에서 어느 1시간 구간에도 4번 이상 보내지지 않는다 | `canSendTest` | 불변식 |
| P-U6-9 | 설치 안내 띠: 설치됨이면 항상 숨김, 닫은 지 7일 미만이면 숨김, 시간이 지날수록 숨김 → 보임으로만 바뀐다 | `shouldShowInstallHint` | 불변식·단조 |
| P-U6-10 | 클릭 주소: 결과는 항상 `/`로 시작하는 같은 사이트 경로(`//`·스킴·다른 호스트는 `/`로) | `safeClickUrl` | 불변식 |

예시 기반 테스트(PBT-10): 고정 날짜 2026-10-20, 3기기(9시·9시 이미 보냄·10시), 공고 4건(충족·확인 필요·미충족·마감)으로 문구·대상·기록.


---

## 8. 변경 요청 3 (2026-10-20) — 마감 임박 알림

> 계획: `plans/U6-pwa-push-change-3-functional-design-plan.md` (Q1~Q4 = A). 마이그레이션 `0014_bookmark_deadline.sql`(Code Generation).

### 8.1 저장 데이터

| 테이블 | 칸 | 상태 | 용도 |
|---|---|---|---|
| `device_bookmarks` | `device_id`(→ devices, cascade), `notice_id`(→ notices, cascade), `created_at` — 함께 기본키 | 새 테이블 | 관심 공고 ID (FR-C3-15). 기기당 최대 100(U5 `MAX_BOOKMARKS`) |
| `devices` | **`deadline_enabled`** boolean not null default true | 추가 | 마감 알림 스위치 (Q4=A) |
| `deadline_notification_log` | `device_id`, `notice_id`(함께 기본키, cascade), `notified_at` | 새 테이블 | 마감 알림을 공고마다 한 번 (BR-U6-D22). **코드 생성에서 바꿈(2026-10-20)**: 처음에는 `notification_log` 기본키에 `kind`를 넣으려 했으나, 기존 새 공고 기록·기준선 규칙(0008의 `on conflict (device_id, notice_id)`)을 건드리지 않으려고 따로 둔다 |

- RLS: `device_bookmarks`도 anon·authenticated 전면 차단, 서버 키(기기 인증 API·dispatch)로만 (NFR-C3-5). 다른 기기 것은 API가 기기 ID로만 거르므로 읽을 수 없다
- 새 공고 "이미 알린 공고"(`notified`)는 지금처럼 `notification_log`만 본다 — 마감 기록은 다른 표라 새 공고 알림을 막지 않는다
- 공고가 지워지면(보관 기간 정리) 관심 공고 행도 함께 지워진다

### 8.2 발송 계획

```ts
interface DeviceRows {
  // …기존 그대로
  /** 마감 임박 관심 공고 (마감 = 내일, 마감 알림 기록 없음, 스위치 켜짐) — DB가 고른다 */
  deadlines: { id: string; name: string }[];
}

interface DispatchItem {
  deviceId: string;
  notices: PlannedNotice[];                 // 새 공고 (지금과 같음, 비어도 됨)
  counts: { eligible: number; unknown: number };
  deadlines: { id: string; name: string }[]; // 마감 임박 (변경 3)
}
```

- `planDevice(deviceId, rows, notified, today, deadlines = [])`: 새 공고와 마감 임박이 **둘 다 0건이면** `null`(BR-U6-05 그대로)
- 마감 임박 고르기 `deadlineNotices(bookmarks, today)`(순수 함수, DB 함수와 같은 규칙 — 테스트 비교용): `applyEnd = today + 1`, 이름은 단지명 없으면 공고명, 이름 순 → ID 순

### 8.3 알림 내용

| 경우 | 본문 | 누르면 |
|---|---|---|
| 새 공고만 | 지금과 같음 (BR-U6-31·32) | 지금과 같음 |
| 마감만 1건 | "관심 공고 {이름} 접수 마감이 내일이에요" | `/notice/{id}` |
| 마감만 2건 이상 | "관심 공고 {N}건 접수 마감이 내일이에요" | `/bookmarks` |
| 둘 다 | 새 공고 문구 + 줄바꿈 + "관심 공고 {이름} 마감이 내일이에요" / "관심 공고 {N}건 마감이 내일이에요" | 새 공고 규칙 그대로 |

이름은 BR-U6-32처럼 24글자 줄임. 태그는 그대로 `daily-{오늘}`.

### 8.4 API

| API | 형식 |
|---|---|
| `PUT /api/bookmarks` (새) | 기기 인증. 본문 `{ ids: string[] }`(uuid, 중복 없음, 최대 100). 서버 목록을 이 값으로 **통째로 바꾼다**. 없는 공고 ID는 조용히 뺀다. 200 `{ saved: number }` |
| `PUT /api/notify-settings` | 본문에 `deadlineEnabled?: boolean` 추가 (없으면 그대로) |

### 8.5 기기 쪽 상태

```ts
interface StoredBookmarkSync { version: 1; state: "synced" | "pending"; since?: string }  // mz.bookmarks.sync
interface StoredNotify { /* 기존 */ deadlineEnabled?: boolean }                          // 없으면 true
```

- 별표·해제 → 기기 저장(`mz.bookmarks`) → `pending` → `PUT /api/bookmarks` → 성공하면 `synced`. 실패하면 `pending`으로 남고 앱을 열 때 다시 보낸다
- 처음(업데이트 뒤) 앱을 열 때 `mz.bookmarks.sync`가 없으면 `pending`으로 보고 한 번 보낸다 — 기존 별표가 서버로 간다
- 모두 지우기: `mz.bookmarks.sync`도 지운다(서버 쪽은 기기 삭제로 cascade)

### 8.6 속성 기반 테스트 대상 추가 (PBT-01)

| # | 속성 | 대상 | 종류 |
|---|---|---|---|
| P-U6-D1 | **기존 알림 불변**: 마감 임박이 없으면 `planDevice`·`buildPayload` 결과가 변경 3 전과 같다 | 계획·문구 | 불변식 (NFR-C3-1) |
| P-U6-D2 | 마감 임박 대상 = 관심 공고 ∩ 마감 내일 − 마감 알림 기록 (스위치 꺼지면 빈 목록) | `deadlineNotices` | 불변식 |
| P-U6-D3 | 하루 1번 그대로: 같은 날 몇 번 실행해도 기기당 알림 1번, 같은 공고 마감 알림 1번 | dispatch 시뮬레이션 | 멱등 |
| P-U6-D4 | 알림 내용은 2KB 이하, 공고 이름·건수만(마감 임박 포함) | `buildPayload` | 불변식 |
| P-U6-D5 | 관심 공고 동기화: 어떤 별표·해제 순서와 실패 뒤에도, 마지막 성공 보내기 뒤 서버 목록 = 기기 목록 | 동기화 | 수렴 |

# U6 pwa-push — 업무 흐름

> 규칙 번호는 business-rules.md, 형식은 domain-entities.md.

---

## 1. 매시 발송 (`dispatch`, S5)

```text
pg_cron 매시 정각 → dispatch (비밀 헤더 확인)
1. H = 지금 한국 시각의 시, today = 한국 날짜
2. 대상 기기 = notify_enabled AND notify_hour = H AND 구독 있음 AND last_push_on ≠ today   (BR-U6-02)
3. 기기마다 (서로 격리, BR-U6-44)
   a. 판정이 오래됐으면 다시 계산 (U5 BR-U5-04와 같은 기준, BR-U6-04)
   b. planDevice: 피드와 같은 노출(isVisible, today) − 알림 기록           (BR-U6-03)
      └─ 0건 → 건너뜀 (오늘 몫을 잡지 않음)                              (BR-U6-05)
   c. claim_daily_push(device, today)
      └─ 이미 오늘 → 건너뜀 (다른 실행이 보냄)                           (BR-U6-21)
   d. buildPayload → 모든 구독에 보내기 (실패는 1번 더)                  (BR-U6-40~43)
   e. settleDevice
      ├─ delivered → 알림 기록(kind=sent) 넣기, last_success_at 갱신
      └─ 아님      → release_daily_push(이전 값)                         (BR-U6-22)
      gone 구독은 지움                                                   (BR-U6-41)
4. 결과 { hour, devices, sent, skipped, failed, removedSubscriptions, recomputed } 로그·응답
```

- **멱등성**: 같은 시각에 두 번 실행돼도 c에서 하나만 몫을 잡는다. 알림 기록은 기기 × 공고 기본키라 두 번 들어가지 않는다(NFR-3.2).
- **피드와 일치**: b는 U5 `buildFeed`와 같은 함수(공용 `_shared`)를 써서 "알림 3건 / 피드 2건" 같은 불일치가 없다.
- **시간 제한**: 기기당 처리가 짧지만(구독 1~2개), 남은 시간이 부족하면 나머지 기기는 몫을 잡지 않고 건너뛴다(BR-U6-45).

### 1.1 예시 (2026-10-20 화, 09:00 실행)

| 기기 | 알림 시각 | 오늘 보냄 | 알릴 공고 | 결과 |
|---|---|---|---|---|
| 어머니 | 9시 | 아니오 | 충족 2 · 확인 필요 1 (마감·미충족은 제외) | "새로 맞는 공고 3건이 있어요 (자격 충족 2 · 확인 필요 1)" → `/` |
| 아버지 | 9시 | 아니오 | 확인 필요 1 | "하남교산 A2 · 확인 필요 — 눌러서 확인해 보세요" → `/notice/{id}` |
| 테스트 기기 | 9시 | 예(08:00에 시각 바꾸기 전 보냄) | – | 건너뜀 |
| 다른 기기 | 10시 | – | – | 대상 아님 |

09:00 실행이 한 번 더 돌아도 어머니·아버지는 `last_push_on = 오늘`이라 건너뛴다.

## 2. 알림 켜기 (US-03)

```text
[알림 받기] (마법사 알림 단계·설정 스위치)
1. 설치·지원 확인
   ├─ iPhone Safari(홈 화면 앱 아님) → needs_install → 설치 그림 안내       (BR-U6-61)
   ├─ 알림 미지원 → unsupported
   └─ 권한 이미 거부 → denied → 다시 켜는 방법 안내                         (BR-U6-81)
2. Notification.requestPermission()  ← 버튼을 누른 이 순간에만               (BR-U6-60)
   └─ 허용 아님 → denied
3. 서비스워커 준비 → pushManager.subscribe(VAPID 공개 키)
4. POST /api/push/subscribe
   └─ 서버: 형식 검사 → 저장(옮기기·5개 제한) → 첫 구독이면 기준선      (BR-U6-50~55·10~13)
5. "알림이 켜졌어요"
```

## 3. 앱을 열 때 구독 다시 저장 (Q8=A)

```text
기기 준비(DeviceBootstrap) 뒤
  권한 = granted ?
    ├─ 아니오 → 아무것도 안 함 (권한 창을 띄우지 않음)
    └─ 예 → getSubscription() ?? subscribe() → POST /api/push/subscribe (같은 값이면 변화 없음)
서비스워커 pushsubscriptionchange → 열린 화면에 "다시 저장" 메시지 → 화면이 3을 실행   (BR-U6-57)
```

## 4. 알림을 받고 누를 때 (US-11)

```text
sw.js
  push 이벤트 → showNotification(title, { body, tag, icon, badge, data: { url } })
  notificationclick → 알림 닫기 → safeClickUrl(url)
     ├─ 열린 앱 창 있음 → 그 창 focus + 그 주소로 이동                        (BR-U6-85)
     └─ 없음 → 새 창 열기
→ /notice/{id}: 상세 맨 위 [원문 보기] (알림 → 원문 2탭, BR-U6-87)
→ /: 피드, 열어 보지 않은 새 공고에 NEW
```

## 5. 시험 알림 (Q9=A)

```text
설정 [시험 알림 보내기] → POST /api/push/test
  ├─ 최근 1시간 3번 → 429 "잠시 뒤에 다시 시험해 주세요"
  ├─ 구독 없음 → 409 "먼저 알림을 켜 주세요"
  └─ 모든 구독에 보냄 (기록·하루 1번과 무관), gone은 지움 → { sent, failed, removed }
```

## 6. 설치 안내

```text
installed? ──예──▶ 안내 없음 (설정 칸: "홈 화면 앱으로 쓰고 계세요")
   │아니오
   ├─ 피드 위 띠: shouldShowInstallHint(닫은 지 7일 지남) → [방법 보기] [닫기]
   ├─ 설정 칸: 항상
   └─ [방법 보기]·[홈 화면에 설치]
        ├─ Android, 설치 창 가능 → beforeinstallprompt.prompt()
        ├─ Android, 불가 → "브라우저 메뉴(⋮) → 홈 화면에 추가 또는 앱 설치"
        ├─ iPhone Safari → 그림 3장
        └─ iPhone 다른 브라우저 → "Safari로 열어 주세요"
```

## 7. 테스트 방향

- **순수 함수 + PBT**: domain-entities §7의 P-U6-1~10. 발송은 메모리 DB·가짜 발송기로 시뮬레이션(실제 푸시 서비스 호출 없음).
- **예시 테스트**: §1.1 예시, 문구 경계(24글자), 실패 종류별 처리, 구독 검사(허용 호스트·키 길이), API 핸들러(인증·400·409·429).
- **DB 테스트(pgTAP)**: 몫 잡기·되돌리기 동시성, 알림 기록 kind, 시험 기록 정리, 권한(anon 차단).
- **E2E**: 서비스워커 등록·manifest, 설치 안내 띠(닫기 7일), 설정의 설치 칸·시험 알림(권한 허용 상태 흉내, 실제 푸시 서비스 대신 가로챈 응답), 알림 거부 안내. 실제 푸시 도착은 실기기 확인(Build and Test).


---

## 8. 변경 요청 3 (2026-10-20) — 마감 임박 알림

> 규칙 BR-U6-D1~D42 (business-rules §14), 형식 domain-entities §8.

### 8.1 관심 공고 동기화

```text
별표·해제 (U5 BookmarksProvider)
  → mz.bookmarks 저장 → mz.bookmarks.sync = pending
  → PUT /api/bookmarks { ids }  ─ 성공 → synced
                                └ 실패 → pending 그대로 (조용히)
앱 열기 (기기 등록 뒤, 지금 flush 자리)
  → sync가 pending이거나 없음 → PUT /api/bookmarks { ids } → synced
```

### 8.2 dispatch (§1에서 바뀐 곳만)

```text
대상 기기 (그대로)
  → 묶어 읽기: 판정 행·알림 기록(sent·baseline)·통계 + **마감 임박(DB: 관심 공고 ∩ 마감 내일 − deadline 기록, 스위치 켜짐)**
  → 기기마다: planDevice(새 공고, 마감 임박) — 둘 다 없으면 건너뜀(몫 안 잡음)
  → 몫 잡기 → buildPayload(새 공고 + 마감 줄) → 보내기
  → 성공: 새 공고 sent 기록 + 마감 deadline 기록 / 모두 실패: 몫 되돌리기, 기록 없음
```

### 8.3 예시

| 기기 | 오늘 | 알림 |
|---|---|---|
| 엄마 휴대폰 (별표 1: 교산 A2, 마감 내일), 새 공고 없음 | 오전 9시 | "관심 공고 교산 A2 접수 마감이 내일이에요" → 상세 |
| 내 휴대폰 (새 공고 2건, 별표 마감 내일 2건) | 오후 8시 | "새로 맞는 공고 2건이 있어요 (자격 충족 2)" + "관심 공고 2건 마감이 내일이에요" → 피드 |
| 아빠 휴대폰 (마감 알림 끔, 새 공고 1건) | 오전 9시 | 지금과 같은 1건 알림 |

### 8.4 테스트 방향

- 순수 로직: `deadlineNotices`, `planDevice` 마감 포함·0건, `buildPayload` 4경우, 동기화 상태 — 예시 + P-U6-D1~D5
- pgTAP: `device_bookmarks` RLS·cascade, 바꾸기 함수(없는 ID 빼기·100개), 마감 임박 읽기(내일·기록·스위치), 마감 기록 표(새 공고 기록과 따로)
- E2E: 별표하면 서버 목록이 같아짐(로컬 DB 확인), 설정 스위치 저장, 모두 지우기 뒤 서버 목록 없음
- dispatch 로컬 실행: 별표 마감 내일 공고 → 알림 1번, 다시 실행해도 그대로

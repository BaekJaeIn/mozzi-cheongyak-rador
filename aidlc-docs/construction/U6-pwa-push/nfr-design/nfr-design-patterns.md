# U6 pwa-push — NFR 설계 패턴

> 근거: 계획 답변 Q1~Q5 = 모두 A (2026-10-16), nfr-requirements NFR-U6-01~35
> **답변 뒤 조정 1건**: Q5의 "마지막 성공이 없거나 7일 지난 구독 삭제"는 알릴 공고가 없어 **보낼 일이 없던** 정상 구독까지 지운다. → `push_subscriptions.failing_since`(실패가 시작된 시각, 성공하면 비움)를 두고 **7일 넘게 계속 실패한 구독만** 지운다 (§1 P-6).

---

## 1. 신뢰성 패턴

| ID | 패턴 | 적용 |
|---|---|---|
| P-1 | **먼저 잡고 보내기 (claim → act → record/release)** (Q1=A) | `claim_daily_push(device, today)`: `update devices set last_push_on = today where id = $1 and last_push_on is distinct from today returning` 이전 값(행 잠금 안의 한 문장). 성공한 실행만 보낸다. 모두 실패하면 `release_daily_push(device, today, previous)` — `last_push_on = today`일 때만 이전 값으로 되돌림(그 사이 다른 실행이 보냈으면 그대로) |
| P-2 | **유일 기록** | `notification_log` 기본키(기기 × 공고) + `insert … on conflict do nothing`. 기준선(`kind = baseline`)이 이미 있으면 `sent`로 바꾸지 않는다 |
| P-3 | **기기별 격리** | 기기 하나의 처리 전체를 `try/catch`로 감싼다. 예외 → 잡은 몫이 있으면 되돌리기 시도, 결과 `failed`, 다음 기기 계속 |
| P-4 | **재시도 1번** | 보내기 결과 `retryable`(5xx·429·네트워크·시간 초과)이면 2초 뒤 1번 더. `gone`·`rejected`는 재시도 없음 |
| P-5 | **시간 예산** | 실행 시작부터 45초가 지나면 새 기기를 시작하지 않는다(진행 중인 기기는 끝냄). 건너뛴 기기는 몫을 잡지 않았으므로 다음 날 대상. `dispatch_runs.time_budget_exceeded = true` |
| P-6 | **실패 지속 시간으로 정리** (조정) | 보내기 실패(`retryable`·`rejected`) → `failing_since`가 비어 있으면 지금으로. 성공 → `failing_since = null`, `last_success_at = 지금`. 정리 cron: `failing_since < now() - 7일`이면 삭제. `gone`은 바로 삭제 |
| P-7 | **보낸 직후 기록** (Q4=A) | 기기마다 `record_push_result(device, today, noticeIds, successEndpoints, failedEndpoints, goneEndpoints)` 한 트랜잭션: 알림 기록, 성공·실패 시각, 만료 삭제. 기록 실패는 로그(`dispatch.record.failed`)만 — 그 공고는 다음 날 다시 알림(놓치지 않기, NFR-U6-09) |
| P-8 | **기준선 한 번** | `save_push_subscription` 안에서 `devices.push_baseline_at is null`이면 같은 트랜잭션에서 기준선 넣고 시각 기록. 두 요청이 겹쳐도 행 잠금으로 한 번 |

## 2. 성능·확장 패턴

| ID | 패턴 | 적용 |
|---|---|---|
| P-9 | **묶어 읽기** (Q2=A) | ① `dispatch_candidates(hour, today)` 1번: 대상 기기 + 구독 + 프로필 버전 ② 기기 100대씩: 판정(노출 1차 거름: verdict≠ineligible·in_district·마감일 ≥ 오늘 또는 없음) + 공고(이름·일정·첫 수집) + 알림 기록 공고 ID ③ 판정 통계(개수·최소 버전) — 메모리에서 기기별 `planDevice` |
| P-10 | **동시 처리 5대** (Q3=A) | 간단한 작업 풀(동시 5). 한 기기의 구독들은 차례로 보냄(보통 1~2개). 결과 집계는 기기 단위 |
| P-11 | **다시 계산은 필요한 기기만** | 판정 통계로 오래된 기기만 골라 U2 `recomputeForDevice` → 그 기기만 ②를 다시 읽음 |
| P-12 | **암호화 준비 재사용** | VAPID JWT는 푸시 서비스(주소의 origin)마다 한 번 만들어 실행 동안 재사용(유효 12시간). 공고 내용 암호화는 구독마다(키가 다름) |
| P-13 | **1,000대 측정** | 가짜 푸시 서비스(지연 50~300ms, 실패 섞기)로 1,000대 시뮬레이션 테스트 — 동시 5에서 45초 안 확인. 넘으면 동시 수를 올리는 대신 기록(가족 규모에서는 여유) |

## 3. 보안 패턴

| ID | 패턴 | 적용 |
|---|---|---|
| P-14 | **허용 목록 + 두 번 검사** | 구독 저장 때와 보내기 직전에 `isAllowedPushEndpoint(url)`: `https:`, 포트 없음(443), 호스트가 허용 목록(정확히 일치 또는 지정 접미사). 사용자 정보 `@`·IP 주소 거부 |
| P-15 | **비밀값 경계** | VAPID 개인 키는 Edge 비밀값·Vercel 환경 변수에서 읽어 `CryptoKey`(내보내기 불가)로만 메모리에 둔다. 문자열은 로그·오류 메시지에 넣지 않는다 |
| P-16 | **로그 가리기** | 로그에 구독 주소 대신 `sha256(endpoint)` 앞 8자, 키·알림 내용 없음. 푸시 서비스 오류 응답 본문은 남기지 않고 상태 코드만 |
| P-17 | **호출 보호** | `dispatch`는 U3 `guard`(비밀 헤더, 상수 시간 비교) 재사용. Next API는 U1 route guard + 본문 4KB |
| P-18 | **클릭 주소 제한** | 서비스워커 `safeClickUrl`: `new URL(url, origin)`의 origin이 같고 경로가 `/`로 시작할 때만, 아니면 `/` |

## 4. 플랫폼 패턴 (iOS·Android)

| ID | 패턴 | 적용 |
|---|---|---|
| P-19 | **항상 보이는 알림** | `push` 이벤트에서 `event.waitUntil(showNotification(…))`. 내용 해독·파싱 실패해도 기본 문구로 표시(NFR-U6-23) |
| P-20 | **사용자 동작 안에서 권한 요청** | `requestPermission()`을 버튼 클릭 처리기에서 바로 부름(사이에 `await` 네트워크 호출 없음 — 공개 키는 미리 받아 둠) |
| P-21 | **기능 감지** | `serviceWorker`·`PushManager`·`Notification` 존재 + 설치 여부로 `supported`·`needs_install` 판단. 사용자 에이전트 문자열은 설치 안내 종류 고르기에만 |
| P-22 | **구독 다시 저장** | 앱 시작 후 한 번(권한 granted일 때만) + 서비스워커 `pushsubscriptionchange` → 화면에 메시지 → 다시 저장 |

## 5. 관측성

| ID | 패턴 | 적용 |
|---|---|---|
| P-23 | **실행 1행** | `dispatch_runs`: 시작 때 행 넣고 끝날 때 갱신(중간에 죽으면 끝 시각 없는 행으로 남아 보임) |
| P-24 | **구조화 로그** | `dispatch.device`(기기 ID·결과·건수), `push.rejected`(상태 코드·endpoint 해시), `dispatch.time_budget`, `dispatch.recompute.failed`, `dispatch.record.failed` |

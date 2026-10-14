# U1 setup-data-platform — 비즈니스 로직 모델

---

## 1. 기기 준비 흐름 (`ensureDevice`, 앱 시작 시마다)

```text
앱 시작
 -> localStorage 'mz.device' 있음?
      아니오 -> 새 deviceId·token 생성 (BR-U1-01) -> POST /api/device
                 201 -> 저장, 완료
                 409 -> 새 값으로 1회 재시도 (BR-U1-03)
                 네트워크 오류 -> 저장하지 않고 "인터넷 연결을 확인해 주세요" + [다시 시도]
      예     -> 완료 (서버 확인은 첫 API 호출 때 자연스럽게 이루어짐)
```

## 2. 인증 요청 처리 (`DeviceAuth.authenticate`, 서버)

```text
요청 수신
 -> 헤더 2개 형식 검사       실패 -> 401 AUTH_MISSING
 -> devices에서 deviceId 조회 없음 -> 401 DEVICE_UNKNOWN
 -> SHA-256(token) 상수 시간 비교  다름 -> 401 TOKEN_MISMATCH
 -> lastSeenAt 1시간 이상 지남? 예 -> 갱신 (BR-U1-11)
 -> { deviceId } 반환 -> 각 API 처리
```

## 3. 클라이언트 API 호출 래퍼 (`apiFetch`)

```text
apiFetch(path, init)
 -> ensureDevice -> 헤더 첨부 -> fetch
 -> 401 DEVICE_UNKNOWN / TOKEN_MISMATCH
      -> 기존 'mz.device' 버림 -> 새 기기 등록 (BR-U1-09)
      -> 기기에 프로필 있으면 U4의 동기화 대기열에 '다시 보내기' 표시
      -> 원래 요청 1회 재시도
 -> 그 밖의 오류 -> { code, message } 그대로 화면에 전달 (BR-U1-20)
```

## 4. 일일 정리 (`cleanupExpired`, 하루 1번)

```text
now
 -> devices where lastSeenAt < now - 180일  -> 삭제 (연쇄) (BR-U1-13)
 -> notices where retentionBaseDate < today - 365일 -> 삭제 (연쇄) (BR-U1-14)
 -> 삭제 건수를 collect_runs(source='cleanup')에 기록
```

판단 함수는 순수 함수로 분리한다:
- `isDeviceExpired(lastSeenAt, now): boolean`
- `noticeRetentionBaseDate(notice): Date`
- `isNoticeExpired(notice, today): boolean`

## 5. Repository 계약 (K1·K2)

U1이 인터페이스와 Node 구현을 만들고, Deno 구현은 같은 인터페이스로 `_shared/db/`에 둔다. 메서드 목록은 application-design의 component-methods.md(C17~C20)를 따르며, U1에서 다음을 추가·확정한다.

| Repository | U1에서 확정하는 메서드 |
|---|---|
| DeviceRepository | `create(deviceId, tokenHash)`, `findAuth(deviceId): { tokenHash, lastSeenAt } \| null`, `touch(deviceId, now)`, `deleteAll(deviceId)`, `deleteExpired(before): number` |
| NoticeRepository | `deleteExpired(beforeDate): number` (조회·upsert는 U3, U5에서 채움) |
| 공통 | 행(row) ↔ 도메인 객체 변환 함수 `toRow` / `fromRow`를 엔티티마다 둔다 (PBT-02 대상) |

## 6. 인증 헤더 계약 (K3)

| 헤더 | 형식 |
|---|---|
| `x-device-id` | UUID v4 소문자 |
| `x-device-token` | base64url 43자 |

| 응답 | 의미 | 기기 동작 |
|---|---|---|
| 401 `AUTH_MISSING` | 헤더 없음/형식 오류 | 앱 버그 → 오류 안내 |
| 401 `DEVICE_UNKNOWN` | 서버에 기기 없음 (삭제됨) | 새 기기 등록 + 프로필 재동기화 |
| 401 `TOKEN_MISMATCH` | 토큰 불일치 | 새 기기 등록 + 프로필 재동기화 |

---

## 7. 테스트 가능한 속성 (PBT-01)

| 컴포넌트 | 속성 | 범주 |
|---|---|---|
| 토큰 해시·검증 | 생성한 모든 토큰 t에 대해 `verify(t, hash(t)) = true` | Invariant |
| 토큰 해시·검증 | 서로 다른 토큰 t1 ≠ t2이면 `verify(t2, hash(t1)) = false` | Invariant |
| 기기 ID·토큰 생성기 | 생성한 값은 항상 형식 검증기(BR-U1-06)를 통과한다 | Easy verification |
| 인증 헤더 | `parseAuthHeaders(buildAuthHeaders(d)) = d` | Round-trip |
| Repository 변환 | 엔티티마다 `fromRow(toRow(x)) = x` (Device, DeviceProfile 저장 형식, Notice, HousingUnit, Judgement) | Round-trip |
| 보관 판단 | `isDeviceExpired`는 시간에 대해 단조: `now1 ≤ now2`이고 `isDeviceExpired(s, now1)`이면 `isDeviceExpired(s, now2)` | Invariant |
| 보관 판단 | `isNoticeExpired`도 같은 단조성. 경계: 정확히 365일째는 삭제하지 않음 | Invariant |
| 정리 작업 | `cleanup(cleanup(state)) = cleanup(state)` (같은 now 기준) | Idempotence |
| 공고 상태 | 모든 일정 조합에서 `status`는 upcoming/open/closed 중 정확히 하나이고, `applyEnd`가 없으면 closed가 아님 | Invariant |
| AppChrome | 순수 로직 없음 (레이아웃·표시만) | No PBT properties identified: 화면 표시 전용, E2E와 예시 테스트로 확인 |

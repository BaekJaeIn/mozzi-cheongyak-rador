# U1 — API 계층 요약 (Step 8~10)

## 구조

Next.js 라우트 파일은 정해진 이름(`GET`, `POST`, `runtime`, `dynamic` 등)만 export할 수 있어서, 처리 로직은 `src/server/handlers/`에 **의존성을 주입받는 팩토리**로 두고 라우트 파일은 연결만 한다. 덕분에 DB 없이 핸들러를 테스트할 수 있다.

## 생성 파일

| 파일 | 내용 | 근거 |
|---|---|---|
| `src/server/env.ts` | 서버 전용 환경 변수, `AMOUNT_ENC_KEY_V{n}` 수집, 현재 키 버전 검증 | L6, P-S7 |
| `src/server/http/respond.ts` | `json`, `noContent`, `errorResponse`, `readJsonBody`(크기 413·형식 400), `x-request-id`, `cache-control: no-store` | BR-U1-20, P-S6 |
| `src/server/auth/route-guard.ts` | `createRouteGuard` → `withDevice(handler, { route, maxBodyBytes })`: 본문 → 인증(401 3종) → `shouldTouch`(1시간) → 핸들러 → 구조화 로그, 예외는 500 | L3, BR-U1-06~08·11 |
| `src/server/cache/ttl-cache.ts` | `createTtlCache`(10분, 진행 중 Promise 공유, 실패는 캐시 안 함), `isFresh` | L10, P-P1 |
| `src/server/cache/reference-cache.ts` | `districtsCache`, `supplyTypeLabelsCache` | P-P1 |
| `src/server/handlers/register-device.ts` | 기기 등록: 1KB 제한, 형식 검증, 토큰 해시 후 RPC, 201 / 200 / 409 / 429 / 400 / 413 / 500 | BR-U1-02~05, P-S4 |
| `src/server/handlers/health.ts` | DB 조회 1번, 200 `{ok:true}` / 503 `{ok:false}` (내부 정보 미노출) | L12 |
| `src/server/deps.ts` | 운영 의존성 연결 (`deviceRepository`, `withDevice`, `pingDb`) | |
| `src/app/api/device/route.ts` | `POST` (Node 런타임, force-dynamic) | |
| `src/app/api/health/route.ts` | `GET` (Node 런타임, force-dynamic) | |

## API 응답 정리

| 엔드포인트 | 상태 | 본문 |
|---|---|---|
| `POST /api/device` | 201 | `{ "status": "created" }` |
| | 200 | `{ "status": "existing" }` (같은 ID·같은 토큰 재전송) |
| | 400 / 409 / 413 / 429 / 500 | `{ "code", "message" }` (`BAD_REQUEST` / `DEVICE_CONFLICT` / `PAYLOAD_TOO_LARGE` / `TOO_MANY_REGISTRATIONS` / `SERVER`) |
| `GET /api/health` | 200 / 503 | `{ "ok": true }` / `{ "ok": false }` |
| 기기 인증 API 공통 (U4~U6) | 401 | `AUTH_MISSING` / `DEVICE_UNKNOWN` / `TOKEN_MISMATCH` |

## 테스트

| 파일 | 종류 | 내용 |
|---|---|---|
| `src/server/__tests__/helpers.ts` | 도구 | 메모리 DeviceRepository, 기기 시드, 요청 생성 |
| `auth/__tests__/route-guard.test.ts` | 예시 | 401 3종, 성공 시 본문·deviceId 전달·requestId, 1시간 갱신 경계, 413 선검사, 400, 예외 500 |
| `handlers/__tests__/register-device.test.ts` | 예시 | 201·해시 저장, 200 멱등, 409, 429, 400(4종), 413, 500 내부 정보 미노출, 로그에 토큰 없음 |
| `handlers/__tests__/health.test.ts` | 예시 | 200·no-store, 503·내부 정보 미노출 |
| `cache/__tests__/ttl-cache.test.ts` | 예시 | TTL 경계, 동시 요청 1회, 실패 미캐시 |
| `cache/__tests__/ttl-cache.pbt.test.ts` | PBT | 만료 단조성, 읽은 직후 유효·정확히 TTL에 만료 |

**실행 결과**: 전체 77개 테스트 통과, `tsc --noEmit` 오류 없음 (Step 9 시점. 아래 조치 후 97개).

## 스모크 테스트에서 발견한 문제와 조치 (Step 18)

- **증상**: 빌드한 서버(환경 변수 없음)에 잘못된 본문·1KB 초과 본문을 보내면 400·413이 아니라 **Next 기본 500**(우리 `{ code, message }` 형식도 아님)이 나왔다
- **원인**: 핸들러가 입력 검증 전에, 그리고 `try` 밖에서 의존성(`getDeps()` → `getDb()` → 환경 변수)을 먼저 만들었다. route-guard도 같은 구조였다
- **조치**
  - `createRegisterHandler(getDevices, sink?)`: 저장소는 입력 검증을 통과한 뒤 `try` 안에서 만든다
  - `createRouteGuard(getDeps, sink?)`: 본문 검사·헤더 검사 뒤 `try` 안에서 의존성을 만든다
  - `createHealthHandler(ping, sink?)`: 함수 하나만 받도록 단순화
  - 로그 출력 함수(sink)는 의존성과 분리해 생성 시점에 받는다
- **회귀 테스트**: `register-device.test.ts`, `route-guard.test.ts`에 "의존성 준비 실패" 경우 추가 (3건)
- **재확인**: 다시 빌드한 서버에서 잘못된 입력 400, 초과 413, 올바른 입력 + 환경 변수 없음 → `{ code: "SERVER" }` 500, 헬스 503. 서버 로그에 토큰 없음

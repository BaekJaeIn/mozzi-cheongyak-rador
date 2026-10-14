# U1 — 비즈니스 로직 요약 (Step 2~4)

모두 `supabase/functions/_shared/` 아래의 순수 TypeScript이고, npm·Deno·Node 전용 API를 쓰지 않는다(WebCrypto만 사용).

## 생성 파일

| 파일 | 내용 | 근거 |
|---|---|---|
| `encoding/base64url.ts` | base64url 인코딩·디코딩, 16진수 변환 (Buffer 없이) | 공용 도우미 |
| `security/token.ts` | `generateDeviceId`, `generateToken`(32바이트 → 43자), `hashToken`(SHA-256 hex), `verifyToken`, `constantTimeEqual`, 형식 검증 | BR-U1-01·02·06·07, P-S2 |
| `security/auth-headers.ts` | `x-device-id`·`x-device-token` 만들기·읽기 | K3 |
| `domain/dates.ts` | `IsoDate`, `diffDays`, `addDays`, `toKstDate`, `isIsoDate` | 공용 |
| `domain/retention.ts` | `isDeviceExpired`(180일 초과), `noticeRetentionBaseDate`, `isNoticeExpired`(365일 초과), `noticeStatus` | BR-U1-13·14, E3 |
| `log/logger.ts` | `redact`(민감 키 가리기·deviceId 8자리·순환 참조 처리), `createLogger`(JSON 한 줄) | P-S5 |
| `http/retry.ts` | `shouldRetry`, `MAX_RETRIES=1`, `RETRY_DELAY_MS=1000` | P-R1 |
| `http/errors.ts` | 오류 코드 9종과 쉬운 한국어 문구, `apiError`, `isApiErrorBody` | BR-U1-20 |

## 결정 사항

- `noticeStatus`: 시작일이 없으면 마감 전까지 `upcoming`. 마감일이 없으면 절대 `closed`가 되지 않음 (놓치지 않기)
- 보관 경계: 기기 정확히 180일, 공고 정확히 365일째는 **보관** (business-logic-model §7)
- 공고 날짜 비교는 **한국 날짜** 기준. DB 정리 함수도 `now() at time zone 'Asia/Seoul'`의 날짜를 써야 같은 결과가 나옴 (Step 14에서 반영)

## 테스트 (Step 3)

| 파일 | 종류 | 확인 내용 |
|---|---|---|
| `__tests__/arbitraries/index.ts` | 공용 생성기 | deviceId, token, 날짜(2020~2035), 접수 일정(시작 ≤ 마감), 공고 날짜, 민감 키가 섞인 로그 객체 (PBT-07) |
| `security/__tests__/token.test.ts` | 예시 | SHA-256 알려진 값, 형식 검증, 상수 시간 비교 |
| `security/__tests__/token.pbt.test.ts` | PBT | verify(t, hash(t)) 항상 참, 다른 토큰 실패, 생성값 형식 통과 |
| `security/__tests__/auth-headers.pbt.test.ts` | PBT | 헤더 왕복, 형식 오류 시 null |
| `domain/__tests__/retention.test.ts` | 예시 | 180일·365일 경계, 기준일 순서, 상태 5가지 |
| `domain/__tests__/retention.pbt.test.ts` | PBT | 만료 단조성 2종, 365/366 경계, 상태 불변식, addDays·diffDays 역연산 |
| `log/__tests__/logger.test.ts` | 예시 | 가리기 결과, 원본 불변, 순환 참조, 로그 한 줄 |
| `log/__tests__/logger.pbt.test.ts` | PBT | 민감 값 미노출, 멱등 |
| `http/__tests__/retry.pbt.test.ts` | PBT | 4xx(408 제외)·2xx·3xx false, 5xx true, 네트워크 true |

**실행 결과**: 8개 파일, 36개 테스트 통과. 시작 시 `[PBT] seed=… numRuns=100`이 출력되고, `FC_SEED=42`로 같은 seed 재현 확인.

**PBT seed 처리 보완**: `vitest.setup.ts`의 `console.log`가 Vitest 출력에 나타나지 않아, seed 결정·출력을 `vitest.global-setup.ts`로 옮기고 워커는 환경 변수로 받도록 바꿈 (PBT-08).

# U1 — Repository 계층 요약 (Step 5~7)

## 생성 파일

| 파일 | 내용 |
|---|---|
| `supabase/functions/_shared/db/types.ts` | 도메인 타입(camelCase, Date/IsoDate)과 행 타입(snake_case, 문자열). 빈 값은 모두 `null` |
| `supabase/functions/_shared/db/mappers.ts` | `districtMapper`, `deviceMapper`, `storedProfileMapper`, `noticeMapper`, `housingUnitMapper`, `pushSubscriptionMapper`, `judgementMapper` (`toRow`/`fromRow`) |
| `supabase/functions/_shared/db/repositories.ts` | 인터페이스: `DeviceRepository`(U1), `ReferenceDataRepository`(U1), `ProfileRepository`(U2·U4), `NoticeRepository`(U5), `JudgementRepository`(U2). `RegisterResult` = created / existing / conflict / rate_limited |
| `src/server/env.ts` | 서버 전용 환경 변수 읽기·검증 (처음 호출 시, `server-only`). Step 8.1을 앞당겨 생성 |
| `src/server/db/client.ts` | 서버 전용 supabase-js 클라이언트, `DbClient`(from·rpc만), `DbError` |
| `src/server/db/device-repository.ts` | `register`(RPC `register_device`), `findAuth`, `touch`, `deleteAll`(RPC `delete_device`) |
| `src/server/db/reference-repository.ts` | `listDistricts`(활성 지구, 정렬), `listSupplyTypeLabels` |

**CG-1 적용**: `_shared/db/`에는 npm을 쓰지 않는 타입·변환·인터페이스만 두었다. Deno 구현은 U3에서 `supabase/functions/_lib/db/`에 만든다.

## 테스트

| 파일 | 종류 | 내용 |
|---|---|---|
| `_shared/db/__tests__/mappers.pbt.test.ts` | PBT | 엔티티 7종 `fromRow(toRow(x)) = x` (PBT-02). 엔티티별 생성기는 제약을 지킴(시각 범위, 0~23시, 해시 64자, 암호문 형식 등) |
| `src/server/db/__tests__/fake-db.ts` | 도구 | 호출을 기록하는 가짜 Supabase 클라이언트 (thenable 빌더) |
| `src/server/db/__tests__/device-repository.test.ts` | 예시 | RPC 결과 4종, 알 수 없는 결과·DB 오류 → `DbError`, findAuth null·정상, touch 인자, deleteAll |

**실행 결과**: 전체 53개 테스트 통과.

## 발견한 문제와 조치

- 한 줄 화살표 함수로 쓴 PBT 속성(`(x) => expect(...).toEqual(x)`)이 **"returning false"로 모두 실패**했다. Vitest 5의 `toEqual` 반환값이 fast-check에서 실패로 해석됐기 때문이다
- 조치: 속성 본문을 블록 `{ expect(...); }`으로 바꿈
- **규칙(이후 Unit 공통)**: `test.prop` 속성 함수는 항상 블록 본문으로 쓰고 값을 반환하지 않는다

# U2 eligibility-engine — 기술 스택 결정

U2는 U1에서 정한 기술 스택을 그대로 쓴다 ([U1 tech-stack-decisions.md](../../U1-setup-data-platform/nfr-requirements/tech-stack-decisions.md)). 아래는 U2에서 추가로 확정하는 내용이다.

## 1. 새 라이브러리 없음

| 기능 | 구현 | 이유 |
|---|---|---|
| 판정·매칭·분류·요건 병합·점수 | 직접 작성한 순수 TypeScript | `_shared` npm 금지(NFR-U2-17), 규칙이 이 앱 전용 |
| 날짜·만 나이 | U1 `domain/dates.ts` 확장 | 날짜 라이브러리 불필요 (한국 날짜 문자열만 다룸) |
| 금액 암호화 | WebCrypto `AES-GCM` (`crypto.subtle`) | Node 24·Deno·테스트 공용 (U1 AD-9) |
| 숫자 표기 ("645만 2,897원") | `Intl.NumberFormat('ko-KR')` + 직접 작성한 만 단위 포맷터 | 표준 API |
| 유니코드 정규화 | `String.prototype.normalize('NFC')` | 표준 API |

## 2. PBT 설정 (PBT-09 승계)

| 항목 | 값 |
|---|---|
| 프레임워크 | fast-check 4.10.2 + @fast-check/vitest 0.5.0 (U1과 동일) |
| 기본 실행 횟수 | 로컬 100, CI 200 (U1 설정) |
| 상태 기반 테스트 | `fc.commands` + `fc.modelRun`, 실행 횟수 = 기본값 / 2, 명령 수 최대 20 (NFR-U2-22) |
| 공용 생성기 | `supabase/functions/_shared/__tests__/arbitraries/` 에 `householdProfileArb`, `requirementsArb`, `noticeWithUnitsArb`, `referenceDataArb` 추가 |
| seed | U1 global setup 그대로 (`FC_SEED` 재현) |

## 3. 데이터 (시드) 관리

| 항목 | 결정 |
|---|---|
| 위치 | `supabase/migrations/0006_eligibility_reference.sql` (스키마 변경 + 시드), 이후 연도 갱신은 새 번호 마이그레이션 |
| 출처 기록 | SQL 주석에 URL·확인 날짜 (NFR-U2-19) |
| 갱신 절차 | README "연간 갱신" 절 (NFR-U2-18) |

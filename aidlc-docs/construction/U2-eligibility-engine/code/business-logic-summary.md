# U2 — 비즈니스 로직 요약 (Step 1~8)

모두 `supabase/functions/_shared/` 아래의 순수 TypeScript (npm·Deno·Node 전용 API 없음, WebCrypto만 사용).

## 생성 파일

| 파일 | 내용 | 근거 |
|---|---|---|
| `domain/profile.ts` | `HouseholdProfile` v1, `ageAt`(2/29 처리), `householdMembers`, `normalizeSido`, `areaBandOf`, `validateProfile` | §1, BR-U2-36·60·72 |
| `domain/requirements.ts` | `Requirements` 타입, `validateRequirements`(한 키라도 틀리면 전체 거부, 시도 이름 정규화) | §2 |
| `domain/supply-types.ts` | 코드 9개·라벨, `classifySupplyType` | BR-U2-10~19 |
| `domain/district-matcher.ts` | `matchDistricts` (단독 키워드 / 시군구 + 동 키워드) | BR-U2-01~06 |
| `domain/requirement-resolver.ts` | `resolveRequirements` (구조 조건 불일치 → unknown, 금액 조건 → 공고 값 + 0.5~2배 검증) | BR-U2-20~28 |
| `eligibility/types.ts` | 판정 결과 타입 (`CriterionResult.code`·`userValue` 포함) | §3, NFR-U2-10 |
| `eligibility/messages.ts` | 사유·행동 문구 템플릿, `formatWon`·`formatManwon` (금액 인자 받는 템플릿 없음) | P-U2-S3 |
| `eligibility/income-table.ts` | 기준표(100% 금액 → 비율 반올림), 민영 예치금 표 | BR-U2-43·46 |
| `eligibility/criteria/*.ts` | 나이, 무주택·자산·자동차·거주·세대주, 소득, 통장, 복지 | BR-U2-30~54 |
| `eligibility/engine.ts` | `judgeUnit`, `judgeNotice`, `combineUnit`, `combineNotice`, `baseDateOf` | BR-U2-35·55~58 |
| `eligibility/scoring.ts`, `visibility.ts` | 점수(0~2), 피드 정렬 비교, 노출 조건 K5 | BR-U2-59~65 |
| `eligibility/reference-data.ts` | **기준 데이터 원본**: 지구 6개, 2026 소득표 15행, 공급유형 표준 요건 9개 (SQL 시드와 대조 테스트) | §5 |
| `security/amount-cipher.ts` | 버전 키링(non-extractable), 암·복호화 | BR-U2-70~72, P-U2-S1 |
| `security/profile-codec.ts` | 금액 3개만 암호문, 나머지 data JSON | BR-U2-73 |
| `services/judgement-service.ts` | `recomputeForDevice`, `recomputeAll`, `toJudgementRow`, 판정 분포 집계 | BR-U2-80~84, P-U2-R1~R4 |
| `db/repositories.ts` | 인터페이스 갱신 (ProfileRepository 3개, NoticeRepository.listRetainedWithUnits, ReferenceData.loadIncomeThresholds, JudgementRepository.replaceForDevice(version)) | L-U2 §2 |

설계 대비 조정: `EligibilityReference`는 `eligibility/engine.ts`에 두었다. 재계산에 필요한 기준 데이터가 소득표뿐이라 `loadEligibilityReference` 대신 `loadIncomeThresholds`로 단순화했다 (지구·표준 요건은 U3 수집에서 사용).

## 테스트 (Step 5~7)

| 파일 | 종류 | 내용 |
|---|---|---|
| `__tests__/arbitraries/eligibility.ts` | 생성기 | `profileArb`(모름 섞임/없음, 부부 고정), `requirementsArb`(키 없음/unknown/값), `noticeArb`, `incomeThresholdsArb`(전체/일부 → 기준표 없음 경로) |
| `__tests__/fixtures.ts`, `memory-repos.ts` | 도구 | 예시 가구(가상), 메모리 Repository(DB와 같은 버전 규칙), 테스트 키 |
| `eligibility/__tests__/scenarios.test.ts` | 예시 | **핵심 시나리오 9개** (19건) |
| `domain/__tests__/domain.test.ts` | 예시 | 만 나이·2/29, 시도, 면적 경계, 프로필 검증, 분류 9건, 지구 매칭 6건(성남 대장동·하남 미사 오매칭 방지), 요건 검증·확정 |
| `eligibility/__tests__/scoring.test.ts` | 예시 | 금액 표기, 점수, 정렬 순서, 합성, 노출 |
| `security/__tests__/cipher-codec.test.ts` | 예시 | 형식·왕복, 키 교체, 위조·모르는 버전 거부, 0원 회귀 |
| `services/__tests__/judgement-service.test.ts` | 예시 | 프로필 없음, 전체 공고 판정, 실패 격리, 멱등, stale |
| `domain/__tests__/domain.pbt.test.ts` | PBT | 나이 3, 면적 구간, 분류 전체성, 지구 매칭 3, 요건 확정 2 |
| `eligibility/__tests__/engine.pbt.test.ts` | PBT | 모름-only 프로필 미충족 없음, unknown 조건 미충족 없음, 정보 감소, 금액 단조, 나이 단조, **가구 대칭성**, 합성 교환·오라클, 노출 오라클, **사유에 내 금액 없음** |
| `eligibility/__tests__/scoring.pbt.test.ts` | PBT | 점수 범위, 정렬 전순서, 비교 반대칭 |
| `security/__tests__/cipher-codec.pbt.test.ts` | PBT | 암호화 왕복, 암호문 무작위성, 코덱 왕복, data에 금액 없음 |
| `services/__tests__/judgement-service.pbt.test.ts` | PBT | 멱등, 실패 격리, **상태 기반 테스트**(저장·공고 추가/삭제·전체 재계산·오래된 저장, 모델 비교) |

**실행 결과**: `_shared` 19개 파일, 145개 테스트 통과 (서로 다른 seed 2회).

## 테스트가 찾은 문제와 조치

| # | 발견 | 조치 |
|---|---|---|
| 1 | 예시 테스트: 형식이 틀린 키 문자열이면 `createKeyring`이 `DOMException`을 그대로 던짐 | `AmountCipherError`로 감쌈 |
| 2 | **PBT**: 금액 0~9만원(예: 자동차 없음 = 0)의 암호문이 23자라 형식 검사(24자 이상)에 걸려 **프로필을 복호화하지 못함**. 해당 기기는 판정이 전혀 안 됐을 것 | 최소 길이를 23자로 고치고 회귀 예시 테스트 추가 |
| 3 | **변이 검사**: 나이 규칙에 일부러 버그를 넣었더니 "정보 감소" 속성이 잡지 못함 (공고·주택형 판정만 비교해서) | 조건별 판정까지 비교하도록 속성 강화 → 같은 버그를 3번 모두 잡음. "사유에 내 금액" 변이도 잡히는 것 확인 |

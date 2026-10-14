# U2 eligibility-engine — 비즈니스 로직 모델

---

## 1. 모듈 구성 (`supabase/functions/_shared/`)

```text
domain/profile.ts          HouseholdProfile 타입, 만 나이, 면적 구간, 시도 이름 정규화
domain/requirements.ts     Requirements 타입, 형식 검증(validateRequirements)
domain/supply-types.ts     공급유형 코드·라벨, classify (BR-U2-10~19)
domain/district-matcher.ts matchDistricts (BR-U2-01~06)
domain/requirement-resolver.ts resolveRequirements (BR-U2-20~28)
eligibility/criteria/*.ts  조건별 판정기: age, homeless, income, savings, asset, car, residence, household, welfare
eligibility/engine.ts      judgeUnit, judgeNotice, combineUnit, combineNotice (BR-U2-30~59)
eligibility/visibility.ts  isVisible (K5, BR-U2-59)
eligibility/scoring.ts     areaBand, score, compareFeedItems (BR-U2-60~65)
security/amount-cipher.ts  encryptAmount, decryptAmount, importKey (BR-U2-70~72)
security/profile-codec.ts  encodeProfile, decodeProfile (BR-U2-73)
services/judgement-service.ts recomputeForDevice, recomputeAll (S2, BR-U2-80~84) — Repository 주입
```

모두 순수 함수다. 예외는 `amount-cipher.ts`(WebCrypto 비동기)와 `judgement-service.ts`(주입받은 Repository 호출)뿐이다.

## 2. 공고 1건 판정 흐름 (`judgeNotice`)

```text
입력: profile, notice(+units, districtIds), ref(기준표, 지구), asOf(한국 날짜)

1. baseDate = notice.announcedAt ?? notice.applyStart ?? asOf          (BR-U2-35)
2. 주택형마다 judgeUnit:
     unit.requirements.unclassified → unknown                        (BR-U2-56)
     조건 키마다 판정기 실행 → CriterionResult[]                      (BR-U2-30~54)
       - 소득은 면적 적용 범위(BR-U2-45a), 통장은 면적별 예치금(BR-U2-46·48) 반영
       - 나이·세대주 결합(BR-U2-38)
     combineUnit(결과들)                                              (BR-U2-55)
3. verdict   = combineNotice(주택형 판정들)                          (BR-U2-57)
4. inDistrict = notice.districtIds ∩ profile.prefs.districtIds ≠ ∅     (BR-U2-58)
5. score     = 면적 일치 + 분양/임대 일치                              (BR-U2-64)
출력: NoticeJudgement { verdict, inDistrict, score, units, baseDate }
```

## 3. 재계산 서비스 (S2)

### `recomputeForDevice(deviceId, asOf)` — U4 프로필 저장 직후

```text
1. stored = ProfileRepository.get(deviceId)            없으면 종료 (BR-U2-84)
2. profile = decodeProfile(stored, cipher)              실패 → 기록 후 종료, 기존 판정 유지 (BR-U2-82)
3. ref = ReferenceData.load(); notices = NoticeRepository.listRetainedWithUnits()
4. judgements = notices.map(n => judgeNotice(profile, n, ref, asOf))
5. JudgementRepository.replaceForDevice(deviceId, rows)   (U1 RPC, 한 트랜잭션)
```

### `recomputeAll(asOf)` — U3 일일 수집 뒤

```text
1. ref, notices를 한 번 읽음                                       (BR-U2-81)
2. 프로필이 있는 기기마다 위 2·4·5 수행
   기기 하나의 실패는 기록하고 다음 기기로                           (BR-U2-82)
3. 결과 요약 { devices, succeeded, failed } 반환 (U3이 collect_runs에 기록)
```

필요한 Repository 메서드(U1 인터페이스에 추가):
- `ProfileRepository.listDeviceIdsWithProfile()`
- `NoticeRepository.listRetainedWithUnits()`: 보관 중인 공고 + 주택형 + 지구 ID
- `ReferenceDataRepository.loadIncomeThresholds()`, `listSupplyTypeStandards()`

## 4. 판정 결과 예시

**입력**: 부부(본인 1960-03-02, 배우자 1963-07-01), 세대주=본인, 무주택, 월소득 450만원, 총자산 2억, 자동차 1,500만원, 관심 지구=교산
**공고**: 하남교산 행복주택, 모집공고일 2026-09-15, 주택형 36㎡ `happy_senior`

| 조건 | 판정 | 사유 |
|---|---|---|
| 나이 | eligible | 만 65세 이상 → 두 분 중 만 66세인 분이 있어요 |
| 무주택 | eligible | 무주택이에요 |
| 소득 | eligible | 2인 가구 기준 645만 2,897원 이하 → 월 450만원 |
| 총자산 | eligible | 3억 4,500만원 이하 → 2억원 |
| 자동차 | eligible | 4,542만원 이하 → 1,500만원 |

→ 공고 eligible, inDistrict true, score 2 (임대 선호 `both`, 관심 면적 없음) → 피드 노출

## 5. 테스트 가능한 속성 (PBT-01)

| 컴포넌트 | 속성 | 범주 |
|---|---|---|
| 만 나이 | 기준일이 늦어지면 나이는 줄지 않는다. 생일 당일 나이 = 연도 차이 | Invariant |
| 만 나이 | 출생일 당일 나이 = 0 | Invariant |
| 판정기 공통 | 조건이 `"unknown"`이거나 필요한 프로필 값이 null이면 결과는 절대 ineligible이 아니다 (BR-U2-33) | Invariant |
| 프로필 정보 감소 | 프로필 필드 하나를 null로 바꾸면: eligible → {eligible, unknown}, ineligible → {ineligible, unknown} (모르는 정보가 늘어도 판정이 뒤집히지 않음) | Invariant |
| 소득·자산·자동차 | 금액만 늘리면 ineligible → eligible로 바뀌는 일은 없다 (단조성) | Invariant |
| 나이 | 출생일을 앞당기면(더 나이 들면) eligible → ineligible로 바뀌는 일은 없다 | Invariant |
| **가구 대칭성 (Q1)** | 본인·배우자를 맞바꾸고 세대주도 맞바꾸면 공고 판정·사유 판정값이 같다 (P2: 두 기기 같은 결과) | Invariant |
| 합성 | combineUnit·combineNotice는 입력 순서와 무관 | Commutativity |
| 합성 | combineNotice 결과 = 순서 eligible > unknown > ineligible에서의 최댓값, combineUnit = ineligible > unknown > eligible에서의 최댓값 | Oracle |
| 지구 매칭 | 텍스트에 공백을 넣거나 관계없는 문장을 덧붙여도 매칭 결과가 줄지 않는다 | Invariant |
| 지구 매칭 | 결과는 활성 지구의 부분집합, 중복 없음, sortOrder 순 | Invariant |
| 분류 | 모든 입력에 대해 정의된 코드 하나, 모든 코드는 라벨이 있다 | Invariant |
| 요건 확정 | `resolve(S, null) = S`, `resolve(S, S) = S` | Idempotence |
| 요건 확정 | 결과의 조건 키 집합 ⊇ S의 키 집합 (추출이 조건을 지우지 못함) | Invariant |
| 면적 구간 | 모든 면적(≥0)은 정확히 한 구간, 면적이 커지면 구간 순서도 같거나 커짐 | Invariant |
| 점수 | 0 ≤ score ≤ 2 | Invariant |
| 정렬 | 입력을 어떤 순서로 줘도 정렬 결과가 같다 (전순서) | Invariant |
| 노출 | `isVisible ⇔ verdict≠ineligible ∧ inDistrict ∧ status≠closed` | Oracle |
| 암호화 | `decrypt(encrypt(x)) = x`, 같은 x를 두 번 암호화하면 암호문이 다르다 | Round-trip |
| 코덱 | `decodeProfile(encodeProfile(p)) = p` | Round-trip |
| 재계산 서비스 | 같은 입력으로 두 번 재계산하면 저장되는 판정이 같다 (`computedAt` 제외) | Idempotence |
| 재계산 서비스 | 기기 하나의 복호화 실패가 다른 기기의 결과를 바꾸지 않는다 | Invariant |
| 재계산 서비스 (상태 기반, PBT-06) | 프로필 저장·공고 추가·삭제 명령을 무작위 순서로 실행해도, 저장된 판정 = 단순 모델(전체 다시 계산)의 결과 | Stateful |

**예시 기반 테스트로 반드시 고정할 핵심 시나리오** (PBT-10): §4 예시, 만 64세/65세 경계, 2인 가구 소득 경계(6,452,897원 이하/초과), 세대주=다른 가족, 수급자 + 소득 초과(복지 경로), 공공분양 60㎡ 초과 주택형의 소득 미적용, 민영 예치금 지역·면적 구간, 기준표 없는 연도, 분류 실패(other).

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

---

## 6. 변경 요청 2 (2026-10-17)

### 6.1 바뀌는 모듈

| 모듈 | 바뀌는 것 |
|---|---|
| `domain/regions.ts` (새) | 수도권 시·도·시군구 목록, `normalizeSido`, 인천 옛 구 변환표 — 입력(U4)·판별(U3)·판정이 공유 |
| `domain/profile.ts` | 스키마 버전 2, `savings.owner`, `prefs.regions`, `parseProfile`이 버전 1을 받으면 `migrateProfile` 후 검사 |
| `domain/profile-migrate.ts` (새) | `migrateProfile(v1 \| v2) → v2` (BR-U2-C1~5) |
| `eligibility/criteria/savings.ts` | 사유에 명의 문구 (BR-U2-C8) |
| `eligibility/area.ts` (새) | `inInterestArea(notice, prefs)` (BR-U2-C10~12) |
| `eligibility/engine.ts` | `judgeNotice`의 `inDistrict` 계산을 `inInterestArea`로 |
| `eligibility/visibility.ts` | 그대로 (`inDistrict` 입력 이름 유지, 뜻만 넓어짐) |
| `services/judgement-service.ts` · 저장소 | 공고 읽을 때 `regions`도 읽어 판정에 넘김 (DB 칸은 U3 마이그레이션) |

### 6.2 판정 흐름 변화

```text
프로필(버전 1 또는 2) ──migrateProfile──▶ 프로필 v2
공고(districtIds, regions) ─┐
                            ├─ judgeNotice ─▶ verdict(주택형 합성, 그대로)
프로필 v2 ──────────────────┘              └▶ inDistrict = 지구 일치 OR 시·군·구 일치
노출 K5 = verdict≠ineligible AND inDistrict AND 상태≠closed
```

### 6.3 테스트 가능한 속성 (PBT-01, 변경 2)

| ID | 대상 | 속성 | 종류 |
|---|---|---|---|
| P-C2-1 | `migrateProfile` | 두 번 옮겨도 한 번 옮긴 것과 같다. 버전 2 입력은 그대로 | Idempotence |
| P-C2-2 | `migrateProfile` + `judgeNotice` | 옮기기 전에 보이던 공고는 옮긴 뒤에도 보인다 (숨김이 늘지 않음 — "없음"→"모름") | Invariant |
| P-C2-3 | 통장 판정 | 통장 값이 같으면 `owner`만 달라도 모든 조건 판정이 같다 (사유 문구만 다를 수 있음) | Invariant |
| P-C2-4 | `inInterestArea` | 관심 지역(지구·시군구)을 더 고르면 관심 지역 안이던 공고는 계속 안이다 | Monotonicity |
| P-C2-5 | `inInterestArea` | 시·도 전체를 고르면 그 시·도의 모든 공고 지역이 안이다 | Invariant |
| P-C2-6 | `inInterestArea` | `regions`가 빈 프로필은 옛 규칙(지구 교집합)과 결과가 같다 | Model-based |
| P-C2-7 | 프로필 코덱 | 버전 2 프로필 직렬화 → 읽기 = 원래 값 (기존 왕복 속성에 새 칸 포함) | Round-trip |

**예시 테스트로 고정할 시나리오** (PBT-10): 엄마 휴대폰(배우자 명의) vs 아빠 휴대폰(본인 명의) 같은 공고·판정, 버전 1 "통장 없음" → 확인 필요, "경기 전체" 선택 시 수원시 공고 노출, "경기도 일원" 공고 + 성남시만 고름 → 노출, 서울 강서구만 고름 + 부천 대장 공고(지구 미선택) → 숨김.

---

## 7. 변경 요청 3 (2026-10-20) — 신혼 가구 판정 흐름

```text
judgeUnit(profile, unit)
  routes = routesFor(profile.householdKind, unit.supplyType)        BR-U2-D10
  senior → [own_type] → 지금 judgeUnit 그대로 (routes 칸 없음)        BR-U2-D2
  newlywed →
    각 route:
      req = unit.routeRequirements[route] ?? (route = general ? unit.requirements : STANDARD_ROUTE[route][공공|민영])
      조건: marriage → firstTime → homeless → residence → income(합계·맞벌이·추첨) → asset → car → savings(본인·배우자)
      verdict = combineUnit(조건)
    unit.verdict = best(routes)   unit.criteria = best route 조건       BR-U2-D11·D12
judgeNotice: 지금 그대로 (주택형 하나라도 충족 → 충족), inDistrict·노출 그대로
score: + 자녀 보너스 (newlywed만)                                    BR-U2-D42
```

### 7.1 예시 — 예비신혼 맞벌이 (P3)

가구: 예비신혼(2027-03 예정), 본인 월 420만원 + 배우자 380만원 = 800만원(맞벌이), 무주택, 집 가진 적 없음, 소득세 5년 있음, 본인 통장 2년·24회, 배우자 통장 없음. 공고: 민영 84㎡, 예비신혼 받음.

| 신청 방법 | 조건 | 판정 |
|---|---|---|
| 신혼부부 특공(민영) | 예비신혼 받음 ✔(입주 전 혼인신고), 무주택 ✔, 소득 800만원 ≤ 2인 160% ✔(우선공급 120% 안이면 안내), 통장 본인 ✔ | 충족 |
| 생애최초(민영) | 집 가진 적 없음 ✔, 소득세 5년 ✔, 혼인 중(예비) ✔, 소득 ≤ 160% ✔, 통장 ✔ | 충족 |
| 일반공급 | 통장 12개월 ✔, 예치금 지역·면적 기준(지금 규칙) | 충족 또는 확인 필요 |

→ 주택형 충족, 상세에 세 방법 모두 보임. 같은 공고가 "예비신혼 받지 않음"이면 신혼 특공 미충족, 생애최초·일반으로 충족.

### 7.2 테스트 가능한 속성 (PBT-01)

| # | 대상 | 속성 | 종류 |
|---|---|---|---|
| P-C3-1 | 판정 | **노부부 불변**: senior 가구 + 기존 공급유형 공고 → 변경 3 엔진 결과 = 변경 2 엔진 결과 (기존 코드를 테스트용으로 남겨 비교) | Invariant |
| P-C3-2 | 옮기기 | v1·v2 → v3 멱등, v3 결과는 v3 검증 통과, `householdKind = senior` | Idempotence |
| P-C3-3 | 판정 | 주택형 판정 = 신청 방법 판정 중 최선 (combine 순서와 일치) | Invariant |
| P-C3-4 | 소득 | 다른 값이 같을 때 소득을 낮추면 소득 조건이 나빠지지 않는다(미충족 → 확인 필요 → 충족 방향만) | Monotonicity |
| P-C3-5 | 통장 | 배우자 통장을 더하면 통장 조건이 나빠지지 않는다 | Monotonicity |
| P-C3-6 | 혼인 | 혼인신고일이 기준일에 가까울수록(기간이 짧을수록) 혼인 조건이 나빠지지 않는다 | Monotonicity |

---

## 8. 변경 요청 4 (2026-10-25) — 지역·대상 거르기

```text
judgeNotice(profile, notice)
  blocked = audienceBlocked(profile.householdKind, notice.audiences)      BR-U2-E10
  units = blocked
    ? 모든 주택형 → { verdict: ineligible, criteria: [audience 조건], routes?: [] }   BR-U2-E11
    : 지금 judgeUnit (routesFor 표: happy_senior·national_rental_senior는 신혼에 없음)   BR-U2-E22
  verdict = combineNotice(units)
  inDistrict = 관심 지구 겹침 || 공고 지역 r, 관심 p: 시·도 같고 (p 시·도 전체 || 시·군 같음)   BR-U2-E1
노출(isVisible) · 피드 · 알림: 그대로                                        BR-U2-E14
```

### 8.1 예시 — 신고된 9건 (신혼 가구, 관심: 부천대장·광명시흥 + 경기 과천·광명·군포·부천·안양·의왕)

U3가 지역·대상을 채운 뒤의 기대 결과:

| 공고 | 지역 (U3) | 대상 (U3) | 판정 | 피드 |
|---|---|---|---|---|
| 연천BIX 경기행복주택 기업체 기숙사 | 경기 연천군 | dormitory | 미충족 "기업체 기숙사 공고예요…" | 빠짐 (지역·대상 둘 다) |
| 아크메르 동탄 95·99 | 경기 화성시 | — | 지금대로 | 빠짐 (지역) |
| 경기남부 일반 매입임대 | 상세의 주택 목록 시·군 (못 찾으면 경기) | low_income | 미충족 "수급자·차상위 등…" | 빠짐 (대상) |
| 시흥하중 A1 신혼희망타운 (LH·청약홈) | 경기 시흥시 | newlywed | 지금대로 | 빠짐 (지역) |
| 구리갈매 S1 10년 공공임대 | 경기 구리시 | — | 지금대로 | 빠짐 (지역) |
| 시흥거모 S-1 공공분양 | 경기 시흥시 | — | 지금대로 | 빠짐 (지역) |
| 경기도형 창업특화주택 | 공고문 공급 위치 (못 찾으면 경기) | startup | 미충족 "창업한 분을 위한…" | 빠짐 (대상) |

같은 공고가 부모님 가구에서도 같은 이유로 빠진다(시흥하중 신혼희망타운은 지금도 노부부 미충족). "경기 전체"를 고른 가구라면 지역으로는 빠지지 않고 대상·판정만 따른다.

### 8.2 테스트 가능한 속성 (PBT-01)

| # | 대상 | 속성 | 종류 |
|---|---|---|---|
| P-C4-1 | 관심 지역 | 관심 지역·지구를 늘리면 `inDistrict`가 true → false로 바뀌지 않는다 | Monotonicity |
| P-C4-2 | 관심 지역 | 시·도까지만 공고(지구 없음)의 `inDistrict` = 그 시·도 전체 선택이 있음 | Invariant (oracle) |
| P-C4-3 | 대상 | `audienceBlocked` = 표 정의(대상 있음 ∧ 허용 대상 없음). 허용 대상을 더하면 막힘이 풀리기만 한다 | Invariant + Monotonicity |
| P-C4-4 | 대상 | 막힌 공고 → 공고 판정 미충족 → `isVisible` false (피드·알림 같은 결과) | Invariant |
| P-C4-5 | 노부부 | `audiences = ∅`이고 지역이 시·군까지 확인된 공고: 변경 4 엔진 = 변경 3 엔진 (변경 3 엔진을 테스트용으로 남김). `happy_unknown` 노부부 판정 = 같은 요건의 `happy_senior` 판정(이름 제외) | Invariant |
| P-C4-6 | 분류 | 제목에 고령자·어르신이 없으면 `*_senior`로 분류하지 않는다. 고령자 말을 더하면 `*_unknown` → `*_senior`만 바뀐다 | Invariant |

**예시 테스트로 고정할 시나리오** (PBT-10): 위 9건(지역·대상 채운 상태), "경기 전체" 선택 + 시·도까지만 공고 → 보임, 부천시만 + 시·도까지만 공고 → 숨김, 행복주택 청년·신혼·고령자 공고 → 두 가구 모두 보임, 은평 홀몸어르신 은빛주택 → 부모님 보임·신혼 숨김.

# U2 eligibility-engine — 도메인 엔티티

> 근거: U2 기능 설계 계획 답변 (Q1=A 가구 단위 판정 + 세대주, Q2=A 모집공고일 기준, Q3=A 유형 전부 정밀, Q4=A 공고 금액 우선 + 연도 기준표, Q5=A 4구간, Q6=B 선호 일치 우선)
> 모든 금액: 프로필·자산 기준은 **만원**, 소득 기준표는 **원**(공식표가 원 단위라 경계값 오차를 없애기 위해).
> 저장 형식(행)은 U1 `_shared/db/types.ts`를 따르고, 여기서는 그 안의 JSON 필드 구조를 정의한다.

---

## 1. 가구 프로필 `HouseholdProfile` (평문, 스키마 버전 1)

기기에는 이 객체 그대로, 서버에는 `money`를 뺀 나머지가 `device_profiles.data`에, `money`의 세 금액은 암호문 컬럼에 저장된다 (§6 코덱).
값을 모르면 `null` ("잘 모르겠어요" → 해당 조건 "확인 필요").

```ts
interface HouseholdProfile {
  schemaVersion: 1;
  self:   { birthDate: IsoDate | null };              // 이 기기 사용자
  spouse: { birthDate: IsoDate | null } | null;       // 배우자 없으면 null
  householdType: "couple" | "single" | "other";
  householdSize: number;                               // 세대원 수 (couple=2, single=1, other는 입력, 1~8)
  householdHead: "self" | "spouse" | "other" | null;   // ★ 추가 (OI-1, Q1=A) — 세대주는 누구인가
  residence: { sido: string | null; sigungu: string | null; years: number | null };
  housing:   { homeless: boolean | null; homelessYears: number | null; ownedCount: number | null };
  savings: {
    has: boolean | null;
    kind: "comprehensive" | "savings" | "deposit" | "installment" | null; // 주택청약종합저축/청약저축/청약예금/청약부금
    months: number | null;               // 가입 개월 수
    paymentCount: number | null;         // 납입 인정 횟수
    depositManwon: number | null;        // 예치금·납입 인정 금액(만원)
  };
  money: {
    monthlyIncome: number | null;        // 세대 월평균 소득 합계(만원)
    totalAsset: number | null;           // 세대 총자산(만원)
    carValue: number | null;             // 세대 자동차가액 합계(만원)
    spouseEarns: boolean | null;         // ★ 추가 — 배우자 소득 유무 (공공분양 맞벌이 기준)
  };
  welfare: "livelihood_or_medical" | "near_poverty" | "other_priority" | "none" | null;
                                         // ★ 추가 — 생계·의료급여 수급 / 차상위 / 국가유공자·장애인 등 / 해당 없음
  prefs: {
    districtIds: string[];               // 1개 이상
    areaBands: AreaBand[];               // 0개 이상 (0개 = 상관없음)
    tenure: "sale" | "rent" | "both";
    lowFloor: boolean;                   // 공고 데이터에 층 정보가 없어 1차에서는 점수에 쓰지 않음 (BR-U2-63)
  };
}
type AreaBand = "xs" | "s" | "m" | "l";   // ~40㎡ / 40~60 / 60~85 / 85~ (Q5=A)
```

★ 표시 4개는 requirements FR-4.2 초안에 없던 항목이다. 판정에 꼭 필요해서 추가했고, U4 마법사에 반영한다 (§8).

## 2. 요건 `Requirements` (주택형 단위)

키가 **없으면 그 조건 없음**, 값이 `"unknown"`이면 **조건은 있으나 내용을 알 수 없음**(→ 확인 필요).

```ts
interface Requirements {
  unclassified?: true;                  // 공급유형을 몰라 요건을 정할 수 없음 → 공고 전체 "확인 필요"
  age?: { minAge: number; who: "member" | "head" } | "unknown";
  homeless?: { minYears: number | null } | "unknown";
  income?: IncomeRequirement | "unknown";
  asset?: { maxManwon: number } | "unknown";
  car?: { maxManwon: number } | "unknown";
  savings?: SavingsRequirement | "unknown";
  residence?: { sidoIn: string[] } | "unknown";
  household?: { headRequired: boolean } | "unknown";
  welfare?: WelfareRequirement | "unknown";
}

interface IncomeRequirement {
  basis: "urban_worker" | "median";      // 도시근로자 월평균소득 / 기준 중위소득
  percent: number;                       // 기본 비율 (예: 70)
  percentBySize?: Record<number, number>;// 가구원수별 예외 (예: {1: 90, 2: 80})
  dualIncomePercent?: number;            // 배우자도 소득이 있을 때 비율 (공공분양 200)
  amountsWon?: Record<number, number>;   // 공고에 적힌 가구원수별 금액(원) — 있으면 기준표보다 우선 (Q4=A)
  appliesToAreaMaxM2?: number;           // 이 면적 이하 주택형에만 적용 (공공분양 60㎡)
}

interface SavingsRequirement {
  minMonths: number;
  minPayments?: number;
  depositRule?: "private_by_region_area"; // 민영주택 지역·면적별 예치금 (BR-U2-46)
  minDepositManwon?: number;
}

interface WelfareRequirement {
  anyOf: ("livelihood_or_medical" | "near_poverty" | "other_priority")[];
  orIncome?: IncomeRequirement;          // 수급자가 아니어도 이 소득 기준 이하면 가능 (예: 영구임대 2순위 50%)
}
```

## 3. 판정 결과

```ts
type Verdict = "eligible" | "ineligible" | "unknown";
type CriterionKey = "type" | "age" | "homeless" | "income" | "asset" | "car" | "savings" | "residence" | "household" | "welfare";

interface CriterionResult {
  key: CriterionKey;
  verdict: Verdict;
  reason: string;      // 화면용 한 줄, 예: "만 65세 이상 → 두 분 중 만 66세가 있어요"
  action?: string;     // 확인 필요일 때 할 일, 예: "설정에서 소득을 입력하면 정확히 알려 드려요"
}
interface UnitJudgement   { unitId: string; supplyType: string; verdict: Verdict; criteria: CriterionResult[] }
interface NoticeJudgement { noticeId: string; verdict: Verdict; inDistrict: boolean; score: number; units: UnitJudgement[] }
```

`judgements.detail`(U1 E11)에는 `{ baseDate, units: UnitJudgement[] }`를 저장한다.

## 4. 공급유형 코드 (Q3=A: 모두 정밀 판정)

SPEC §5의 7개 중 "국민임대·영구임대 고령자 우선공급"은 요건이 크게 달라 **2개 코드로 나눈다** (총 8개 + `other`).

| 코드 | 정식 명칭 | 쉬운 말 | 분양/임대 |
|---|---|---|---|
| `public_sale_general` | 공공분양 일반공급 (뉴:홈 등) | 공공 분양 아파트 | sale |
| `private_sale_general` | 민영주택 일반공급 | 민간 분양 아파트 | sale |
| `senior_welfare` | 고령자 복지주택 | 어르신 복지주택 (복지시설 함께) | rent |
| `national_rental_senior` | 국민임대 고령자 우선공급 | 오래 사는 임대 — 어르신 우선 물량 | rent |
| `permanent_rental_senior` | 영구임대 고령자 대상 | 아주 저렴한 임대 — 어르신 대상 | rent |
| `happy_senior` | 행복주택 고령자 계층 | 행복주택 — 어르신 몫 | rent |
| `integrated_rental` | 통합공공임대 | 소득 맞춤형 공공임대 | rent |
| `unranked` | 무순위·잔여세대 | 남은 집 추가 모집 | sale |
| `other` | 기타 공급 | 기타 | rent |

## 5. 기준 데이터 (시드 값)

### 5.1 지구 (E1) — `area_keywords` 컬럼 추가

| id | name | sido | sigungu | keywords (단독으로 매칭) | area_keywords (시군구가 같을 때만 매칭) |
|---|---|---|---|---|---|
| `wangsuk` | 남양주 왕숙 | 경기 | 남양주시 | 왕숙 | 진접읍, 진건읍, 일패동, 이패동, 퇴계원 |
| `gyosan` | 하남 교산 | 경기 | 하남시 | 교산 | 천현동, 교산동, 춘궁동, 상사창동, 하사창동, 항동 |
| `changneung` | 고양 창릉 | 경기 | 고양시 덕양구 | 창릉 | 용두동, 화전동, 도내동, 원흥동, 동산동 |
| `daejang` | 부천 대장 | 경기 | 부천시 | 부천대장 | 대장동, 오정동, 원종동 |
| `gyeyang` | 인천 계양 | 인천 | 계양구 | 인천계양, 계양테크노밸리 | 귤현동, 동양동, 박촌동, 병방동, 상야동 |
| `gwangmyeong_siheung` | 광명 시흥 | 경기 | 광명시, 시흥시 | 광명시흥 | 광명동, 옥길동, 가학동, 노온사동, 과림동, 무지내동 |

- "대장"·"계양"은 다른 지역 공고에도 흔해서(예: 성남 대장동, 계양구의 다른 단지) **단독 키워드로 쓰지 않는다**
- 법정동 목록은 기억·공개 자료 기반 초안이다. U3에서 실제 공고명으로 확인하고 고친다 (OI-U2-1)

### 5.2 소득 기준표 (E7) — 100% 금액만 저장, 비율은 계산

| 적용 연도 | 기준 | 1인 | 2인 | 3인 | 4인 | 5인 | 6인 | 7인 | 8인 |
|---|---|---|---|---|---|---|---|---|---|
| 2026 | 도시근로자 월평균소득 100% (2025년 통계) | 3,813,363 | 5,866,270 | 8,168,429 | 8,802,202 | 9,326,985 | 9,906,263 | 10,485,541 | – |
| 2026 | 기준 중위소득 100% | 2,564,238 | 4,199,292 | 5,359,036 | 6,494,738 | 7,556,719 | 8,555,952 | 9,515,150 | 10,474,348 |

- 출처: 마이홈포털 국민임대·통합공공임대 입주자격 페이지 (2026년도 적용, 2026-10-14 확인)
- 비율 금액 = `round(100% 금액 × 비율 / 100)` (원 단위 반올림). 검증: 2인 80% = 4,693,016원, 1인 120% = 4,576,036원, 3인 50% = 4,084,215원으로 마이홈 공식표와 일치
- 표에 없는 칸(도시근로자 8인 등) → 해당 조건 "확인 필요"

### 5.3 공급유형 표준 요건 (E6, `effective_from` 2026-01-01)

| 코드 | 나이 | 무주택 | 소득 | 총자산 | 자동차 | 통장 | 거주 | 세대주 | 복지 |
|---|---|---|---|---|---|---|---|---|---|
| `public_sale_general` | – | 필요 | 도시근로자 100%, 맞벌이 200%, **60㎡ 이하만** | unknown | unknown | 12개월·12회 | 서울·인천·경기 | – | – |
| `private_sale_general` | – | –(추첨은 유주택 가능) | – | – | – | 12개월 + 지역·면적별 예치금 | 서울·인천·경기 | – | – |
| `senior_welfare` | 65, 세대원 | 필요 | – | unknown | unknown | – | – | – | 생계·의료급여 수급 **또는** 소득 50%(1인 70, 2인 60) |
| `national_rental_senior` | 65, 세대원 | 필요 | 도시근로자 70% (1인 90, 2인 80) | 34,500 | 4,542 | – | – | – | – |
| `permanent_rental_senior` | 65, 세대원 | 필요 | – | unknown | unknown | – | – | – | 수급권자·차상위 **또는** 소득 50%(1인 70, 2인 60) |
| `happy_senior` | 65, 세대원 | 필요 | 도시근로자 100% (1인 120, 2인 110) | 34,500 | 4,542 | – | – | – | – |
| `integrated_rental` | – | 필요 | 기준 중위소득 150% (1인 170, 2인 160) | 34,500 | 4,542 | – | – | – | – |
| `unranked` | – | 필요 (2025.6 개정) | – | – | – | – | unknown (지자체가 단지별로 정함) | – | – |
| `other` | `unclassified: true` |

- **unknown으로 둔 값**: 2026년 공식 수치를 확인하지 못했거나 출처끼리 다른 값. 공고에서 추출한 값이 있으면 그 값을 쓰고, 없으면 "확인 필요"로 남는다 (놓치지 않기)
- **출처 간 불일치 처리**: 행복주택 고령자 자동차 기준은 출처에 따라 3,708만 원과 4,542만 원으로 갈린다. **더 너그러운 4,542만 원**을 쓴다. 기준을 넘는데 실제로는 됐어야 하는 경우(공고를 숨기는 오류)를 피하기 위해서다 (BR-U2-34)
- 출처: 마이홈포털(국민임대·통합공공임대·영구임대), LH청약플러스 행복주택 입주자격, SH 공공분양 일반공급 안내, 무순위 청약 개편 보도(2025) — business-rules.md 끝에 링크
- 매년 개발자가 시드 마이그레이션으로 갱신한다 (Q4=A)

## 6. 저장 형식 변환 (ProfileCodec, C8)

| 평문 필드 | 서버 저장 |
|---|---|
| `money.monthlyIncome / totalAsset / carValue` | `enc_monthly_income / enc_total_asset / enc_car_value` (AmountCipher, null이면 null) |
| `money.spouseEarns` 및 나머지 전부 | `data` (JSON) |
| `schemaVersion` | `schema_version` |

암호문 형식: `v{키버전}.{IV 12바이트 base64url}.{암호문 base64url}`, 평문은 금액의 10진 문자열 (U1 NFR-U1-15).

## 7. U1 스키마 변경 (U2 마이그레이션 `0006`)

| 대상 | 변경 | 이유 |
|---|---|---|
| `districts` | `area_keywords text[] not null default '{}'` 추가 | 오매칭 방지 (§5.1) |
| `income_asset_thresholds` | `amount_manwon` → `amount_won bigint`, `kind`는 `monthly_income`만 사용, `basis`는 `urban_worker` / `median` | 원 단위 공식표 경계 오차 제거. 자산 기준은 공급유형 표준 요건에 둠 |
| `supply_type_standards` | 8개 코드 시드 (`other` 갱신) | §4·§5.3 |

U1 계약 K1 변경이므로 U1 `domain-entities.md` E7에 변경 메모를 남긴다.

## 8. U4로 넘기는 입력 항목 변경

| 항목 | 마법사 질문 (초안) | 선택지 |
|---|---|---|
| `householdHead` | "주민등록상 세대주는 누구인가요?" | 나 / 배우자 / 다른 가족 / 잘 모르겠어요 |
| `householdSize` | (`other`일 때만) "주민등록에 함께 올라 있는 가족은 모두 몇 명인가요?" | 1~8 |
| `money.spouseEarns` | "배우자분도 일하거나 사업 소득이 있나요?" | 예 / 아니오 / 잘 모르겠어요 |
| `welfare` | "아래 중 해당하는 것이 있나요?" | 생계·의료급여 수급 / 차상위 계층 / 국가유공자·장애인 등 / 해당 없음 / 잘 모르겠어요 |
| `savings.kind`, `depositManwon` | 통장 종류, 통장에 들어 있는 금액 | 4종 + 모름 / 만원 입력 |

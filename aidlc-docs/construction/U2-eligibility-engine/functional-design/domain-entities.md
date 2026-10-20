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

---

## 변경 요청 2 (2026-10-17) — 프로필 v2 · 공고 지역 · 관심 지역

> 근거: requirements.md §9, U2 변경 2 계획 Q1~Q3 = A. 아래가 앞 절과 다르면 이 절을 따른다.

### 프로필 스키마 버전 1 → 2

```ts
type SavingsOwner = "self" | "spouse" | "both";

interface HouseholdProfile {          // schemaVersion: 2
  // …(나머지 그대로)
  savings: {
    has: boolean | null;
    owner: SavingsOwner | null;        // 새 칸. has가 true일 때만 의미. 혼자 사는 가구는 "self"
    kind: SavingsKind | null;
    months: number | null;
    paymentCount: number | null;
    depositManwon: number | null;      // 두 분 다 있으면 신청에 쓸(가입이 더 오래된) 통장 하나의 값
  };
  prefs: {
    districtIds: string[];             // 3기 신도시 지구 (그대로)
    regions: RegionPick[];             // 새 칸. 관심 시·군·구
    areaBands: AreaBand[];
    tenure: …; lowFloor: …;            // 그대로
  };
}

type CapitalSido = "서울" | "경기" | "인천";
interface RegionPick {
  sido: CapitalSido;
  sigungu: string | null;              // null = 그 시·도 전체 (Q1=A)
}
```

| 칸 | 검사 |
|---|---|
| `savings.owner` | `has`가 true가 아니면 null. `spouse`·`both`는 배우자가 있는 가구만 |
| `prefs.regions` | 시·도는 수도권 3개, 시·군·구는 공용 목록(`domain/regions.ts`) 안. 같은 항목 중복 없음. 시·도 전체를 고르면 그 시·도의 시·군·구 항목은 두지 않는다(정리해서 저장) |
| 관심 지역 개수 | `districtIds.length + regions.length ≥ 1` |

### 판정 입력 공고에 지역 추가

```ts
interface NoticeForJudgement {
  // …(그대로)
  districtIds: string[];
  regions: NoticeRegion[];             // 새 칸. U3가 판별해 저장 (0개면 지역 매칭 없음 — 지구만)
}
interface NoticeRegion {
  sido: CapitalSido;
  sigungu: string | null;              // null = 시·도까지만 확인됨 (예: "경기도 일원")
}
```

### 판정 결과의 `inDistrict` — 이름 그대로, 뜻 확장

`NoticeJudgement.inDistrict`(DB `judgements.in_district`)는 이제 **"관심 지역 안"** 을 뜻한다 = 관심 지구 안 **또는** 관심 시·군·구 안. 이름을 바꾸지 않는 이유: DB 칸·발송 SQL·피드 API 등 22개 파일이 쓰고 있어 바꾸는 위험이 크다.

### 공용 지역 데이터 `domain/regions.ts` (FR-C2-9)

| 항목 | 내용 |
|---|---|
| `CAPITAL_SIDO` | 서울·경기·인천 |
| `SIGUNGU_BY_SIDO` | 지금 `src/features/profile/model/regions.ts`의 수도권 목록을 옮김 (서울 25구, 경기 31시·군, 인천 11개 — 2026-07 개편 반영). 입력 화면·U3 판별·판정이 이 목록 하나를 쓴다 |
| `normalizeSido` | "서울특별시·서울시·서울" → 서울, "경기도" → 경기, "인천광역시" → 인천 (BR-U2-51과 같은 함수로 합침) |
| `INCHEON_LEGACY` | 인천 옛 구 → 새 구 (Q3=A): 동구 → 제물포구, 중구 → 동으로 가름(영종·용유·무의 쪽 동 → 영종구, 나머지 → 제물포구), 서구 → 동으로 가름(검단 쪽 동 → 검단구, 나머지 → 서해구). 동 목록은 U3 기능 설계에서 확정 |
| 경기 구 | "수원시 영통구"처럼 시 아래 구는 **시**로 본다 (목록이 시 단위) |

### 입력 화면에서 바뀌는 질문 (U4가 구현)

| 칸 | 질문 | 보기 |
|---|---|---|
| `savings.has` + `owner` (부부) | "부부 중 청약통장이 있는 분이 있나요?" | 나 / 배우자 / 두 분 다 / 없음 / 잘 모르겠어요 |
| `savings.has` (혼자) | "청약통장이 있으신가요?" | 예 / 아니오 / 잘 모르겠어요 |
| `prefs.regions` | 지구 카드 아래 "다른 지역" | 시·도 → (시·도 전체 / 시·군·구 여러 개) |

---

## 변경 요청 3 (2026-10-20) — 가구 종류 · 신청 방법 · 신혼 조건

> 계획: `plans/U2-eligibility-engine-change-3-functional-design-plan.md` (Q1~Q7 모두 A). 앞 절과 다르면 이 절을 따른다.

### 프로필 v3

```ts
const PROFILE_SCHEMA_VERSION = 3;
type HouseholdKind = "senior" | "newlywed";

interface HouseholdProfile {
  schemaVersion: 3;
  householdKind: HouseholdKind;          // 새 칸 — v2 이하는 "senior"로 옮긴다
  // …v2 칸 그대로 (self, spouse, householdType, householdSize, householdHead, residence, housing, savings, money, welfare, prefs)
  money: {
    monthlyIncome: number | null;        // 부부 합계 (만원, 서버 암호화) — 신혼 가구는 아래 둘의 합
    spouseMonthlyIncome?: number | null; // 신혼만 — 배우자 월소득 (서버 암호화). spouseEarns = (값 > 0)
    // totalAsset, carValue, spouseEarns 그대로
  };
  newlywed: NewlywedInfo | null;         // senior는 null
}

interface NewlywedInfo {
  marriage: "engaged" | "married" | null;   // 예비신혼 / 혼인신고 함 / 모름
  marriageDate: IsoDate | null;             // 혼인신고일, 예비신혼은 예정일
  children: number | null;                  // 태아 포함, 0~10 (점수·안내에만, Q7=A)
  neverOwnedHome: boolean | null;           // 세대원 모두 지금까지 집을 가진 적 없음 (생애최초)
  incomeTax5y: boolean | null;              // 5년 이상 소득세를 낸 분이 있음 (생애최초)
  spouseSavings: SavingsInfo | null;        // 배우자 통장 (Q4=A). 본인 통장은 profile.savings (owner "self")
}
```

| 규칙 | |
|---|---|
| 옮기기 | v1 → v2(변경 2) → v3: `householdKind = "senior"`, `newlywed = null`, `spouseMonthlyIncome` 없음. 멱등 (P-C3-2) |
| 검증 | newlywed 가구는 배우자(또는 예정 배우자) 있음, `newlywed` 필수, `savings.owner`는 null 또는 "self". senior 가구는 `newlywed = null` |
| 서버 저장 | `spouseMonthlyIncome`도 다른 금액처럼 암호화 (U1·U4 코드 단계에서 칸 추가) |

### 신청 방법 (Q1=A)

```ts
type ApplyRoute =
  | "own_type"          // 노부부: 주택형 공급유형 그대로 (지금 판정)
  | "newlywed_special"  // 신혼부부 특별공급
  | "first_time"        // 생애최초 특별공급
  | "general"           // 일반공급 (주택형 공급유형의 표준 요건)
  | "newlywed_hope"     // 신혼희망타운
  | "rental_newlywed";  // 신혼부부용 임대 (행복주택 신혼부부 계층, 국민임대 신혼부부 우선 등)

/** 가구 종류 × 주택형 공급유형 → 판정할 신청 방법 (BR-U2-D10) */
function routesFor(kind: HouseholdKind, supplyType: SupplyTypeCode): ApplyRoute[];
```

| 공급유형 | senior | newlywed |
|---|---|---|
| public_sale_general (공공분양) | own_type | newlywed_special(국민), first_time(국민), general |
| private_sale_general (민영) | own_type | newlywed_special(민영), first_time(민영), general |
| newlywed_hope_town (**새 코드**, "신혼희망타운") | own_type → 혼인 조건 미충족 | newlywed_hope |
| happy_senior (행복주택) | own_type | rental_newlywed(행복주택) |
| national_rental_senior (국민임대) | own_type | rental_newlywed(국민임대) |
| integrated_rental (통합공공임대) | own_type | general |
| unranked (무순위) | own_type | general |
| senior_welfare, permanent_rental_senior | own_type | 없음 → 미충족 "어르신 대상 주택이에요" |
| other | own_type | general(요건 모름 → 확인 필요) |

### 새 요건 키

```ts
interface Requirements {
  // …기존 키 그대로
  marriage?: { maxYears: number; engagedAllowed: boolean | "unknown" } | "unknown";
  firstTime?: { neverOwned: true; incomeTaxYears: number; marriedOrChildRequired: boolean } | "unknown";
}
interface IncomeRequirement {
  // …기존 그대로 (basis, percent, dualIncomePercent 등)
  overLottery?: { realEstateMaxManwon: number };  // 기준을 넘어도 부동산 가액이 이하면 추첨 (BR-U2-D24)
}
```

### 입력과 결과

```ts
interface UnitForJudgement {
  // …기존 그대로
  /** 공고문에서 뽑은 신청 방법별 요건 (U3). 없으면 표준 요건 */
  routeRequirements?: Partial<Record<ApplyRoute, Requirements>>;
}

interface RouteJudgement {
  route: ApplyRoute;
  verdict: Verdict;
  criteria: CriterionResult[];
  /** 통장 조건을 채운 통장 (Q4=A): "self" | "spouse" */
  savingsBy?: "self" | "spouse";
}

interface UnitJudgement {
  // unitId, supplyType 그대로
  verdict: Verdict;                 // = 신청 방법 중 가장 좋은 판정 (충족 > 확인 필요 > 미충족)
  criteria: CriterionResult[];      // = 가장 좋은 신청 방법의 조건 (지금 화면과 호환)
  routes?: RouteJudgement[];        // newlywed만. senior는 없음 → 저장 형식이 지금과 같다
}
```

`CriterionKey`에 `marriage`, `firstTime` 추가.

### 신혼 표준 요건 (기준 데이터, effective_from 2026-06-15)

| 신청 방법 | 요건 | 출처·확인 |
|---|---|---|
| newlywed_special (국민·민영 같음) | marriage {7년, 예비신혼 "unknown"}, homeless, income {urban_worker 140%, 배우자 소득 160%, overLottery 부동산 33,100만원}, savings 국민 {6개월·6회} / 민영 {6개월, 지역별 예치금} | 「주택공급에 관한 규칙」 제41조 (2026-06-15 시행) ✅, 부동산 3억 3,100만원은 2026 민영 공고문 ✅ |
| first_time 민영 | firstTime {neverOwned, 5년, 혼인 또는 미혼 자녀}, homeless, income {130% 우선 · 160%까지 일반 → 160%, overLottery 33,100}, savings {12개월, 예치금} | 2026-03 민영 입주자모집공고문 ✅ |
| first_time 국민 | firstTime {…}, homeless, income {130%}, asset "unknown", savings {12개월·12회, 선납금 600만원} | 2020 개정 보도(우선 100%·일반 130%) — **⚠ 2026 원문 미확인**: 코드 단계에서 공고문으로 확인, 확인 못 하면 income "unknown" |
| general | 주택형 공급유형의 지금 표준 요건 그대로 (public/private_sale_general 등) | 기존 |
| newlywed_hope | marriage {7년, 예비신혼 true}, homeless, income "unknown", asset "unknown" | 소득 130%·자산 3억 6,200만원은 민간 정리 글만 있음 → **확인 필요로 둠** |
| rental_newlywed | marriage {7년, 예비신혼 "unknown"}, homeless, income "unknown", asset "unknown", car "unknown" | 행복주택·국민임대 신혼 기준 2026 원문 미확인 → **확인 필요로 둠** |

- Q6=A(표준 기준으로 판정)는 **원문으로 확인된 값에만** 적용한다. 확인하지 못한 값은 "확인 필요"로 두고 공고문 추출(U3)이 채운다 — 틀린 숫자로 숨기지 않기(놓치지 않기 원칙)

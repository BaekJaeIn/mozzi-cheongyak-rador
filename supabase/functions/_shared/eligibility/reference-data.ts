// 기준 데이터 원본 (U2 domain-entities §5). 마이그레이션 0006의 시드는 이 값과 같아야 한다
// (reference-data.test.ts가 SQL과 대조). 매년 갱신 절차는 README "연간 갱신".
import type { DistrictRule } from "../domain/district-matcher.ts";
import type { Requirements } from "../domain/requirements.ts";
import type { SupplyTypeCode } from "../domain/supply-types.ts";
import type { IncomeThreshold } from "./income-table.ts";

export interface DistrictSeed extends DistrictRule {
  name: string;
  sido: string;
}

export const DISTRICTS: readonly DistrictSeed[] = [
  { id: "wangsuk", name: "남양주 왕숙", sido: "경기", sigungu: ["남양주시"], keywords: ["왕숙"], areaKeywords: ["진접읍", "진건읍", "일패동", "이패동", "퇴계원"], active: true, sortOrder: 1 },
  { id: "gyosan", name: "하남 교산", sido: "경기", sigungu: ["하남시"], keywords: ["교산"], areaKeywords: ["천현동", "교산동", "춘궁동", "상사창동", "하사창동", "항동"], active: true, sortOrder: 2 },
  { id: "changneung", name: "고양 창릉", sido: "경기", sigungu: ["고양시 덕양구"], keywords: ["창릉"], areaKeywords: ["용두동", "화전동", "도내동", "원흥동", "동산동"], active: true, sortOrder: 3 },
  { id: "daejang", name: "부천 대장", sido: "경기", sigungu: ["부천시"], keywords: ["부천대장"], areaKeywords: ["대장동", "오정동", "원종동"], active: true, sortOrder: 4 },
  { id: "gyeyang", name: "인천 계양", sido: "인천", sigungu: ["계양구"], keywords: ["인천계양", "계양테크노밸리"], areaKeywords: ["귤현동", "동양동", "박촌동", "병방동", "상야동"], active: true, sortOrder: 5 },
  { id: "gwangmyeong_siheung", name: "광명 시흥", sido: "경기", sigungu: ["광명시", "시흥시"], keywords: ["광명시흥"], areaKeywords: ["광명동", "옥길동", "가학동", "노온사동", "과림동", "무지내동"], active: true, sortOrder: 6 },
];

// 2026년도 적용 (마이홈포털 국민임대·통합공공임대 입주자격, 2026-10-14 확인) — 100% 금액(원)
const URBAN_2026 = [3_813_363, 5_866_270, 8_168_429, 8_802_202, 9_326_985, 9_906_263, 10_485_541];
const MEDIAN_2026 = [2_564_238, 4_199_292, 5_359_036, 6_494_738, 7_556_719, 8_555_952, 9_515_150, 10_474_348];

export const INCOME_THRESHOLDS: readonly IncomeThreshold[] = [
  ...URBAN_2026.map((amountWon, i) => ({ year: 2026, basis: "urban_worker" as const, householdSize: i + 1, amountWon })),
  ...MEDIAN_2026.map((amountWon, i) => ({ year: 2026, basis: "median" as const, householdSize: i + 1, amountWon })),
];

const SENIOR_AGE = { minAge: 65, who: "member" } as const;
const HOMELESS = { minYears: null } as const;
const CAPITAL_AREA = { sidoIn: ["서울", "인천", "경기"] };
const INCOME_50_ADJ = { basis: "urban_worker", percent: 50, percentBySize: { 1: 70, 2: 60 } } as const;

/** 공급유형 표준 요건 (U2 domain-entities §5.3, effective_from 2026-01-01) */
export const STANDARD_REQUIREMENTS: Readonly<Record<SupplyTypeCode, Requirements>> = {
  public_sale_general: {
    homeless: HOMELESS,
    income: { basis: "urban_worker", percent: 100, dualIncomePercent: 200, appliesToAreaMaxM2: 60 },
    asset: "unknown",
    car: "unknown",
    savings: { minMonths: 12, minPayments: 12 },
    residence: CAPITAL_AREA,
  },
  private_sale_general: {
    savings: { minMonths: 12, depositRule: "private_by_region_area" },
    residence: CAPITAL_AREA,
  },
  senior_welfare: {
    age: SENIOR_AGE,
    homeless: HOMELESS,
    asset: "unknown",
    car: "unknown",
    welfare: { anyOf: ["livelihood_or_medical"], orIncome: INCOME_50_ADJ },
  },
  national_rental_senior: {
    age: SENIOR_AGE,
    homeless: HOMELESS,
    income: { basis: "urban_worker", percent: 70, percentBySize: { 1: 90, 2: 80 } },
    asset: { maxManwon: 34_500 },
    car: { maxManwon: 4_542 },
  },
  permanent_rental_senior: {
    age: SENIOR_AGE,
    homeless: HOMELESS,
    asset: "unknown",
    car: "unknown",
    welfare: { anyOf: ["livelihood_or_medical", "near_poverty"], orIncome: INCOME_50_ADJ },
  },
  happy_senior: {
    age: SENIOR_AGE,
    homeless: HOMELESS,
    income: { basis: "urban_worker", percent: 100, percentBySize: { 1: 120, 2: 110 } },
    asset: { maxManwon: 34_500 },
    car: { maxManwon: 4_542 }, // 출처 3,708 vs 4,542 → 너그러운 값 (BR-U2-34)
  },
  integrated_rental: {
    homeless: HOMELESS,
    income: { basis: "median", percent: 150, percentBySize: { 1: 170, 2: 160 } },
    asset: { maxManwon: 34_500 },
    car: { maxManwon: 4_542 },
  },
  unranked: {
    homeless: HOMELESS,
    residence: "unknown",
  },
  other: { unclassified: true },
};

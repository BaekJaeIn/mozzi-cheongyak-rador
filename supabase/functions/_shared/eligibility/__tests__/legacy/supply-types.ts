// 변경 요청 3 전 공급유형 분류 고정본 (커밋 fc1dc5f) — 테스트 전용, P-U3-D1 비교 기준. 고치지 않는다.
// 공급유형 코드·라벨과 분류 규칙 (U2 domain-entities §4, BR-U2-10~19)
import type { SourceCode } from "../../../db/types.ts";
import type { Tenure } from "../../../domain/profile.ts";

export type SupplyTypeCode =
  | "public_sale_general"
  | "private_sale_general"
  | "senior_welfare"
  | "national_rental_senior"
  | "permanent_rental_senior"
  | "happy_senior"
  | "integrated_rental"
  | "unranked"
  | "other";

export interface SupplyTypeLabel {
  formal: string;
  plain: string;
  tenure: Tenure;
}

export const SUPPLY_TYPES: Readonly<Record<SupplyTypeCode, SupplyTypeLabel>> = {
  public_sale_general: { formal: "공공분양 일반공급", plain: "공공 분양 아파트", tenure: "sale" },
  private_sale_general: { formal: "민영주택 일반공급", plain: "민간 분양 아파트", tenure: "sale" },
  senior_welfare: { formal: "고령자 복지주택", plain: "어르신 복지주택 (복지시설 함께)", tenure: "rent" },
  national_rental_senior: { formal: "국민임대 고령자 우선공급", plain: "오래 사는 임대 — 어르신 우선 물량", tenure: "rent" },
  permanent_rental_senior: { formal: "영구임대 고령자 대상", plain: "아주 저렴한 임대 — 어르신 대상", tenure: "rent" },
  happy_senior: { formal: "행복주택 고령자 계층", plain: "행복주택 — 어르신 몫", tenure: "rent" },
  integrated_rental: { formal: "통합공공임대", plain: "소득 맞춤형 공공임대", tenure: "rent" },
  unranked: { formal: "무순위·잔여세대", plain: "남은 집 추가 모집", tenure: "sale" },
  other: { formal: "기타 공급", plain: "기타", tenure: "rent" },
};

export const SUPPLY_TYPE_CODES = Object.keys(SUPPLY_TYPES) as SupplyTypeCode[];

// 위에서부터 처음 맞는 규칙을 쓴다 (순서가 중요: 고령자복지주택 → 영구임대 등)
const RULES: readonly [readonly string[], SupplyTypeCode][] = [
  [["무순위", "잔여세대", "계약취소", "취소후재공급"], "unranked"], // BR-U2-10
  [["고령자복지주택"], "senior_welfare"], // BR-U2-11
  [["영구임대"], "permanent_rental_senior"], // BR-U2-12
  [["국민임대"], "national_rental_senior"], // BR-U2-13
  [["행복주택"], "happy_senior"], // BR-U2-14, 19a
  [["통합공공임대"], "integrated_rental"], // BR-U2-15
  [["공공분양", "국민주택", "뉴:홈", "뉴홈", "나눔형", "선택형", "일반형"], "public_sale_general"], // BR-U2-16
  [["민영"], "private_sale_general"], // BR-U2-17
];

export function compactText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, "");
}

/** 원천 공급유형 문자열 + 공고명으로 공급유형을 정한다. 항상 코드 하나를 돌려준다 (BR-U2-19). */
export function classifySupplyType(input: { text: string; source?: SourceCode | null }): SupplyTypeCode {
  const text = compactText(input.text);
  for (const [words, code] of RULES) {
    if (words.some((w) => text.includes(compactText(w)))) return code;
  }
  if (input.source === "applyhome") return "private_sale_general"; // BR-U2-17
  return "other"; // BR-U2-18
}

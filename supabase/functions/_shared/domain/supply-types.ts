// 공급유형 코드·라벨과 분류 규칙 (U2 domain-entities §4, BR-U2-10~19)
import type { SourceCode } from "../db/types.ts";
import type { Tenure } from "./profile.ts";

export type SupplyTypeCode =
  | "public_sale_general"
  | "private_sale_general"
  | "senior_welfare"
  | "national_rental_senior"
  | "permanent_rental_senior"
  | "happy_senior"
  | "national_rental_unknown" // 변경 4 BR-U2-E20 계층 모름
  | "happy_unknown" // 변경 4 BR-U2-E20 계층 모름
  | "integrated_rental"
  | "newlywed_hope_town"
  | "newlywed_special_supply"
  | "first_time_supply"
  | "rental_newlywed_supply"
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
  // 변경 4 BR-U2-E20·E21: 제목에 계층이 없는 국민임대·행복주택 — 표준 요건은 고령자 줄과 같다
  national_rental_unknown: { formal: "국민임대", plain: "국민임대 (계층은 공고문 확인)", tenure: "rent" },
  happy_unknown: { formal: "행복주택", plain: "행복주택 (계층은 공고문 확인)", tenure: "rent" },
  integrated_rental: { formal: "통합공공임대", plain: "소득 맞춤형 공공임대", tenure: "rent" },
  newlywed_hope_town: { formal: "신혼희망타운", plain: "신혼부부 전용 공공주택", tenure: "sale" }, // 변경 3 BR-U2-D14
  // 변경 3 BR-U2-D50: 공고문에서 따로 뽑은 신혼·생애최초 물량 줄 (분류 BR-U3-D1)
  newlywed_special_supply: { formal: "신혼부부 특별공급", plain: "신혼부부 몫 분양", tenure: "sale" },
  first_time_supply: { formal: "생애최초 특별공급", plain: "처음 집 사는 분 몫 분양", tenure: "sale" },
  rental_newlywed_supply: { formal: "신혼부부 계층 임대", plain: "신혼부부 몫 임대", tenure: "rent" },
  unranked: { formal: "무순위·잔여세대", plain: "남은 집 추가 모집", tenure: "sale" },
  other: { formal: "기타 공급", plain: "기타", tenure: "rent" },
};

export const SUPPLY_TYPE_CODES = Object.keys(SUPPLY_TYPES) as SupplyTypeCode[];

// 위에서부터 처음 맞는 규칙을 쓴다 (순서가 중요: 고령자복지주택 → 영구임대 등)
const RULES: readonly [readonly string[], SupplyTypeCode][] = [
  [["무순위", "잔여세대", "계약취소", "취소후재공급"], "unranked"], // BR-U2-10
  [["고령자복지주택"], "senior_welfare"], // BR-U2-11
  [["영구임대"], "permanent_rental_senior"], // BR-U2-12
  [["국민임대"], "national_rental_unknown"], // BR-U2-13, 변경 4 E20 — 고령자 말이 있으면 national_rental_senior
  [["행복주택"], "happy_unknown"], // BR-U2-14, 19a, 변경 4 E20 — 고령자 말이 있으면 happy_senior
  [["통합공공임대"], "integrated_rental"], // BR-U2-15
  [["공공분양", "국민주택", "뉴:홈", "뉴홈", "나눔형", "선택형", "일반형"], "public_sale_general"], // BR-U2-16
  [["민영"], "private_sale_general"], // BR-U2-17
];

export function compactText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, "");
}

/** 원천 공급유형 문자열 + 공고명으로 공급유형을 정한다. 항상 코드 하나를 돌려준다 (BR-U2-19). */
/** 변경 3 BR-U3-D1: 신혼희망타운 다음, 기존 임대·분양 규칙보다 먼저 보는 신혼·생애최초 물량 */
const RENTAL_WORDS = ["행복주택", "국민임대", "영구임대", "매입임대", "전세임대", "공공임대"];
function classifyNewlywedSupply(text: string): SupplyTypeCode | null {
  if (text.includes("신혼희망타운")) return "newlywed_hope_town";
  if (text.includes("신혼") && RENTAL_WORDS.some((w) => text.includes(w))) return "rental_newlywed_supply";
  if (text.includes("신혼부부")) return "newlywed_special_supply";
  if (text.includes("생애최초")) return "first_time_supply";
  return null;
}

/** 변경 4 BR-U2-E20: 고령자 계층이 확인된 국민임대·행복주택 */
const SENIOR_WORDS = ["고령자", "어르신"];
const SENIOR_TIER: Partial<Record<SupplyTypeCode, SupplyTypeCode>> = {
  national_rental_unknown: "national_rental_senior",
  happy_unknown: "happy_senior",
};

export function classifySupplyType(input: { text: string; source?: SourceCode | null }): SupplyTypeCode {
  const text = compactText(input.text);
  // 무순위·고령자복지주택이 먼저 (BR-U2-10·11), 그다음 신혼·생애최초 물량 (BR-U3-D1)
  for (const [words, code] of RULES.slice(0, 2)) {
    if (words.some((w) => text.includes(compactText(w)))) return code;
  }
  const newlywed = classifyNewlywedSupply(text);
  if (newlywed) return newlywed;
  for (const [words, code] of RULES.slice(2)) {
    if (!words.some((w) => text.includes(compactText(w)))) continue;
    const senior = SENIOR_TIER[code];
    return senior && SENIOR_WORDS.some((w) => text.includes(w)) ? senior : code;
  }
  if (input.source === "applyhome") return "private_sale_general"; // BR-U2-17
  return "other"; // BR-U2-18
}

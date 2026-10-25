// 신청 방법 (변경 3 Q1=A, BR-U2-D10·D13) — 가구 종류 × 주택형 공급유형 → 판정할 신청 방법과 그 요건
import type { HouseholdKind } from "../domain/profile.ts";
import type { Requirements } from "../domain/requirements.ts";
import type { SupplyTypeCode } from "../domain/supply-types.ts";
import { type SaleKind, STANDARD_ROUTE_REQUIREMENTS } from "./reference-data.ts";

export type ApplyRoute =
  | "own_type" // 노부부: 주택형 공급유형 그대로 (변경 3 전 판정)
  | "newlywed_special" // 신혼부부 특별공급
  | "first_time" // 생애최초 특별공급
  | "general" // 일반공급 (주택형 공급유형의 표준·공고 요건)
  | "newlywed_hope" // 신혼희망타운
  | "rental_newlywed"; // 신혼부부용 임대

export const APPLY_ROUTES: readonly ApplyRoute[] = ["own_type", "newlywed_special", "first_time", "general", "newlywed_hope", "rental_newlywed"];

export const ROUTE_LABELS: Readonly<Record<ApplyRoute, string>> = {
  own_type: "이 주택형",
  newlywed_special: "신혼부부 특별공급",
  first_time: "생애최초 특별공급",
  general: "일반공급",
  newlywed_hope: "신혼희망타운",
  rental_newlywed: "신혼부부 몫 임대",
};

/** 신혼 가구가 쓸 수 없는 어르신 대상 공급유형 (BR-U2-D11). 변경 4 BR-U2-E22: 고령자 계층으로 확인된 국민임대·행복주택도 */
const SENIOR_ONLY: ReadonlySet<SupplyTypeCode> = new Set(["senior_welfare", "permanent_rental_senior", "national_rental_senior", "happy_senior"]);

/** 공고문에서 따로 뽑은 신혼·생애최초 물량 줄 → 신청 방법 (BR-U2-D50·D51). 노부부 가구는 신청 방법 없음 */
export const NEWLYWED_ONLY_ROUTE: Readonly<Partial<Record<SupplyTypeCode, ApplyRoute>>> = {
  newlywed_special_supply: "newlywed_special",
  first_time_supply: "first_time",
  rental_newlywed_supply: "rental_newlywed",
};

export function isNewlywedOnlySupply(supplyType: SupplyTypeCode): boolean {
  return NEWLYWED_ONLY_ROUTE[supplyType] !== undefined;
}

/** 가구 종류 × 공급유형 → 신청 방법 (domain-entities 표). 순서 = 같은 판정일 때 앞을 고른다 (BR-U2-D12) */
export function routesFor(kind: HouseholdKind, supplyType: SupplyTypeCode): ApplyRoute[] {
  if (kind === "senior") return isNewlywedOnlySupply(supplyType) ? [] : ["own_type"]; // BR-U2-D2·D51
  const only = NEWLYWED_ONLY_ROUTE[supplyType];
  if (only) return [only];
  switch (supplyType) {
    case "public_sale_general":
    case "private_sale_general":
      return ["newlywed_special", "first_time", "general"];
    case "newlywed_hope_town":
      return ["newlywed_hope"];
    case "happy_unknown":
    case "national_rental_unknown":
      return ["rental_newlywed"]; // 변경 4 BR-U2-E22: 계층 모름만 신혼 몫으로 본다
    case "integrated_rental":
    case "unranked":
    case "other":
      return ["general"];
    default:
      return SENIOR_ONLY.has(supplyType) ? [] : ["general"];
  }
}

/** 공공(국민주택)·민영 구분 — 민영 분양만 private */
export function saleKindOf(supplyType: SupplyTypeCode): SaleKind {
  return supplyType === "private_sale_general" ? "private" : "public";
}
// 참고: 신혼·생애최초 물량 줄(newlywed_special_supply 등)은 공공/민영을 줄만으로 알 수 없어 표준은 공공 값 — 공고문 값이 덮어쓴다

/** 신청 방법의 표준 요건. own_type·general은 주택형 요건을 그대로 쓴다 (BR-U2-D13) */
export function standardRouteRequirements(route: ApplyRoute, supplyType: SupplyTypeCode, unitRequirements: Requirements): Requirements {
  switch (route) {
    case "own_type":
    case "general":
      return unitRequirements;
    case "newlywed_special":
      return STANDARD_ROUTE_REQUIREMENTS.newlywed_special[saleKindOf(supplyType)];
    case "first_time":
      return STANDARD_ROUTE_REQUIREMENTS.first_time[saleKindOf(supplyType)];
    case "newlywed_hope":
      return STANDARD_ROUTE_REQUIREMENTS.newlywed_hope;
    case "rental_newlywed":
      return STANDARD_ROUTE_REQUIREMENTS.rental_newlywed;
  }
}

/** 표준 ⊕ 공고문 (키 단위 덮어쓰기, BR-U2-D52). 공고문이 분류 불가면 공고문 그대로 */
export function mergeRequirements(standard: Requirements, notice: Requirements): Requirements {
  if (notice.unclassified) return notice;
  return { ...standard, ...notice };
}

/**
 * 신청 방법의 요건 (BR-U2-D13·D52). fromNotice = 공고문 값인지 (사유 꼬리 BR-U2-D40).
 * 신혼·생애최초 물량 줄은 그 줄의 공고 요건이 표준을 덮어쓴다 — 공고문에서 온 키는 noticeKeys로 알려 준다
 */
export function routeRequirements(
  route: ApplyRoute,
  unit: { supplyType: SupplyTypeCode; requirements: Requirements; routeRequirements?: Partial<Record<ApplyRoute, Requirements>> },
): { requirements: Requirements; fromNotice: boolean; noticeKeys?: ReadonlySet<string> } {
  const fromNotice = unit.routeRequirements?.[route];
  if (fromNotice) return { requirements: fromNotice, fromNotice: true };
  if (NEWLYWED_ONLY_ROUTE[unit.supplyType] === route) {
    const standard = standardRouteRequirements(route, unit.supplyType, {});
    return { requirements: mergeRequirements(standard, unit.requirements), fromNotice: false, noticeKeys: new Set(Object.keys(unit.requirements)) };
  }
  return { requirements: standardRouteRequirements(route, unit.supplyType, unit.requirements), fromNotice: route === "general" || route === "own_type" };
}

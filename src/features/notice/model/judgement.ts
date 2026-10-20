// 판정 이유 보이기 — 공급유형별 묶기, 내 금액 붙이기, 한 줄 요약 (BR-U5-85~92, Q7=A·Q8=A)
// 변경 3: 신청 방법별 판정(신혼 가구), 카드 신청 방법 한 줄, 가구 종류별 볼 점 절 (BR-U5-D1~D31)
import type { HouseholdKind, HouseholdProfile } from "@shared/domain/profile.ts";
import { APPLY_ROUTES, type ApplyRoute, ROUTE_LABELS } from "@shared/eligibility/routes.ts";
import type { CriterionKey, CriterionResult, RouteJudgement, UnitJudgement, Verdict } from "@shared/eligibility/types.ts";
import type { RouteHint } from "@shared/feed/visible.ts";
import { formatManwon } from "@/features/profile/model/amount";
import type { GroupId } from "@/features/profile/model/steps";
import type { UnitInfo } from "./api-types";
import { compareArea } from "./display";

export interface JudgementGroup {
  supplyType: string;
  plain: string;
  formal: string;
  verdict: Verdict;
  unitIds: string[];
  /** 묶인 주택형들의 면적 (작은 순) */
  areas: (number | null)[];
  unitLabels: (string | null)[];
  criteria: CriterionResult[];
  /** 신청 방법별 판정 — 신혼 가구만, 가장 좋은 방법 먼저 (BR-U5-D10·D11). 노부부는 빈 목록 */
  routes: RouteView[];
}

export interface RouteView {
  route: ApplyRoute;
  label: string;
  verdict: Verdict;
  criteria: CriterionResult[];
}

const VERDICT_ORDER: Readonly<Record<Verdict, number>> = { eligible: 0, unknown: 1, ineligible: 2 };

/** 판정 → 방법 표 순서 (BR-U5-D11) */
export function sortRoutes(routes: readonly RouteJudgement[]): RouteView[] {
  return [...routes]
    .sort((a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || APPLY_ROUTES.indexOf(a.route) - APPLY_ROUTES.indexOf(b.route))
    .map((r) => ({ route: r.route, label: ROUTE_LABELS[r.route], verdict: r.verdict, criteria: r.criteria }));
}

/** 조건 줄이 "같다"의 기준: 키·판정·코드·사유·행동·내 금액 종류 (BR-U5-86) */
export function criteriaSignature(criteria: readonly CriterionResult[]): string {
  return JSON.stringify(criteria.map((c) => [c.key, c.verdict, c.code, c.reason, c.action ?? null, c.userValue ?? null]));
}

export function groupJudgement(units: readonly UnitJudgement[], info: readonly UnitInfo[]): JudgementGroup[] {
  const infoById = new Map(info.map((u) => [u.id, u]));
  const labelOf = (code: string) => info.find((u) => u.supplyType === code);
  const byType = new Map<string, UnitJudgement[]>();
  for (const u of units) byType.set(u.supplyType, [...(byType.get(u.supplyType) ?? []), u]);

  const make = (members: UnitJudgement[]): JudgementGroup => {
    const first = members[0]!;
    const sorted = [...members].sort(
      (a, b) =>
        compareArea(infoById.get(a.unitId)?.exclusiveAreaM2 ?? null, infoById.get(b.unitId)?.exclusiveAreaM2 ?? null) ||
        (a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0),
    );
    const label = labelOf(first.supplyType);
    return {
      supplyType: first.supplyType,
      plain: label?.plain ?? first.supplyType,
      formal: label?.formal ?? first.supplyType,
      verdict: first.verdict,
      unitIds: sorted.map((u) => u.unitId),
      areas: sorted.map((u) => infoById.get(u.unitId)?.exclusiveAreaM2 ?? null),
      unitLabels: sorted.map((u) => infoById.get(u.unitId)?.label ?? null),
      criteria: first.criteria,
      routes: sortRoutes(first.routes ?? []),
    };
  };

  const groups: JudgementGroup[] = [];
  for (const members of byType.values()) {
    // 신청 방법별 결과도 같아야 한 묶음 (BR-U5-D13). 노부부는 routes가 없어 지금 기준과 같다
    const routesSig = (u: UnitJudgement) => (u.routes ? JSON.stringify(sortRoutes(u.routes).map((r) => [r.route, r.verdict, criteriaSignature(r.criteria)])) : "");
    const sig = (u: UnitJudgement) => `${u.verdict}|${criteriaSignature(u.criteria)}|${routesSig(u)}`;
    const same = members.every((u) => sig(u) === sig(members[0]!));
    if (same) groups.push(make(members));
    else for (const u of members) groups.push(make([u]));
  }
  return groups.sort(
    (a, b) =>
      VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] ||
      a.plain.localeCompare(b.plain, "ko") ||
      compareArea(a.areas[0] ?? null, b.areas[0] ?? null) ||
      (a.unitIds[0]! < b.unitIds[0]! ? -1 : a.unitIds[0]! > b.unitIds[0]! ? 1 : 0),
  );
}

/** 펼칠 묶음과 접을 묶음 (BR-U5-87): 충족·확인 필요가 없으면 미충족도 펼친다 */
export function splitGroups(groups: readonly JudgementGroup[]): { open: JudgementGroup[]; folded: JudgementGroup[] } {
  const open = groups.filter((g) => g.verdict !== "ineligible");
  const folded = groups.filter((g) => g.verdict === "ineligible");
  return open.length === 0 ? { open: folded, folded: [] } : { open, folded };
}

/** "→ 입력하신 금액 월 450만원" — 기기 프로필에만 있는 값 (BR-U5-90). 서버로 보내지 않는다. 신혼 가구 소득은 두 분 합계 (BR-U5-D31) */
export function withUserValue(criterion: CriterionResult, profile: HouseholdProfile | null): string | null {
  if (!criterion.userValue || !profile) return null;
  const value = profile.money[criterion.userValue];
  if (value === null || value === undefined) return null;
  const amount = formatManwon(value);
  if (criterion.userValue !== "monthlyIncome") return `입력하신 금액 ${amount}`;
  return `입력하신 금액 월 ${amount}${profile.householdKind === "newlywed" ? "(두 분 합계)" : ""}`;
}

/** 자녀 안내 (BR-U5-D14, U2 BR-U2-D42): 자녀가 있고 신혼 특공·신혼희망타운으로 신청할 수 있으면(미충족 아님) */
export const CHILD_HINT = "자녀가 있으면 순위가 올라갈 수 있어요";

export function showChildHint(route: RouteView, profile: HouseholdProfile | null): boolean {
  const children = profile?.householdKind === "newlywed" ? (profile.newlywed?.children ?? 0) : 0;
  return children > 0 && (route.route === "newlywed_special" || route.route === "newlywed_hope") && route.verdict !== "ineligible";
}

/** "으로"/"로": 받침이 없거나 ㄹ이면 "로" (임대로, 특별공급으로) */
export function withEuro(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim = code >= 0 && code < 11172 ? code % 28 : 0;
  return word + (batchim === 0 || batchim === 8 ? "로" : "으로");
}

/** 카드 신청 방법 한 줄 (BR-U5-D20·D21): 최대 2개 + "외 N개" */
export function routeHintText(hint: RouteHint): string {
  const names = hint.routes.map((r) => ROUTE_LABELS[r]);
  const shown = names.slice(0, 2).join("·") + (names.length > 2 ? ` 외 ${names.length - 2}개` : "");
  return hint.verdict === "eligible" ? `${withEuro(shown)} 신청할 수 있어 보여요` : `${withEuro(shown)} 신청할 수 있는지 확인이 필요해요`;
}

/** 요약 볼 점 절 (BR-U5-D1~D3): 내 가구 종류 것만. text null = 신혼 볼 점 준비 중 */
export function summarySection(
  summary: { forSeniorCouple: string; forNewlywed?: string },
  kind: HouseholdKind | null,
): { title: string; text: string | null } {
  if (kind === "newlywed") return { title: "신혼부부가 볼 점", text: summary.forNewlywed ?? null };
  return { title: "노부부 가구가 볼 점", text: summary.forSeniorCouple };
}

export const NEWLYWED_SUMMARY_PENDING = "신혼부부가 볼 점은 준비 중이에요";

export const VERDICT_SUMMARY: Readonly<Record<Verdict, string>> = {
  eligible: "이 공고에 신청할 수 있어 보여요",
  unknown: "신청할 수 있는지 확인이 필요해요",
  ineligible: "지금 조건으로는 신청이 어려워요",
};

export const VERDICT_MARK: Readonly<Record<Verdict, { symbol: string; text: string }>> = {
  eligible: { symbol: "✔", text: "맞음" },
  ineligible: { symbol: "✖", text: "안 맞음" },
  unknown: { symbol: "?", text: "확인 필요" },
};

export const DISCLAIMER = "참고용이며 최종 자격은 공고문과 기관 확인이 필요합니다";

const SETTINGS_GROUP: Readonly<Record<CriterionKey, GroupId | null>> = {
  type: null,
  age: "basic",
  household: "basic",
  residence: "residence",
  homeless: "housing",
  savings: "savings",
  income: "money",
  asset: "money",
  car: "money",
  welfare: "money",
  marriage: "marriage", // 변경 3 "결혼·자녀" 그룹 (BR-U5-D30)
  firstTime: "housing",
};

/** "설정에서 …" 행동 문구에 다는 고치기 링크 (BR-U5-89). 그 밖의 행동 문구는 링크 없음 */
export function settingsLinkFor(criterion: CriterionResult): string | null {
  if (!criterion.action?.startsWith("설정에서")) return null;
  const group = SETTINGS_GROUP[criterion.key];
  return group ? `/profile/edit/${group}` : "/settings";
}

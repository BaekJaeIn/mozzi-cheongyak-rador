// 변경 3 전 사본 (P-U5-D1 노부부 불변 비교용) — 고치지 말 것
// 판정 이유 보이기 — 공급유형별 묶기, 내 금액 붙이기, 한 줄 요약 (BR-U5-85~92, Q7=A·Q8=A)
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import type { CriterionKey, CriterionResult, UnitJudgement, Verdict } from "@shared/eligibility/types.ts";
import { formatManwon } from "@/features/profile/model/amount";
import type { GroupId } from "@/features/profile/model/steps";
import type { UnitInfo } from "../../api-types";
import { compareArea } from "../../display";

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
}

const VERDICT_ORDER: Readonly<Record<Verdict, number>> = { eligible: 0, unknown: 1, ineligible: 2 };

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
    };
  };

  const groups: JudgementGroup[] = [];
  for (const members of byType.values()) {
    const sig = (u: UnitJudgement) => `${u.verdict}|${criteriaSignature(u.criteria)}`;
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

/** "→ 입력하신 금액 월 450만원" — 기기 프로필에만 있는 값 (BR-U5-90). 서버로 보내지 않는다 */
export function withUserValue(criterion: CriterionResult, profile: HouseholdProfile | null): string | null {
  if (!criterion.userValue || !profile) return null;
  const value = profile.money[criterion.userValue];
  if (value === null || value === undefined) return null;
  const amount = formatManwon(value);
  return `입력하신 금액 ${criterion.userValue === "monthlyIncome" ? `월 ${amount}` : amount}`;
}

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
  marriage: "basic", // 변경 3 — 신혼 정보 그룹은 U4에서 정함
  firstTime: "housing",
};

/** "설정에서 …" 행동 문구에 다는 고치기 링크 (BR-U5-89). 그 밖의 행동 문구는 링크 없음 */
export function settingsLinkFor(criterion: CriterionResult): string | null {
  if (!criterion.action?.startsWith("설정에서")) return null;
  const group = SETTINGS_GROUP[criterion.key];
  return group ? `/profile/edit/${group}` : "/settings";
}

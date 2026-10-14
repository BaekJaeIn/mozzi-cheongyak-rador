// 판정 엔진 (BR-U2-30~59)
import type { IsoDate } from "../domain/dates.ts";
import type { HouseholdProfile } from "../domain/profile.ts";
import type { IncomeTable } from "./income-table.ts";
import { MSG, ACTION } from "./messages.ts";
import { evaluateAge } from "./criteria/age.ts";
import { type CriterionContext, result } from "./criteria/common.ts";
import { evaluateIncome } from "./criteria/income.ts";
import { evaluateSavings } from "./criteria/savings.ts";
import { evaluateAsset, evaluateCar, evaluateHomeless, evaluateHousehold, evaluateResidence } from "./criteria/simple.ts";
import { evaluateWelfare } from "./criteria/welfare.ts";
import { score } from "./scoring.ts";
import type { CriterionResult, NoticeForJudgement, NoticeJudgement, UnitForJudgement, UnitJudgement, Verdict } from "./types.ts";

export interface EligibilityReference {
  incomeTable: IncomeTable;
}

/** BR-U2-55: 조건 하나라도 미충족 → 미충족, 아니면 확인 필요가 있으면 확인 필요, 아니면 충족 (조건 없음 → 충족) */
export function combineUnit(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.includes("ineligible")) return "ineligible";
  if (verdicts.includes("unknown")) return "unknown";
  return "eligible";
}

/** BR-U2-57: 주택형 하나라도 충족 → 충족, 아니면 확인 필요가 있으면 확인 필요, 주택형 없음 → 확인 필요 */
export function combineNotice(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.length === 0) return "unknown";
  if (verdicts.includes("eligible")) return "eligible";
  if (verdicts.includes("unknown")) return "unknown";
  return "ineligible";
}

/** BR-U2-35: 모집공고일 ?? 접수 시작일 ?? 판정일 */
export function baseDateOf(notice: Pick<NoticeForJudgement, "announcedAt" | "applyStart">, asOf: IsoDate): IsoDate {
  return notice.announcedAt ?? notice.applyStart ?? asOf;
}

export function judgeUnit(
  profile: HouseholdProfile,
  unit: UnitForJudgement,
  ref: EligibilityReference,
  baseDate: IsoDate,
): UnitJudgement {
  const req = unit.requirements;
  if (req.unclassified) {
    // BR-U2-56
    const criteria = [result("type", "unknown", "type_unclassified", MSG.unclassified, { action: ACTION.checkNotice })];
    return { unitId: unit.id, supplyType: unit.supplyType, verdict: "unknown", criteria };
  }

  const ctx: CriterionContext = {
    profile,
    baseDate,
    year: Number(baseDate.slice(0, 4)),
    areaM2: unit.exclusiveAreaM2,
    incomeTable: ref.incomeTable,
    headRequired: req.household !== undefined && req.household !== "unknown" && req.household.headRequired,
  };

  const criteria = [
    evaluateAge(req.age, ctx),
    evaluateHousehold(req.household, ctx),
    evaluateHomeless(req.homeless, ctx),
    evaluateResidence(req.residence, ctx),
    evaluateWelfare(req.welfare, ctx),
    evaluateIncome(req.income, ctx),
    evaluateAsset(req.asset, ctx),
    evaluateCar(req.car, ctx),
    evaluateSavings(req.savings, ctx),
  ].filter((c): c is CriterionResult => c !== null); // BR-U2-30

  return { unitId: unit.id, supplyType: unit.supplyType, verdict: combineUnit(criteria.map((c) => c.verdict)), criteria };
}

export function judgeNotice(
  profile: HouseholdProfile,
  notice: NoticeForJudgement,
  ref: EligibilityReference,
  asOf: IsoDate,
): NoticeJudgement {
  const baseDate = baseDateOf(notice, asOf);
  const units = notice.units.map((u) => judgeUnit(profile, u, ref, baseDate));
  const wanted = new Set(profile.prefs.districtIds);
  return {
    noticeId: notice.id,
    verdict: combineNotice(units.map((u) => u.verdict)),
    inDistrict: notice.districtIds.some((id) => wanted.has(id)), // BR-U2-58
    score: score(notice, profile.prefs),
    baseDate,
    units,
  };
}

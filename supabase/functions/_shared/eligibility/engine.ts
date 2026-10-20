// 판정 엔진 (BR-U2-30~59, 변경 3 BR-U2-D2·D10~D13·D42)
// 노부부 가구는 judgeOwnType(변경 3 전과 같은 코드), 신혼 가구는 신청 방법별로 판정한다
import type { IsoDate } from "../domain/dates.ts";
import type { HouseholdProfile } from "../domain/profile.ts";
import type { IncomeTable } from "./income-table.ts";
import { MSG, ACTION, MSG_NEWLYWED } from "./messages.ts";
import { evaluateAge } from "./criteria/age.ts";
import { type CriterionContext, result } from "./criteria/common.ts";
import { evaluateIncome } from "./criteria/income.ts";
import { evaluateCoupleSavings, evaluateSavings } from "./criteria/savings.ts";
import { evaluateFirstTime } from "./criteria/first-time.ts";
import { evaluateMarriage } from "./criteria/marriage.ts";
import type { SupplyTypeCode } from "../domain/supply-types.ts";
import type { Requirements } from "../domain/requirements.ts";
import { type ApplyRoute, routeRequirements, routesFor } from "./routes.ts";
import { evaluateAsset, evaluateCar, evaluateHomeless, evaluateHousehold, evaluateResidence } from "./criteria/simple.ts";
import { evaluateWelfare } from "./criteria/welfare.ts";
import { inInterestArea } from "./area.ts";
import { score } from "./scoring.ts";
import type { CriterionResult, NoticeForJudgement, NoticeJudgement, RouteJudgement, UnitForJudgement, UnitJudgement, Verdict } from "./types.ts";

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
  return profile.householdKind === "newlywed" ? judgeNewlywedUnit(profile, unit, ref, baseDate) : judgeOwnType(profile, unit, ref, baseDate);
}

/** 노부부 가구 — 변경 3 전 judgeUnit 그대로 (BR-U2-D2, P-C3-1) */
function judgeOwnType(
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
    // 변경 3: 혼인·생애최초 요건은 신혼 대상 주택에만 있다 — 기존 요건에는 키가 없어 결과가 그대로 (P-C3-1), 신혼희망타운은 노부부에게 미충족 (BR-U2-D14)
    evaluateMarriage(req.marriage, ctx),
    evaluateFirstTime(req.firstTime, ctx),
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

const RANK: Readonly<Record<Verdict, number>> = { eligible: 2, unknown: 1, ineligible: 0 };

/** 표준 요건으로 판정한 금액·통장 조건에 붙이는 꼬리 (BR-U2-D40) */
const STANDARD_NOTE_KEYS = new Set(["income", "asset", "car", "savings"]);

function contextFor(profile: HouseholdProfile, unit: UnitForJudgement, ref: EligibilityReference, baseDate: IsoDate, req: Requirements): CriterionContext {
  return {
    profile,
    baseDate,
    year: Number(baseDate.slice(0, 4)),
    areaM2: unit.exclusiveAreaM2,
    incomeTable: ref.incomeTable,
    headRequired: req.household !== undefined && req.household !== "unknown" && req.household.headRequired,
  };
}

function judgeRoute(profile: HouseholdProfile, unit: UnitForJudgement, ref: EligibilityReference, baseDate: IsoDate, route: ApplyRoute): RouteJudgement {
  const { requirements: req, fromNotice } = routeRequirements(route, { ...unit, supplyType: unit.supplyType as SupplyTypeCode });
  if (req.unclassified) {
    const criteria = [result("type", "unknown", "type_unclassified", MSG.unclassified, { action: ACTION.checkNotice })];
    return { route, verdict: "unknown", criteria };
  }
  const ctx = contextFor(profile, unit, ref, baseDate, req);
  const savings = evaluateCoupleSavings(req.savings, ctx);
  const criteria = [
    evaluateMarriage(req.marriage, ctx),
    evaluateFirstTime(req.firstTime, ctx),
    evaluateAge(req.age, ctx),
    evaluateHousehold(req.household, ctx),
    evaluateHomeless(req.homeless, ctx),
    evaluateResidence(req.residence, ctx),
    evaluateWelfare(req.welfare, ctx),
    evaluateIncome(req.income, ctx),
    evaluateAsset(req.asset, ctx),
    evaluateCar(req.car, ctx),
    savings.criterion,
  ]
    .filter((c): c is CriterionResult => c !== null)
    .map((c) =>
      !fromNotice && STANDARD_NOTE_KEYS.has(c.key) && !c.code.endsWith("_requirement_unknown")
        ? { ...c, reason: `${c.reason} (${MSG_NEWLYWED.standardNote})` }
        : c,
    );
  const judged: RouteJudgement = { route, verdict: combineUnit(criteria.map((c) => c.verdict)), criteria };
  return savings.criterion && savings.by ? { ...judged, savingsBy: savings.by } : judged;
}

/** 신혼 가구 — 신청 방법별 판정, 주택형 = 가장 좋은 방법 (BR-U2-D10~D12) */
function judgeNewlywedUnit(profile: HouseholdProfile, unit: UnitForJudgement, ref: EligibilityReference, baseDate: IsoDate): UnitJudgement {
  const routes = routesFor("newlywed", unit.supplyType as SupplyTypeCode).map((r) => judgeRoute(profile, unit, ref, baseDate, r));
  if (routes.length === 0) {
    const criteria = [result("type", "ineligible", "type_senior_only", MSG_NEWLYWED.seniorOnly)];
    return { unitId: unit.id, supplyType: unit.supplyType, verdict: "ineligible", criteria, routes: [] };
  }
  const best = routes.reduce((a, b) => (RANK[b.verdict] > RANK[a.verdict] ? b : a));
  return { unitId: unit.id, supplyType: unit.supplyType, verdict: best.verdict, criteria: best.criteria, routes };
}

/**
 * 자녀 보너스 (BR-U2-D42): 신혼 가구에 자녀가 있으면, 신혼 특공·신혼희망타운으로 신청할 수 있는(미충족이 아닌) 공고에
 * 자녀 1명당 +1 (최대 +2). 자녀가 있으면 순위가 올라가는 공고를 앞에 둔다. 판정에는 쓰지 않는다
 */
export function childBonus(profile: HouseholdProfile, units: readonly UnitJudgement[]): number {
  const children = profile.householdKind === "newlywed" ? (profile.newlywed?.children ?? 0) : 0;
  if (children <= 0) return 0;
  const childRoute = units.some((u) => u.routes?.some((r) => (r.route === "newlywed_special" || r.route === "newlywed_hope") && r.verdict !== "ineligible"));
  return childRoute ? Math.min(children, 2) : 0;
}

export function judgeNotice(
  profile: HouseholdProfile,
  notice: NoticeForJudgement,
  ref: EligibilityReference,
  asOf: IsoDate,
): NoticeJudgement {
  const baseDate = baseDateOf(notice, asOf);
  const units = notice.units.map((u) => judgeUnit(profile, u, ref, baseDate));
  return {
    noticeId: notice.id,
    verdict: combineNotice(units.map((u) => u.verdict)),
    inDistrict: inInterestArea(notice, profile.prefs), // 관심 지역 안 (변경 2 BR-U2-C12)
    score: score(notice, profile.prefs) + childBonus(profile, units),
    baseDate,
    units,
  };
}

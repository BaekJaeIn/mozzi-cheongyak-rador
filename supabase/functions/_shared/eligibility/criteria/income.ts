// 소득 (BR-U2-42~45a, Q4=A 공고 금액 우선)
import type { IncomeRequirement, Requirements } from "../../domain/requirements.ts";
import { incomeLimitWon } from "../income-table.ts";
import { ACTION, MSG, MSG_NEWLYWED } from "../messages.ts";
import type { CriterionResult, Verdict } from "../types.ts";
import { type CriterionContext, result, unknownRequirement } from "./common.ts";

export interface IncomeOutcome {
  verdict: Verdict;
  code: string;
  reason: string;
  action?: string;
}

/** 소득 판정 핵심 (복지 조건의 소득 경로에서도 사용). 면적 적용 범위는 호출 쪽에서 처리한다. */
export function judgeIncome(req: IncomeRequirement, ctx: CriterionContext): IncomeOutcome {
  const size = ctx.profile.householdSize;
  const percent = req.percentBySize?.[size] ?? req.percent; // BR-U2-42
  const fromNotice = req.amountsWon?.[size];
  const limit = fromNotice ?? incomeLimitWon(ctx.incomeTable, ctx.year, req.basis, size, percent); // BR-U2-43
  if (limit === null) {
    return { verdict: "unknown", code: "income_table_missing", reason: MSG.incomeTableMissing, action: ACTION.tableMissing }; // BR-U2-44
  }

  const dualLimit =
    req.dualIncomePercent !== undefined
      ? incomeLimitWon(ctx.incomeTable, ctx.year, req.basis, size, req.dualIncomePercent)
      : null;
  const reason = dualLimit !== null ? MSG.incomeDual(size, limit, dualLimit) : MSG.income(size, limit);

  const income = ctx.profile.money.monthlyIncome;
  if (income === null) {
    return { verdict: "unknown", code: "income_unknown", reason, action: ACTION.enterInSettings("월 소득") };
  }
  const incomeWon = income * 10_000; // BR-U2-45
  // 변경 3: 기준을 넘어도 추첨이 있으면 확인 필요 (BR-U2-D24) — 이 칸이 없는 요건(노부부 표준)은 지금과 같다
  const over = (): IncomeOutcome =>
    req.overLottery
      ? { verdict: "unknown", code: "income_over_lottery", reason: MSG_NEWLYWED.incomeLottery(req.overLottery.realEstateMaxManwon), action: ACTION.checkRealEstate }
      : { verdict: "ineligible", code: "income_over", reason };
  // 변경 3: 우선공급 기준 안이면 안내만 붙인다 (BR-U2-D25)
  const withPriority = (outcome: IncomeOutcome): IncomeOutcome => {
    if (req.priorityPercent === undefined) return outcome;
    const dual = ctx.profile.money.spouseEarns === true && req.priorityDualIncomePercent !== undefined;
    const p = incomeLimitWon(ctx.incomeTable, ctx.year, req.basis, size, dual ? req.priorityDualIncomePercent! : req.priorityPercent);
    return p !== null && incomeWon <= p ? { ...outcome, reason: `${outcome.reason}. ${MSG_NEWLYWED.incomePriority}` } : outcome;
  };
  if (incomeWon <= limit) return withPriority({ verdict: "eligible", code: "income_ok", reason });

  if (req.dualIncomePercent !== undefined) {
    const spouseEarns = ctx.profile.money.spouseEarns;
    if (spouseEarns === false) return over();
    if (dualLimit === null) {
      return { verdict: "unknown", code: "income_table_missing", reason, action: ACTION.tableMissing };
    }
    if (incomeWon <= dualLimit) {
      return spouseEarns === true
        ? withPriority({ verdict: "eligible", code: "income_ok_dual", reason })
        : { verdict: "unknown", code: "income_spouse_unknown", reason, action: ACTION.enterInSettings("배우자 소득 여부") };
    }
  }
  return over();
}

export function evaluateIncome(req: Requirements["income"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("income");

  // BR-U2-45a: 면적 적용 범위
  if (req.appliesToAreaMaxM2 !== undefined && ctx.areaM2 !== null && ctx.areaM2 > req.appliesToAreaMaxM2) return null;

  const outcome = judgeIncome(req, ctx);
  const userValue = { userValue: "monthlyIncome" as const };
  if (req.appliesToAreaMaxM2 !== undefined && ctx.areaM2 === null && outcome.verdict === "ineligible") {
    return result("income", "unknown", "income_area_unknown", outcome.reason, { action: ACTION.areaDependent, ...userValue });
  }
  return result("income", outcome.verdict, outcome.code, outcome.reason, {
    ...(outcome.action ? { action: outcome.action } : {}),
    ...userValue,
  });
}

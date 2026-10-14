// 복지 대상 (BR-U2-53·54): 수급자 등 해당 또는 소득 경로
import type { Requirements } from "../../domain/requirements.ts";
import { ACTION, MSG, WELFARE_LABEL } from "../messages.ts";
import type { CriterionResult } from "../types.ts";
import { type CriterionContext, result, unknownRequirement } from "./common.ts";
import { judgeIncome } from "./income.ts";

export function evaluateWelfare(req: Requirements["welfare"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("welfare");

  const kinds = req.anyOf.map((k) => WELFARE_LABEL[k] ?? k).join("·");
  // 사유는 요건만으로 만든다 (소득 금액과 무관)
  const incomeReason = req.orIncome ? judgeIncome(req.orIncome, { ...ctx, profile: { ...ctx.profile, money: { ...ctx.profile.money, monthlyIncome: null } } }).reason : null;
  const reason = incomeReason ? `${MSG.welfareNeed(kinds)} (${incomeReason})` : `${kinds} 대상만 신청할 수 있어요`;
  const userValue = req.orIncome ? { userValue: "monthlyIncome" as const } : {};

  const status = ctx.profile.welfare;
  if (status !== null && status !== "none" && (req.anyOf as string[]).includes(status)) {
    return result("welfare", "eligible", "welfare_ok", reason);
  }
  if (status === "other_priority") {
    return result("welfare", "unknown", "welfare_other_priority", reason, { action: ACTION.otherPriority }); // BR-U2-54
  }

  const viaIncome = req.orIncome ? judgeIncome(req.orIncome, ctx) : null;
  if (status === "none") {
    if (!viaIncome) return result("welfare", "ineligible", "welfare_none", reason);
    return result("welfare", viaIncome.verdict, `welfare_${viaIncome.code}`, reason, {
      ...(viaIncome.action ? { action: viaIncome.action } : {}),
      ...userValue,
    });
  }
  // status === null 이거나 anyOf에 없는 수급 상태(예: 차상위인데 수급만 허용)
  if (status === null) {
    if (viaIncome?.verdict === "eligible") return result("welfare", "eligible", "welfare_income_ok", reason, userValue);
    return result("welfare", "unknown", "welfare_unknown", reason, { action: ACTION.enterInSettings("수급 여부"), ...userValue });
  }
  if (!viaIncome) return result("welfare", "ineligible", "welfare_not_listed", reason);
  return result("welfare", viaIncome.verdict, `welfare_${viaIncome.code}`, reason, {
    ...(viaIncome.action ? { action: viaIncome.action } : {}),
    ...userValue,
  });
}

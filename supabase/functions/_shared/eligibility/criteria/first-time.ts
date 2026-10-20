// 생애최초 특별공급 (변경 3 BR-U2-D35) — 주택 소유 이력, 소득세 납부, 혼인 또는 자녀
import type { Requirements } from "../../domain/requirements.ts";
import { ACTION, MSG_NEWLYWED } from "../messages.ts";
import type { CriterionResult, Verdict } from "../types.ts";
import { type CriterionContext, result, unknownRequirement, worst } from "./common.ts";

export function evaluateFirstTime(req: Requirements["firstTime"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("firstTime");
  const reason = MSG_NEWLYWED.firstTime(req.incomeTaxYears);
  const n = ctx.profile.newlywed;
  if (n === null) return result("firstTime", "unknown", "first_time_unknown", reason, { action: ACTION.checkNotice });

  if (n.neverOwnedHome === false) return result("firstTime", "ineligible", "first_time_owned", MSG_NEWLYWED.firstTimeOwned);
  if (n.incomeTax5y === false) return result("firstTime", "ineligible", "first_time_no_tax", MSG_NEWLYWED.firstTimeNoTax(req.incomeTaxYears));
  const marriedOrChild: Verdict = !req.marriedOrChildRequired
    ? "eligible"
    : n.marriage !== null || (n.children ?? 0) > 0
      ? "eligible"
      : n.children === 0
        ? "ineligible"
        : "unknown";
  if (marriedOrChild === "ineligible") return result("firstTime", "ineligible", "first_time_marriage", MSG_NEWLYWED.firstTimeMarriage);

  const verdict = worst([n.neverOwnedHome === null ? "unknown" : "eligible", n.incomeTax5y === null ? "unknown" : "eligible", marriedOrChild]);
  if (verdict === "eligible") return result("firstTime", "eligible", "first_time_ok", reason);
  const item = n.neverOwnedHome === null ? "집을 가진 적이 있는지" : n.incomeTax5y === null ? "소득세 납부 기간" : "혼인 상태";
  return result("firstTime", "unknown", "first_time_partial_unknown", reason, { action: ACTION.enterInSettings(item) });
}

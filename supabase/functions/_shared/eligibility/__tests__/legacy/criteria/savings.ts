// 변경 요청 3 전 판정 엔진 고정본 (커밋 fc1dc5f) — 테스트 전용, P-C3-1 노부부 불변 비교 기준. 고치지 않는다.
// 청약통장 (BR-U2-46~48)
import type { Requirements } from "../../../../domain/requirements.ts";
import { depositFor, depositTiers } from "../../../income-table.ts";
import { ACTION, MSG } from "../messages.ts";
import type { CriterionResult, Verdict } from "../../../types.ts";
import { type CriterionContext, result, unknownRequirement, worst } from "./common.ts";

export function evaluateSavings(req: Requirements["savings"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("savings");

  // 사유는 요건만으로 만든다 (프로필과 무관)
  const parts = [MSG.savingsMonths(req.minMonths)];
  if (req.minPayments) parts.push(MSG.savingsPayments(req.minPayments));
  if (req.minDepositManwon) parts.push(MSG.savingsDeposit(req.minDepositManwon));
  if (req.depositRule) parts.push(MSG.savingsDepositByArea);
  // 배우자 명의 통장이면 신청 명의를 알려 준다 (변경 2 BR-U2-C8). 판정은 명의와 상관없다 (C7)
  const owner = ctx.profile.savings.has === true ? ctx.profile.savings.owner : null;
  const reason = owner === "spouse" ? `${parts.join(", ")}. ${MSG.savingsSpouseOwner}` : parts.join(", ");

  const s = ctx.profile.savings;
  const enter = (item: string) => ({ action: ACTION.enterInSettings(item) });
  if (s.has === null) return result("savings", "unknown", "savings_unknown", reason, enter("청약통장"));
  if (!s.has) return result("savings", "ineligible", "savings_none", reason);

  const checks: { verdict: Verdict; item: string }[] = [];
  const atLeast = (value: number | null, min: number, item: string) =>
    checks.push({ verdict: value === null ? "unknown" : value >= min ? "eligible" : "ineligible", item });

  if (req.minMonths > 0) atLeast(s.months, req.minMonths, "가입 기간");
  if (req.minPayments) atLeast(s.paymentCount, req.minPayments, "납입 횟수");
  if (req.minDepositManwon) atLeast(s.depositManwon, req.minDepositManwon, "통장 금액");

  if (req.depositRule === "private_by_region_area") {
    const sido = ctx.profile.residence.sido;
    if (sido === null || s.depositManwon === null) {
      checks.push({ verdict: "unknown", item: sido === null ? "사는 곳" : "통장 금액" });
    } else {
      const tiers = depositTiers(sido);
      if (ctx.areaM2 !== null) {
        checks.push({ verdict: s.depositManwon >= depositFor(tiers, ctx.areaM2) ? "eligible" : "ineligible", item: "통장 금액" });
      } else {
        // BR-U2-48: 면적을 모르면 가장 낮은 구간 미달만 미충족
        const lowest = tiers[0]!;
        const highest = tiers[tiers.length - 1]!;
        const verdict: Verdict = s.depositManwon < lowest ? "ineligible" : s.depositManwon >= highest ? "eligible" : "unknown";
        checks.push({ verdict, item: "통장 금액" });
      }
    }
  }

  const verdict = worst(checks.map((c) => c.verdict));
  const missing = checks.find((c) => c.verdict === "unknown");
  if (verdict === "unknown" && missing) return result("savings", "unknown", "savings_partial_unknown", reason, enter(missing.item));
  return result("savings", verdict, verdict === "eligible" ? "savings_ok" : "savings_short", reason);
}

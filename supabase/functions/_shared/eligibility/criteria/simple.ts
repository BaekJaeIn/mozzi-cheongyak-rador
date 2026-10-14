// 무주택·자산·자동차·거주·세대주 (BR-U2-40·41·50·51·52)
import { normalizeSido } from "../../domain/profile.ts";
import type { Requirements } from "../../domain/requirements.ts";
import { ACTION, MSG } from "../messages.ts";
import type { CriterionResult } from "../types.ts";
import { type CriterionContext, result, unknownRequirement } from "./common.ts";

export function evaluateHomeless(req: Requirements["homeless"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("homeless");
  const { homeless, homelessYears } = ctx.profile.housing;
  const reason = req.minYears ? `${MSG.homelessRequired}, ${MSG.homelessYears(req.minYears)}` : MSG.homelessRequired;
  const enter = { action: ACTION.enterInSettings("집 보유 여부") };
  if (homeless === null) return result("homeless", "unknown", "homeless_unknown", reason, enter);
  if (!homeless) return result("homeless", "ineligible", "homeless_owner", reason);
  if (req.minYears) {
    if (homelessYears === null) return result("homeless", "unknown", "homeless_years_unknown", reason, { action: ACTION.enterInSettings("무주택 기간") });
    if (homelessYears < req.minYears) return result("homeless", "ineligible", "homeless_years_short", reason);
  }
  return result("homeless", "eligible", "homeless_ok", reason);
}

function evaluateMax(
  key: "asset" | "car",
  req: Requirements["asset"],
  value: number | null,
): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement(key);
  const reason = key === "asset" ? MSG.asset(req.maxManwon) : MSG.car(req.maxManwon);
  const userValue = key === "asset" ? ("totalAsset" as const) : ("carValue" as const);
  if (value === null) {
    return result(key, "unknown", `${key}_unknown`, reason, {
      action: ACTION.enterInSettings(key === "asset" ? "총자산" : "자동차 가액"),
      userValue,
    });
  }
  return value <= req.maxManwon
    ? result(key, "eligible", `${key}_ok`, reason, { userValue })
    : result(key, "ineligible", `${key}_over`, reason, { userValue });
}

export const evaluateAsset = (req: Requirements["asset"], ctx: CriterionContext) =>
  evaluateMax("asset", req, ctx.profile.money.totalAsset);
export const evaluateCar = (req: Requirements["car"], ctx: CriterionContext) =>
  evaluateMax("car", req, ctx.profile.money.carValue);

export function evaluateResidence(req: Requirements["residence"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("residence");
  const allowed = req.sidoIn.map(normalizeSido);
  const reason = MSG.residence(allowed);
  const sido = ctx.profile.residence.sido;
  if (sido === null) return result("residence", "unknown", "residence_unknown", reason, { action: ACTION.enterInSettings("사는 곳") });
  return allowed.includes(normalizeSido(sido))
    ? result("residence", "eligible", "residence_ok", reason)
    : result("residence", "ineligible", "residence_outside", reason);
}

export function evaluateHousehold(req: Requirements["household"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("household");
  if (!req.headRequired) return null;
  const head = ctx.profile.householdHead;
  if (head === null) return result("household", "unknown", "household_head_unknown", MSG.headRequired, { action: ACTION.enterInSettings("세대주") });
  return head === "other"
    ? result("household", "ineligible", "household_head_other", MSG.headRequired)
    : result("household", "eligible", "household_head_ok", MSG.headRequired);
}


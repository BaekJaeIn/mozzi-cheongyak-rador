// 나이 (BR-U2-35~39, Q1=A 가구 단위, Q2=A 모집공고일)
import { ageAt, householdMembers } from "../../domain/profile.ts";
import type { Requirements } from "../../domain/requirements.ts";
import { ACTION, MSG } from "../messages.ts";
import type { CriterionResult } from "../types.ts";
import { type CriterionContext, result, unknownRequirement } from "./common.ts";

export function evaluateAge(req: Requirements["age"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("age");
  const { profile, baseDate } = ctx;
  const enterBirth = { action: ACTION.enterInSettings("생년월일") };

  // BR-U2-38: 세대주 기준
  if (req.who === "head" || ctx.headRequired) {
    const head = profile.householdHead;
    if (head === null) return result("age", "unknown", "age_head_unknown", MSG.ageUnknown(req.minAge), { action: ACTION.enterInSettings("세대주") });
    if (head === "other") return result("age", "ineligible", "age_head_not_couple", MSG.headNotCouple);
    const birth = head === "self" ? profile.self.birthDate : profile.spouse?.birthDate ?? null;
    if (birth === null) return result("age", "unknown", "age_birth_unknown", MSG.ageUnknown(req.minAge), enterBirth);
    const age = ageAt(birth, baseDate);
    return age >= req.minAge
      ? result("age", "eligible", "age_head_ok", MSG.headAgeEligible(req.minAge, age))
      : result("age", "ineligible", "age_head_young", MSG.headAgeIneligible(req.minAge, age));
  }

  // BR-U2-37: 두 분 중 한 분이라도
  const members = householdMembers(profile);
  const couple = members.length > 1;
  const known = members.filter((m) => m.birthDate !== null).map((m) => ageAt(m.birthDate!, baseDate));
  const oldest = known.length > 0 ? Math.max(...known) : null;
  if (oldest !== null && oldest >= req.minAge) {
    return result("age", "eligible", "age_ok", MSG.ageEligible(req.minAge, oldest, couple));
  }
  if (known.length < members.length || oldest === null) {
    return result("age", "unknown", "age_birth_unknown", MSG.ageUnknown(req.minAge), enterBirth);
  }
  return result("age", "ineligible", "age_young", MSG.ageIneligible(req.minAge, oldest, couple));
}

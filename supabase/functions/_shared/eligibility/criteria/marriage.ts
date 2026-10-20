// 혼인 (변경 3 BR-U2-D20~D22) — 신혼 가구 정보로 판정, 노부부 가구는 신혼부부 대상 주택이면 미충족
import type { IsoDate } from "../../domain/dates.ts";
import type { Requirements } from "../../domain/requirements.ts";
import { ACTION, MSG_NEWLYWED } from "../messages.ts";
import type { CriterionResult } from "../types.ts";
import { type CriterionContext, result, unknownRequirement } from "./common.ts";

/** date + years년 (2월 29일은 평년에 2월 28일) */
export function addYears(date: IsoDate, years: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const ny = y + years;
  const last = new Date(Date.UTC(ny, m, 0)).getUTCDate();
  return `${ny}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function evaluateMarriage(req: Requirements["marriage"], ctx: CriterionContext): CriterionResult | null {
  if (req === undefined) return null;
  if (req === "unknown") return unknownRequirement("marriage");
  const reason = MSG_NEWLYWED.marriage(req.maxYears);
  const n = ctx.profile.newlywed;
  if (n === null) return result("marriage", "ineligible", "marriage_not_newlywed", MSG_NEWLYWED.notNewlywed); // BR-U2-D14
  const enter = (item: string) => ({ action: ACTION.enterInSettings(item) });

  if (n.marriage === "married") {
    if (n.marriageDate === null) return result("marriage", "unknown", "marriage_date_unknown", reason, enter("혼인신고일"));
    // 기준일(모집공고일)에 혼인 maxYears년 이내 (BR-U2-D20)
    return ctx.baseDate <= addYears(n.marriageDate, req.maxYears)
      ? result("marriage", "eligible", "marriage_ok", MSG_NEWLYWED.marriageOk(req.maxYears))
      : result("marriage", "ineligible", "marriage_over", MSG_NEWLYWED.marriageOver(req.maxYears));
  }
  if (n.marriage === "engaged") {
    // BR-U2-D21
    if (req.engagedAllowed === true) {
      return result("marriage", "eligible", "marriage_engaged_ok", MSG_NEWLYWED.engagedOk, { action: ACTION.engagedRegister });
    }
    if (req.engagedAllowed === false) return result("marriage", "ineligible", "marriage_engaged_no", MSG_NEWLYWED.engagedNo);
    return result("marriage", "unknown", "marriage_engaged_unknown", MSG_NEWLYWED.engagedUnknown, { action: ACTION.checkEngaged });
  }
  return result("marriage", "unknown", "marriage_unknown", reason, enter("혼인 상태")); // BR-U2-D22
}

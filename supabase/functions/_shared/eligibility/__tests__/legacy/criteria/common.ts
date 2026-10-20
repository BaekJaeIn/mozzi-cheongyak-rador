// 변경 요청 3 전 판정 엔진 고정본 (커밋 fc1dc5f) — 테스트 전용, P-C3-1 노부부 불변 비교 기준. 고치지 않는다.
// 조건별 판정기 공통 도구 (BR-U2-30~34)
import type { IsoDate } from "../../../../domain/dates.ts";
import type { HouseholdProfile } from "../../../../domain/profile.ts";
import type { IncomeTable } from "../../../income-table.ts";
import { ACTION, MSG } from "../messages.ts";
import type { CriterionKey, CriterionResult, UserValueKey, Verdict } from "../../../types.ts";

export interface CriterionContext {
  profile: HouseholdProfile;
  baseDate: IsoDate;
  /** 소득 기준표 연도 = 기준일의 연도 (BR-U2-43) */
  year: number;
  areaM2: number | null;
  incomeTable: IncomeTable;
  /** 요건에 세대주 조건이 있는지 (나이 판정과 결합, BR-U2-38) */
  headRequired: boolean;
}

export function result(
  key: CriterionKey,
  verdict: Verdict,
  code: string,
  reason: string,
  extra: { action?: string; userValue?: UserValueKey } = {},
): CriterionResult {
  return { key, verdict, code, reason, ...extra };
}

/** BR-U2-31: 조건은 있으나 내용을 모름 */
export function unknownRequirement(key: CriterionKey): CriterionResult {
  return result(key, "unknown", `${key}_requirement_unknown`, MSG.unknownRequirement, { action: ACTION.checkNotice });
}

/** 여러 하위 확인의 결과 합치기: 하나라도 ineligible → ineligible, 아니면 unknown이 있으면 unknown */
export function worst(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.includes("ineligible")) return "ineligible";
  if (verdicts.includes("unknown")) return "unknown";
  return "eligible";
}

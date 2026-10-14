// 판정 결과·입력 타입 (U2 domain-entities §3, 계약 K4)
import type { IsoDate } from "../domain/dates.ts";
import type { Tenure } from "../domain/profile.ts";
import type { Requirements } from "../domain/requirements.ts";

export type Verdict = "eligible" | "ineligible" | "unknown";
export type CriterionKey =
  | "type"
  | "age"
  | "homeless"
  | "income"
  | "asset"
  | "car"
  | "savings"
  | "residence"
  | "household"
  | "welfare";

/** 화면이 기기 프로필에서 붙여 보여줄 내 금액 (NFR-U2-10) */
export type UserValueKey = "monthlyIncome" | "totalAsset" | "carValue";

export interface CriterionResult {
  key: CriterionKey;
  verdict: Verdict;
  /** 기계용 사유 코드 (관측성·화면 분기) */
  code: string;
  /** 화면용 한 줄 — 기준 값만 담고 내 금액은 담지 않는다 */
  reason: string;
  action?: string;
  userValue?: UserValueKey;
}

export interface UnitJudgement {
  unitId: string;
  supplyType: string;
  verdict: Verdict;
  criteria: CriterionResult[];
}

export interface NoticeJudgement {
  noticeId: string;
  verdict: Verdict;
  inDistrict: boolean;
  score: number;
  baseDate: IsoDate;
  units: UnitJudgement[];
}

export interface UnitForJudgement {
  id: string;
  supplyType: string;
  exclusiveAreaM2: number | null;
  requirements: Requirements;
}

export interface NoticeForJudgement {
  id: string;
  tenure: Tenure;
  announcedAt: IsoDate | null;
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  districtIds: string[];
  units: UnitForJudgement[];
}

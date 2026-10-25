// 판정 결과·입력 타입 (U2 domain-entities §3, 계약 K4)
import type { IsoDate } from "../domain/dates.ts";
import type { Tenure } from "../domain/profile.ts";
import type { NoticeAudience } from "../domain/audiences.ts";
import type { CapitalSido } from "../domain/regions.ts";
import type { Requirements } from "../domain/requirements.ts";
import type { ApplyRoute } from "./routes.ts";

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
  | "welfare"
  | "marriage" // 변경 3
  | "firstTime" // 변경 3
  | "audience"; // 변경 4 신청 대상 (BR-U2-E11)

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

/** 신청 방법 하나의 판정 (변경 3 Q1=A) */
export interface RouteJudgement {
  route: ApplyRoute;
  verdict: Verdict;
  criteria: CriterionResult[];
  /** 통장 조건을 채운 통장 (BR-U2-D30) */
  savingsBy?: "self" | "spouse";
}

export interface UnitJudgement {
  unitId: string;
  supplyType: string;
  /** 신청 방법 중 가장 좋은 판정 (BR-U2-D11) */
  verdict: Verdict;
  /** 가장 좋은 신청 방법의 조건 (BR-U2-D12) — 지금 화면과 호환 */
  criteria: CriterionResult[];
  /** 신혼 가구만 — 노부부는 없음 (저장 형식이 변경 3 전과 같다, BR-U2-D2) */
  routes?: RouteJudgement[];
}

export interface NoticeJudgement {
  noticeId: string;
  verdict: Verdict;
  /** 관심 지역 안 = 관심 지구 안 또는 관심 시군구 안 (변경 2 BR-U2-C12). 이름은 DB·API 호환을 위해 그대로 */
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
  /** 공고문에서 뽑은 신청 방법별 요건 (U3). 없으면 표준 요건 (BR-U2-D13) */
  routeRequirements?: Partial<Record<ApplyRoute, Requirements>>;
}

export interface NoticeForJudgement {
  id: string;
  tenure: Tenure;
  announcedAt: IsoDate | null;
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  districtIds: string[];
  /** 공고 지역 (U3가 판별, 0개면 지구로만 매칭) */
  regions: NoticeRegion[];
  /** 공고 신청 대상 (U3가 판별, 빈 배열 = 누구나·모름) — 변경 4 BR-U2-E10 */
  audiences: NoticeAudience[];
  units: UnitForJudgement[];
}

/** 공고 지역. sigungu null = 시도까지만 확인됨 (예: "경기도 일원") */
export interface NoticeRegion {
  sido: CapitalSido;
  sigungu: string | null;
}

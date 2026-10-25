// 도메인 엔티티와 DB 행 타입 (domain-entities.md E1~E13, 계약 K1)
// 도메인 객체는 camelCase + Date/IsoDate, 행은 DB 컬럼 그대로 snake_case + 문자열.
// 비어 있는 값은 도메인·행 모두 null로 통일한다 (undefined 사용 안 함).
import type { IsoDate } from "../domain/dates.ts";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type SourceCode = "applyhome" | "lh_rental" | "myhome_complex" | "sh" | "gh";
export type Tenure = "sale" | "rent";
export type SummaryStatus = "pending" | "done" | "failed" | "skipped"; // skipped: 공고문 PDF 없음 (변경 4 BR-U3-E31)
export type Verdict = "eligible" | "ineligible" | "unknown";
export type ThresholdKind = "monthly_income" | "total_asset" | "car_value";

// ---------- 공고 영역 ----------

export interface District {
  id: string;
  name: string;
  sido: string;
  sigungu: string[];
  keywords: string[];
  /** 시군구가 같을 때만 매칭하는 동 이름 (U2 0006) */
  areaKeywords: string[];
  active: boolean;
  sortOrder: number;
}

export interface DistrictRow {
  id: string;
  name: string;
  sido: string;
  sigungu: string[];
  keywords: string[];
  area_keywords: string[];
  active: boolean;
  sort_order: number;
}

export interface Notice {
  id: string;
  dedupKey: string;
  title: string;
  complexName: string | null;
  location: string | null;
  sido: string | null;
  sigungu: string | null;
  provider: string;
  primarySource: SourceCode;
  tenure: Tenure;
  announcedAt: IsoDate | null;
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  resultAt: IsoDate | null;
  contractStart: IsoDate | null;
  contractEnd: IsoDate | null;
  summary: JsonObject | null;
  summaryStatus: SummaryStatus;
  firstSeenAt: Date;
  updatedAt: Date;
}

export interface NoticeRow {
  id: string;
  dedup_key: string;
  title: string;
  complex_name: string | null;
  location: string | null;
  sido: string | null;
  sigungu: string | null;
  provider: string;
  primary_source: SourceCode;
  tenure: Tenure;
  announced_at: string | null;
  apply_start: string | null;
  apply_end: string | null;
  result_at: string | null;
  contract_start: string | null;
  contract_end: string | null;
  summary: JsonObject | null;
  summary_status: SummaryStatus;
  first_seen_at: string;
  updated_at: string;
}

export interface HousingUnit {
  id: string;
  noticeId: string;
  label: string | null;
  supplyType: string;
  exclusiveAreaM2: number | null;
  supplyCount: number | null;
  standardRequirements: JsonObject | null;
  extractedRequirements: JsonObject | null;
  requirements: JsonObject;
}

export interface HousingUnitRow {
  id: string;
  notice_id: string;
  label: string | null;
  supply_type: string;
  exclusive_area_m2: number | null;
  supply_count: number | null;
  standard_requirements: JsonObject | null;
  extracted_requirements: JsonObject | null;
  requirements: JsonObject;
}

export interface SupplyTypeLabel {
  code: string;
  formalLabel: string;
  plainLabel: string;
  tenure: Tenure;
}

// ---------- 기기 영역 ----------

export interface Device {
  id: string;
  tokenHash: string;
  notifyHour: number;
  notifyEnabled: boolean;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface DeviceRow {
  id: string;
  token_hash: string;
  notify_hour: number;
  notify_enabled: boolean;
  created_at: string;
  last_seen_at: string;
}

/** 서버 저장 형식의 프로필 (금액은 암호문). 평문 프로필 타입은 U2가 정의한다. */
export interface StoredProfile {
  deviceId: string;
  schemaVersion: number;
  data: JsonObject;
  encMonthlyIncome: string | null;
  encTotalAsset: string | null;
  encCarValue: string | null;
  profileVersion: number;
  updatedAt: Date;
}

export interface StoredProfileRow {
  device_id: string;
  schema_version: number;
  data: JsonObject;
  enc_monthly_income: string | null;
  enc_total_asset: string | null;
  enc_car_value: string | null;
  profile_version: number;
  updated_at: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  deviceId: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
}

export interface PushSubscriptionRow {
  endpoint: string;
  device_id: string;
  p256dh: string;
  auth: string;
  created_at: string;
  last_success_at: string | null;
}

export interface Judgement {
  deviceId: string;
  noticeId: string;
  verdict: Verdict;
  inDistrict: boolean;
  score: number | null;
  detail: JsonObject;
  profileVersion: number;
  computedAt: Date;
}

export interface JudgementRow {
  device_id: string;
  notice_id: string;
  verdict: Verdict;
  in_district: boolean;
  score: number | null;
  detail: JsonObject;
  profile_version: number;
  computed_at: string;
}

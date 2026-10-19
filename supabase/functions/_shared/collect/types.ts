// 수집 파이프라인 타입 (U3 domain-entities §2~§7)
import type { IsoDate } from "../domain/dates.ts";
import type { Tenure } from "../domain/profile.ts";
import type { SupplyTypeCode } from "../domain/supply-types.ts";
import type { JsonObject } from "../db/types.ts";
import type { Requirements } from "../domain/requirements.ts";
import type { NoticeRegion } from "../eligibility/types.ts";

/** 1차 수집 소스 (U3 Q1=A). U1 enum 값을 그대로 쓴다. */
export type CollectSource = "applyhome" | "lh_rental" | "gh" | "sh";
export const COLLECT_SOURCES: readonly CollectSource[] = ["applyhome", "lh_rental", "gh", "sh"];

export interface Attachment {
  name: string;
  url: string;
}

/** 원천 날짜 문자열 (소스 형식 그대로) */
export interface RawDates {
  announcedAt: string | null;
  applyStart: string | null;
  applyEnd: string | null;
  resultAt: string | null;
  contractStart: string | null;
  contractEnd: string | null;
}

export interface Schedule {
  announcedAt: IsoDate | null;
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  resultAt: IsoDate | null;
  contractStart: IsoDate | null;
  contractEnd: IsoDate | null;
}

export const SCHEDULE_KEYS: readonly (keyof Schedule)[] = [
  "announcedAt",
  "applyStart",
  "applyEnd",
  "resultAt",
  "contractStart",
  "contractEnd",
];

export interface RawNotice {
  source: CollectSource;
  sourceNoticeNo: string;
  title: string;
  complexName: string | null;
  location: string | null;
  sigungu: string | null;
  provider: string;
  supplyTypeText: string | null;
  tenureHint: Tenure | null;
  dates: RawDates;
  originalUrl: string;
  attachments: Attachment[];
  raw: unknown;
}

export interface NormalizedNotice {
  source: CollectSource;
  sourceNoticeNo: string;
  title: string;
  complexName: string | null;
  location: string | null;
  sido: string | null;
  sigungu: string | null;
  provider: string;
  supplyTypeText: string | null;
  supplyType: SupplyTypeCode;
  tenure: Tenure;
  schedule: Schedule;
  districtIds: string[];
  /** 공고 지역 (변경 2 BR-U3-C4~C8). 비면 저장하지 않는다 (BR-U3-C2) */
  regions: NoticeRegion[];
  blockKey: string | null;
  originalUrl: string;
  attachments: Attachment[];
  raw: unknown;
  contentHash: string;
}

export interface NoticeGroup {
  dedupKey: string;
  /** 대표가 맨 앞 (BR-U3-33) */
  members: NormalizedNotice[];
}

/** upsert_notice_bundle RPC 입력 (snake_case, U1 0004 + U3 0007) */
export interface NoticeBundle {
  notice: {
    dedup_key: string;
    title: string;
    complex_name: string | null;
    location: string | null;
    sido: string | null;
    sigungu: string | null;
    provider: string;
    primary_source: CollectSource;
    tenure: Tenure;
    announced_at: IsoDate | null;
    apply_start: IsoDate | null;
    apply_end: IsoDate | null;
    result_at: IsoDate | null;
    contract_start: IsoDate | null;
    contract_end: IsoDate | null;
    /** 수집이 판별한 지역 (변경 2) */
    regions: NoticeRegion[];
  };
  sources: {
    source: CollectSource;
    source_notice_no: string;
    original_url: string;
    raw: unknown;
    content_hash: string;
    attachments: Attachment[];
  }[];
  units: {
    label: string | null;
    supply_type: SupplyTypeCode;
    exclusive_area_m2: number | null;
    supply_count: number | null;
    standard_requirements: JsonObject;
    extracted_requirements: JsonObject | null;
    requirements: JsonObject;
  }[];
  district_ids: string[];
  /** 아래는 있을 때만 덮어쓴다 (0007) */
  summary?: { eligibilityPlain: string; forSeniorCouple: string; generatedAt: string };
  summary_status?: "pending" | "done" | "failed";
  ai_attempts?: number;
  ai_source_url?: string | null;
  release_claim?: boolean;
  /** 분석이 고친 지역 — 있을 때만 덮어쓴다 (BR-U3-C9, P-U3-C4) */
  regions_ai?: NoticeRegion[] | null;
}

/** Gemini 추출 결과 (검증 후) — U3 domain-entities §5 */
export interface ExtractedUnit {
  label: string | null;
  supplyTypeText: string;
  exclusiveAreaM2: number | null;
  supplyCount: number | null;
  /** U2 Requirements로 바꾼 뒤 validateRequirements를 통과한 값, 실패하면 null */
  requirements: Requirements | null;
}

export interface NoticeExtraction {
  isNotice: boolean;
  schedule: Schedule;
  units: ExtractedUnit[];
  summary: { eligibilityPlain: string; forSeniorCouple: string } | null;
  /** 공급 위치 시군구 원문 표기 (변경 2 BR-U3-C9). 없으면 null */
  supplySigungu?: string[] | null;
}

/** collect_runs 기록 */
export interface CollectRunRecord {
  runId: string;
  source: CollectSource | "all";
  ok: boolean;
  fetchedCount: number;
  upsertedCount: number;
  warning: string | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
}

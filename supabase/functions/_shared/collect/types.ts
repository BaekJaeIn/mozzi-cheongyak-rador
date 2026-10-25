// 수집 파이프라인 타입 (U3 domain-entities §2~§7)
import type { IsoDate } from "../domain/dates.ts";
import type { Tenure } from "../domain/profile.ts";
import type { SupplyTypeCode } from "../domain/supply-types.ts";
import type { JsonObject } from "../db/types.ts";
import type { Requirements } from "../domain/requirements.ts";
import type { NoticeRegion } from "../eligibility/types.ts";
import type { NoticeAudience } from "../domain/audiences.ts";

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
  /** 원천의 공급 위치 칸 (변경 4 BR-U3-E2) — 청약홈은 location, LH 단지 주소, GH 소재지. 접수처·본사 주소는 넣지 않는다 */
  locationTexts?: string[];
  /** 지구 이름·대상 낱말 단서 (변경 4 BR-U3-E4·E20) — GH 주택형 칸 등. 제목·공고문 첨부 이름은 정규화가 더한다 */
  hintTexts?: string[];
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
  /** 제목·단서 글에서 찾은 신청 대상 (변경 4 BR-U3-E20) */
  audiences: NoticeAudience[];
  /** 원천 공급 위치 칸·단서 글 (변경 4) — 해시·지역 계산에 쓴다 */
  locationTexts: string[];
  hintTexts: string[];
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
    /** 제목·단서 글의 신청 대상 (변경 4 BR-U3-E20) — 수집 저장만 넣는다(분석 저장은 키 없음 → 그대로) */
    audiences?: NoticeAudience[];
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
  summary_status?: "pending" | "done" | "failed" | "skipped"; // skipped: 공고문 PDF 없음 (변경 4 BR-U3-E31)
  ai_attempts?: number;
  ai_source_url?: string | null;
  release_claim?: boolean;
  /** 분석 판 (변경 3 BR-U3-D30) — 분석 저장만 넣는다 */
  analysis_version?: number;
  /** 분석이 고친 지역 — 있을 때만 덮어쓴다 (BR-U3-C9, P-U3-C4) */
  regions_ai?: NoticeRegion[] | null;
  /** 공고문 AI가 읽은 신청 대상 (변경 4 BR-U3-E22) — 분석 저장만 */
  audiences_ai?: NoticeAudience[] | null;
  /** 마지막 분석 실패 이유 (변경 4 BR-U3-E32). 성공 저장은 null로 지운다 */
  ai_last_error?: string | null;
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
  summary: { eligibilityPlain: string; forSeniorCouple: string; forNewlywed?: string } | null;
  /** 공급 위치 시군구 원문 표기 (변경 2 BR-U3-C9). 없으면 null */
  supplySigungu?: string[] | null;
  /** 신청 대상 (변경 4 BR-U3-E22): 특정 대상만 → 그 대상들, 누구나 → [], 모름 → null */
  audiences?: NoticeAudience[] | null;
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

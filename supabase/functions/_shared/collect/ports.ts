// 오케스트레이터가 주입받는 의존성 (L-U3-8·9, NFR-U3-24) — Deno 구현은 _lib/, 테스트는 가짜 구현
import type { IsoDate } from "../domain/dates.ts";
import type { DistrictRule } from "../domain/district-matcher.ts";
import type { Requirements } from "../domain/requirements.ts";
import type { RecomputeAllSummary } from "../services/judgement-service.ts";
import type { BundleBase } from "./bundle.ts";
import type { CollectRunRecord, CollectSource, NoticeBundle, RawNotice } from "./types.ts";

export interface CollectorContext {
  today: IsoDate;
  /** 이 시각(epoch ms)이 지나면 그때까지 모은 것만 돌려준다 (NFR-U3-01) */
  deadline: number;
  /** 이미 저장한 원천 글번호 → 제목 (SH 상세 줄이기, NFR-U3-C6). 없으면 모두 새 글로 본다 */
  knownTitles?: ReadonlyMap<string, string>;
}

export interface CollectorResult {
  notices: RawNotice[];
  /** 대기열·시간 초과·상세 실패 등 */
  warnings: string[];
}

export interface Collector {
  readonly source: CollectSource;
  collect(ctx: CollectorContext): Promise<CollectorResult>;
}

export interface StoredSourceState {
  source: CollectSource;
  sourceNoticeNo: string;
  noticeId: string;
  dedupKey: string;
  contentHash: string;
  summaryStatus: "pending" | "done" | "failed" | "skipped";
  aiAttempts: number;
}

export interface CollectRepository {
  loadDistricts(): Promise<DistrictRule[]>;
  loadStandards(): Promise<Record<string, Requirements>>;
  collectState(keys: { source: CollectSource; sourceNoticeNo: string }[]): Promise<StoredSourceState[]>;
  /** 원천별 저장된 글번호 → 제목 (SH 상세 줄이기, P-U3-C5). 없는 구현은 빈 표 */
  sourceTitles?(source: CollectSource): Promise<Map<string, string>>;
  /** 대표 공고 id */
  upsertBundle(bundle: NoticeBundle): Promise<string>;
  claimForAnalysis(limit: number, now: Date): Promise<string[]>;
  loadForAnalysis(noticeId: string): Promise<{ base: BundleBase; aiAttempts: number } | null>;
  /** error: 실패 이유 "코드: 설명" (변경 4 BR-U3-E32) */
  releaseClaim(noticeId: string, failed: boolean, error?: string | null): Promise<void>;
  /** 다시 분석 대상 (변경 3 BR-U3-D31): 판 1·요약 완료·관심 지역 안·마감 전, 하루 5건 상한은 저장소가 지킨다 */
  claimForReanalysis(limit: number, now: Date): Promise<string[]>;
  /** 다시 분석 실패: 요약·주택형·판은 그대로, 시도 +1 (BR-U3-D32) */
  releaseReanalysis(noticeId: string, error?: string | null): Promise<void>;
  recordRun(record: CollectRunRecord): Promise<void>;
}

export interface PdfFetcher {
  /** 실패하면 StepError(too_large | pdf_fetch) */
  fetchPdf(url: string): Promise<Uint8Array>;
}

export interface Extractor {
  /** Gemini 응답 JSON(검증 전). 실패하면 StepError(gemini_error | invalid_json) */
  extract(input: { pdf: Uint8Array; title: string; supplyTypeHint: string }): Promise<unknown>;
}

export interface Recomputer {
  recomputeAll(asOf: IsoDate): Promise<RecomputeAllSummary>;
}

export interface Clock {
  now(): Date;
  nowMs(): number;
}

export type AnalyzeFailure = "no_pdf" | "too_large" | "pdf_fetch" | "gemini_error" | "invalid_json" | "not_notice" | "save_error";

export class StepError extends Error {
  constructor(
    readonly code: AnalyzeFailure,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "StepError";
  }
}

/** 오류 문구에서 URL 쿼리(API 키)를 지운다 (BR-U3-72, P-U3-S2) */
export function redactUrls(text: string): string {
  return text.replace(/(https?:\/\/[^\s?#"']+)\?[^\s"']*/g, "$1?[redacted]");
}

/** 공고별 실패 이유: "코드: 설명" 200자, URL 쿼리는 지운다 (변경 4 BR-U3-E32) */
export function failureReason(code: AnalyzeFailure, e: unknown): string {
  const detail = e instanceof Error && e.message !== code ? redactUrls(e.message) : "";
  return (detail ? `${code}: ${detail}` : code).slice(0, 200);
}

export function errorMessage(e: unknown): string {
  return redactUrls(e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 500);
}

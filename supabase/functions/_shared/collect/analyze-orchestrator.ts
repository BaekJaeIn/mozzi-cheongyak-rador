// 매시간 AI 분석 오케스트레이터 (U3 NFR §1, P-U3-R3·R6·P1)
// 예약 → 공고문 PDF → Gemini 추출 → 검증 → 묶음 저장(요약·추출 요건) / 실패 시 예약 해제 → 재계산
import type { IsoDate } from "../domain/dates.ts";
import { SUPPLY_TYPES } from "../domain/supply-types.ts";
import type { RecomputeAllSummary } from "../services/judgement-service.ts";
import { buildBundle, buildUnits, fillSchedule, type StandardRequirements } from "./bundle.ts";
import { parseExtraction } from "./extraction.ts";
import { applyAiRegions } from "./regions.ts";
import { pickNoticePdfFromSources } from "./pdf-locator.ts";
import {
  type AnalyzeFailure,
  type Clock,
  type CollectRepository,
  errorMessage,
  type Extractor,
  type PdfFetcher,
  type Recomputer,
  StepError,
} from "./ports.ts";

export const ANALYZE_BATCH = 2;
/** 시작 후 이 시간이 지나면 다음 공고를 시작하지 않는다 (NFR-U3-03) */
export const ANALYZE_CUTOFF_MS = 70_000;

export interface AnalyzeDeps {
  repo: CollectRepository;
  pdf: PdfFetcher;
  extractor: Extractor;
  recomputer: Recomputer;
  clock: Clock;
}

export interface AnalyzeOptions {
  runId: string;
  today: IsoDate;
  startedAtMs: number;
  batch?: number;
  cutoffMs?: number;
}

export type AnalyzeOutcome =
  | { noticeId: string; status: "done"; units: number; hasSummary: boolean; reanalysis?: true }
  | { noticeId: string; status: "failed"; code: AnalyzeFailure }
  | { noticeId: string; status: "deferred" };

export interface AnalyzeSummary {
  runId: string;
  claimed: number;
  outcomes: AnalyzeOutcome[];
  recompute: RecomputeAllSummary | null;
  recomputeError: string | null;
}

/** 변경 3: 분석 판 — 이 코드로 분석한 공고 (BR-U3-D30) */
export const ANALYSIS_VERSION = 2;

async function analyzeOne(deps: AnalyzeDeps, noticeId: string, standards: StandardRequirements, reanalysis = false): Promise<AnalyzeOutcome> {
  const loaded = await deps.repo.loadForAnalysis(noticeId);
  if (!loaded) {
    if (reanalysis) await deps.repo.releaseReanalysis(noticeId);
    else await deps.repo.releaseClaim(noticeId, false);
    return { noticeId, status: "deferred" };
  }
  const { base, aiAttempts } = loaded;

  const pdf = pickNoticePdfFromSources(base.sources); // BR-U3-60
  if (!pdf) throw new StepError("no_pdf");

  let bytes: Uint8Array;
  try {
    bytes = await deps.pdf.fetchPdf(pdf.url);
  } catch (e) {
    throw e instanceof StepError ? e : new StepError("pdf_fetch", errorMessage(e));
  }

  let raw: unknown;
  try {
    raw = await deps.extractor.extract({ pdf: bytes, title: base.title, supplyTypeHint: SUPPLY_TYPES[base.supplyType].formal });
  } catch (e) {
    throw e instanceof StepError ? e : new StepError("gemini_error", errorMessage(e));
  }

  const extraction = parseExtraction(raw); // BR-U3-63·64
  if (!extraction) throw new StepError("invalid_json");
  if (!extraction.isNotice) throw new StepError("not_notice");

  const units = buildUnits(base, extraction, standards); // BR-U3-65
  const bundle = buildBundle(
    base,
    units,
    {
      ...(extraction.summary ? { summary: { ...extraction.summary, generatedAt: deps.clock.now().toISOString() } } : {}),
      summary_status: "done",
      ai_attempts: aiAttempts + 1,
      ai_source_url: pdf.url,
      release_claim: true,
      analysis_version: ANALYSIS_VERSION,
      // 공고문의 공급 위치로 "시도까지만" 지역 고치기 — 고칠 것이 없으면 null (BR-U3-C9, P-U3-C4)
      regions_ai: applyAiRegions(base.regions, extraction.supplySigungu ?? null),
    },
    fillSchedule(base.schedule, extraction.schedule), // BR-U3-66
  );
  try {
    await deps.repo.upsertBundle(bundle);
  } catch (e) {
    throw new StepError("save_error", errorMessage(e));
  }
  return { noticeId, status: "done", units: units.length, hasSummary: extraction.summary !== null, ...(reanalysis ? { reanalysis: true as const } : {}) };
}

export async function runAnalyze(deps: AnalyzeDeps, opts: AnalyzeOptions): Promise<AnalyzeSummary> {
  const batch = opts.batch ?? ANALYZE_BATCH;
  const cutoff = opts.cutoffMs ?? ANALYZE_CUTOFF_MS;
  const startedAt = deps.clock.now();
  const fresh = await deps.repo.claimForAnalysis(batch, deps.clock.now()); // P-U3-R3
  // 변경 3 BR-U3-D31: 새 공고를 먼저, 남는 몫으로 다시 분석 (하루 5건은 저장소가 지킨다)
  const again = batch - fresh.length > 0 ? await deps.repo.claimForReanalysis(batch - fresh.length, deps.clock.now()) : [];
  const ids = [...fresh, ...again];
  const reanalysisIds = new Set(again);
  const standards = ids.length > 0 ? await deps.repo.loadStandards() : {};

  const outcomes: AnalyzeOutcome[] = [];
  for (const [i, noticeId] of ids.entries()) {
    const reanalysis = reanalysisIds.has(noticeId);
    // 실패·미룸 처리: 새 공고는 지금처럼, 다시 분석은 요약을 지키고 시도만 +1 (BR-U3-D32)
    const release = (failed: boolean) => (reanalysis ? deps.repo.releaseReanalysis(noticeId) : deps.repo.releaseClaim(noticeId, failed));
    if (i > 0 && deps.clock.nowMs() - opts.startedAtMs > cutoff) {
      await release(false); // 시간 예산 초과 — 다음 실행으로
      outcomes.push({ noticeId, status: "deferred" });
      continue;
    }
    try {
      outcomes.push(await analyzeOne(deps, noticeId, standards, reanalysis));
    } catch (e) {
      const code: AnalyzeFailure = e instanceof StepError ? e.code : "gemini_error";
      await release(true).catch(() => undefined); // ai_attempts + 1 (다시 분석은 reanalysis_attempts + 1)
      outcomes.push({ noticeId, status: "failed", code });
    }
  }

  let recompute: RecomputeAllSummary | null = null;
  let recomputeError: string | null = null;
  if (outcomes.some((o) => o.status === "done")) {
    try {
      recompute = await deps.recomputer.recomputeAll(opts.today);
    } catch (e) {
      recomputeError = errorMessage(e);
    }
  }

  const failed: Record<string, number> = {};
  for (const o of outcomes) if (o.status === "failed") failed[o.code] = (failed[o.code] ?? 0) + 1;
  await deps.repo.recordRun({
    runId: opts.runId,
    source: "all",
    ok: recomputeError === null && Object.keys(failed).length === 0,
    fetchedCount: ids.length,
    upsertedCount: outcomes.filter((o) => o.status === "done").length,
    warning:
      ids.length > 0
        ? JSON.stringify({ kind: "analyze", failed, deferred: outcomes.filter((o) => o.status === "deferred").length, reanalysis: again.length, recompute })
        : null,
    error: recomputeError,
    startedAt,
    finishedAt: deps.clock.now(),
  });
  return { runId: opts.runId, claimed: ids.length, outcomes, recompute, recomputeError };
}

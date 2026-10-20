// U3 오케스트레이터 테스트용 가짜 의존성 — 메모리 CollectRepository는 0007 DB 함수와 같은 규칙을 구현한다
import { addDays, diffDays, toKstDate } from "../domain/dates.ts";
import { inInterestArea } from "../eligibility/area.ts";
import type { RegionPick } from "../domain/profile.ts";
import type { Requirements } from "../domain/requirements.ts";
import type { SupplyTypeCode } from "../domain/supply-types.ts";
import { DISTRICTS, STANDARD_REQUIREMENTS } from "../eligibility/reference-data.ts";
import type { BundleBase } from "../collect/bundle.ts";
import type {
  Clock,
  Collector,
  CollectRepository,
  Extractor,
  PdfFetcher,
  Recomputer,
  StoredSourceState,
} from "../collect/ports.ts";
import { StepError } from "../collect/ports.ts";
import { mockExtractionFor, mockRawNotices } from "../collect/mock-data.ts";
import type { CollectRunRecord, CollectSource, NoticeBundle } from "../collect/types.ts";
import type { RecomputeAllSummary } from "../services/judgement-service.ts";

export const CLAIM_EXPIRE_MS = 10 * 60 * 1000;
/** 0013 claim_notices_for_reanalysis의 하루 상한과 같다 */
export const REANALYSIS_PER_DAY = 5;

export interface StoredNotice {
  id: string;
  bundle: NoticeBundle;
  summary: NoticeBundle["summary"] | null;
  summaryStatus: "pending" | "done" | "failed";
  aiAttempts: number;
  aiSourceUrl: string | null;
  /** 분석이 고친 지역 (0010 regions_ai) — 수집 저장은 건드리지 않는다 */
  regionsAi: NoticeBundle["regions_ai"] | null;
  claimedAt: Date | null;
  order: number;
  /** 변경 3: 분석 판·다시 분석 (0013) */
  analysisVersion: number;
  reanalysisAttempts: number;
  reanalyzedAt: Date | null;
}

/** 관심 기기들의 관심 지역 (요약 대상 제한 BR-U3-C18의 가짜). 기본: 3기 신도시 지구만 고른 기기 하나 */
export type InterestPrefs = { districtIds: string[]; regions: RegionPick[] }[];
export const DEFAULT_INTEREST: InterestPrefs = [{ districtIds: DISTRICTS.map((d) => d.id), regions: [] }];

export function createMemoryCollectRepo(interest: InterestPrefs = DEFAULT_INTEREST) {
  const notices = new Map<string, StoredNotice>();
  const sourceOwner = new Map<string, string>(); // "source:no" → notice id
  const runs: CollectRunRecord[] = [];
  let seq = 0;

  const repo: CollectRepository = {
    async loadDistricts() {
      return DISTRICTS.map((d) => ({ ...d }));
    },
    async loadStandards() {
      return { ...STANDARD_REQUIREMENTS } as Record<string, Requirements>;
    },
    async collectState(keys) {
      const out: StoredSourceState[] = [];
      for (const k of keys) {
        const id = sourceOwner.get(`${k.source}:${k.sourceNoticeNo}`);
        const n = id ? notices.get(id) : undefined;
        if (!n) continue;
        const src = n.bundle.sources.find((s) => s.source === k.source && s.source_notice_no === k.sourceNoticeNo)!;
        out.push({
          source: k.source,
          sourceNoticeNo: k.sourceNoticeNo,
          noticeId: n.id,
          dedupKey: n.bundle.notice.dedup_key,
          contentHash: src.content_hash,
          summaryStatus: n.summaryStatus,
          aiAttempts: n.aiAttempts,
        });
      }
      return out;
    },
    async upsertBundle(bundle) {
      let existing = [...notices.values()].find((n) => n.bundle.notice.dedup_key === bundle.notice.dedup_key);
      if (!existing) {
        existing = { id: `notice-${++seq}`, bundle, summary: null, summaryStatus: "pending", aiAttempts: 0, aiSourceUrl: null, regionsAi: null, claimedAt: null, order: seq, analysisVersion: 1, reanalysisAttempts: 0, reanalyzedAt: null };
        notices.set(existing.id, existing);
      }
      const previousOwners = new Set<string>();
      for (const s of bundle.sources) {
        const key = `${s.source}:${s.source_notice_no}`;
        const prev = sourceOwner.get(key);
        if (prev && prev !== existing.id) previousOwners.add(prev);
        sourceOwner.set(key, existing.id);
      }
      // 원천 공고 합치기 (기존 원천 + 이번 원천)
      const merged = new Map(existing.bundle.sources.map((s) => [`${s.source}:${s.source_notice_no}`, s]));
      for (const s of bundle.sources) merged.set(`${s.source}:${s.source_notice_no}`, s);
      existing.bundle = { ...bundle, sources: [...merged.values()] };
      if (bundle.summary !== undefined) existing.summary = bundle.summary;
      if (bundle.summary_status !== undefined) existing.summaryStatus = bundle.summary_status;
      if (bundle.ai_attempts !== undefined) existing.aiAttempts = bundle.ai_attempts;
      if (bundle.ai_source_url !== undefined) existing.aiSourceUrl = bundle.ai_source_url;
      if (bundle.regions_ai !== undefined) existing.regionsAi = bundle.regions_ai;
      if (bundle.release_claim) existing.claimedAt = null;
      if (bundle.analysis_version !== undefined) existing.analysisVersion = bundle.analysis_version;
      // 원천이 모두 다른 공고로 옮겨 간 옛 공고는 지운다 (0007)
      for (const prevId of previousOwners) {
        const prev = notices.get(prevId);
        if (!prev) continue;
        prev.bundle = { ...prev.bundle, sources: prev.bundle.sources.filter((s) => sourceOwner.get(`${s.source}:${s.source_notice_no}`) === prevId) };
        if (prev.bundle.sources.length === 0) notices.delete(prevId);
      }
      return existing.id;
    },
    async claimForAnalysis(limit, now) {
      const today = toKstDate(now);
      const picked = [...notices.values()]
        .filter((n) => n.summaryStatus === "pending" || (n.summaryStatus === "failed" && n.aiAttempts < 3))
        .filter((n) => n.claimedAt === null || now.getTime() - n.claimedAt.getTime() > CLAIM_EXPIRE_MS)
        .filter((n) => n.bundle.notice.apply_end === null || diffDays(today, n.bundle.notice.apply_end) >= 0)
        .filter((n) => interest.some((p) => inInterestArea({ districtIds: n.bundle.district_ids, regions: n.regionsAi ?? n.bundle.notice.regions }, p)))
        .sort((a, b) => {
          const ea = a.bundle.notice.apply_end ?? "9999-12-31";
          const eb = b.bundle.notice.apply_end ?? "9999-12-31";
          return ea < eb ? -1 : ea > eb ? 1 : a.order - b.order;
        })
        .slice(0, limit);
      for (const n of picked) n.claimedAt = now;
      return picked.map((n) => n.id);
    },
    async loadForAnalysis(noticeId) {
      const n = notices.get(noticeId);
      if (!n) return null;
      const b = n.bundle;
      const base: BundleBase = {
        dedupKey: b.notice.dedup_key,
        title: b.notice.title,
        complexName: b.notice.complex_name,
        location: b.notice.location,
        sido: b.notice.sido,
        sigungu: b.notice.sigungu,
        provider: b.notice.provider,
        primarySource: b.notice.primary_source,
        tenure: b.notice.tenure,
        supplyType: (b.units[0]?.supply_type ?? "other") as SupplyTypeCode,
        schedule: {
          announcedAt: b.notice.announced_at,
          applyStart: b.notice.apply_start,
          applyEnd: b.notice.apply_end,
          resultAt: b.notice.result_at,
          contractStart: b.notice.contract_start,
          contractEnd: b.notice.contract_end,
        },
        districtIds: b.district_ids,
        regions: b.notice.regions,
        sources: b.sources,
      };
      return { base, aiAttempts: n.aiAttempts };
    },
    async releaseClaim(noticeId, failed) {
      const n = notices.get(noticeId);
      if (!n) return;
      n.claimedAt = null;
      if (failed) {
        n.aiAttempts += 1;
        n.summaryStatus = "failed";
      }
    },
    async claimForReanalysis(limit, now) {
      const today = toKstDate(now);
      const used = [...notices.values()].filter((n) => n.reanalyzedAt !== null && toKstDate(n.reanalyzedAt) === today).length;
      const picked = [...notices.values()]
        .filter((n) => n.summaryStatus === "done" && n.analysisVersion < 2 && n.reanalysisAttempts < 3)
        .filter((n) => n.reanalyzedAt === null || toKstDate(n.reanalyzedAt) < today) // 같은 공고는 하루 한 번
        .filter((n) => n.claimedAt === null || now.getTime() - n.claimedAt.getTime() > CLAIM_EXPIRE_MS)
        .filter((n) => n.bundle.notice.apply_end === null || diffDays(today, n.bundle.notice.apply_end) >= 0)
        .filter((n) => interest.some((p) => inInterestArea({ districtIds: n.bundle.district_ids, regions: n.regionsAi ?? n.bundle.notice.regions }, p)))
        .sort((a, b) => a.order - b.order)
        .slice(0, Math.max(0, Math.min(limit, REANALYSIS_PER_DAY - used)));
      for (const n of picked) {
        n.claimedAt = now;
        n.reanalyzedAt = now;
      }
      return picked.map((n) => n.id);
    },
    async releaseReanalysis(noticeId) {
      const n = notices.get(noticeId);
      if (!n) return;
      n.claimedAt = null;
      n.reanalysisAttempts += 1;
    },
    async recordRun(record) {
      runs.push(record);
    },
  };
  return { repo, notices, runs, sourceOwner };
}

/** 목업 원천 데이터를 돌려주는 가짜 Collector (failWith를 주면 실패) */
export function mockCollectors(options: { fail?: CollectSource[]; empty?: CollectSource[]; hang?: CollectSource[] } = {}): Collector[] {
  return (["applyhome", "lh_rental", "gh", "sh"] as const).map((source) => ({
    source,
    async collect(ctx) {
      if (options.fail?.includes(source)) throw new Error(`${source} 실패 https://api.example/x?serviceKey=SECRET`);
      if (options.hang?.includes(source)) await new Promise(() => undefined);
      if (options.empty?.includes(source)) return { notices: [], warnings: [] };
      return { notices: mockRawNotices(ctx.today)[source], warnings: [] };
    },
  }));
}

export const fakePdf = (options: { tooLarge?: string[]; fail?: string[] } = {}): PdfFetcher => ({
  async fetchPdf(url) {
    if (options.tooLarge?.some((u) => url.endsWith(u))) throw new StepError("too_large");
    if (options.fail?.some((u) => url.endsWith(u))) throw new Error("HTTP 500");
    return new TextEncoder().encode(`%PDF-mock ${url}`);
  },
});

export function fakeExtractor(override?: (pdfUrl: string) => unknown): Extractor & { calls: number } {
  const ex = {
    calls: 0,
    async extract(input: { pdf: Uint8Array; title: string; supplyTypeHint: string }) {
      ex.calls += 1;
      const url = new TextDecoder().decode(input.pdf).replace("%PDF-mock ", "");
      return override ? override(url) : mockExtractionFor(url);
    },
  };
  return ex;
}

export function fakeRecomputer(): Recomputer & { calls: number } {
  const r = {
    calls: 0,
    async recomputeAll(): Promise<RecomputeAllSummary> {
      r.calls += 1;
      return { devices: 0, succeeded: 0, skippedStale: 0, failed: 0, notices: 0, counts: { eligible: 0, unknown: 0, ineligible: 0, incomeTableMissing: 0 }, ms: 0 };
    },
  };
  return r;
}

/** 수동으로 움직이는 시계 */
export function fakeClock(startIso = "2026-10-15T00:00:00.000Z"): Clock & { advance(ms: number): void } {
  let t = Date.parse(startIso);
  return { now: () => new Date(t), nowMs: () => t, advance: (ms) => void (t += ms) };
}

export const TODAY = "2026-10-15";
export const daysFrom = (n: number) => addDays(TODAY, n);

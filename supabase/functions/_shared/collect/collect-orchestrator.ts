// 매일 수집 오케스트레이터 (기능 설계 §2 + 변경 메모, P-U3-R1·R4·R5·P1)
// AI는 부르지 않는다 — 바뀐·새 공고는 표준 요건으로 저장하고 summary_status=pending (analyze가 처리)
import type { IsoDate } from "../domain/dates.ts";
import type { RecomputeAllSummary } from "../services/judgement-service.ts";
import { baseFromGroup, buildBundle, buildUnits } from "./bundle.ts";
import { groupNotices } from "./grouping.ts";
import { isDistrictCandidate, normalizeNotice } from "./normalize.ts";
import { type Clock, type Collector, type CollectRepository, errorMessage, type Recomputer } from "./ports.ts";
import { inScope } from "./scope.ts";
import type { CollectSource, NoticeGroup, NormalizedNotice } from "./types.ts";

/** NFR-U3-01 소스별 시간 상한 */
export const SOURCE_BUDGET_MS: Record<CollectSource, number> = { applyhome: 20_000, lh_rental: 55_000, gh: 10_000, sh: 35_000 } // 변경 2 NFR-U3-C2;

export interface CollectDeps {
  collectors: readonly Collector[];
  repo: CollectRepository;
  recomputer: Recomputer;
  clock: Clock;
}

/** 두 묶음 호출 (변경 2 NFR-U3-C1, P-U3-C1): 새벽 5:00 api, 5:10 crawl. 묶음 없이 부르면 전체 */
export type CollectGroup = "api" | "crawl";
export const COLLECT_GROUPS: Readonly<Record<CollectGroup, readonly CollectSource[]>> = {
  api: ["applyhome", "lh_rental"],
  crawl: ["gh", "sh"],
};
export function parseCollectGroup(value: unknown): CollectGroup | null {
  return value === "api" || value === "crawl" ? value : null;
}

export interface CollectOptions {
  runId: string;
  today: IsoDate;
  budgets?: Partial<Record<CollectSource, number>>;
  /** 없으면 전체 (수동 실행·옛 cron) */
  group?: CollectGroup | null;
}

export interface SourceOutcome {
  source: CollectSource;
  ok: boolean;
  fetched: number;
  kept: number;
  warnings: string[];
  error: string | null;
}

export interface CollectSummary {
  runId: string;
  sources: SourceOutcome[];
  groups: number;
  changed: number;
  saved: number;
  saveErrors: number;
  recompute: RecomputeAllSummary | null;
  recomputeError: string | null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 시간 상한 초과`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** 묶음이 저장된 상태와 다른지 (BR-U3-51·52) */
export function isGroupChanged(group: NoticeGroup, stored: ReadonlyMap<string, { contentHash: string; dedupKey: string }>): boolean {
  return group.members.some((m) => {
    const s = stored.get(`${m.source}:${m.sourceNoticeNo}`);
    return !s || s.contentHash !== m.contentHash || s.dedupKey !== group.dedupKey;
  });
}

export async function runCollect(deps: CollectDeps, opts: CollectOptions): Promise<CollectSummary> {
  const { repo, clock } = deps;
  const runStartedAt = clock.now();
  const [districts, standards] = await Promise.all([repo.loadDistricts(), repo.loadStandards()]);
  const notices: NormalizedNotice[] = [];
  const sources: SourceOutcome[] = [];

  const collectors = opts.group ? deps.collectors.filter((c) => COLLECT_GROUPS[opts.group!].includes(c.source)) : deps.collectors;

  // 3. 소스마다 격리 (BR-U3-01)
  for (const collector of collectors) {
    const startedAt = clock.now();
    const budget = opts.budgets?.[collector.source] ?? SOURCE_BUDGET_MS[collector.source];
    const outcome: SourceOutcome = { source: collector.source, ok: true, fetched: 0, kept: 0, warnings: [], error: null };
    try {
      // SH는 저장된 글 제목을 넘겨 상세를 줄인다 (P-U3-C5)
      const knownTitles = collector.source === "sh" && repo.sourceTitles ? await repo.sourceTitles("sh") : undefined;
      const result = await withTimeout(
        collector.collect({ today: opts.today, deadline: clock.nowMs() + budget, ...(knownTitles ? { knownTitles } : {}) }),
        budget + 5_000,
        collector.source,
      );
      outcome.fetched = result.notices.length;
      outcome.warnings.push(...result.warnings);
      const candidates: string[] = [];
      const noRegion: string[] = [];
      for (const raw of result.notices) {
        const n = await normalizeNotice(raw, districts);
        if (!n || !inScope(n.schedule, opts.today)) continue; // BR-U3-14·40
        if (n.districtIds.length === 0 && isDistrictCandidate(n, districts)) candidates.push(n.title); // BR-U3-22
        if (n.regions.length === 0) {
          // 수도권 밖이거나 시도를 모름 → 저장 안 함 (변경 2 BR-U3-C2·C3). 수도권 밖은 정상이라 시도를 모를 때만 센다
          if (n.sido === null) noRegion.push(n.title);
          continue;
        }
        notices.push(n);
        outcome.kept += 1;
      }
      if (candidates.length > 0) outcome.warnings.push(`지구 후보(동 키워드 확인): ${candidates.slice(0, 10).join(" / ")}`);
      if (noRegion.length > 0) outcome.warnings.push(`지역 판별 실패 ${noRegion.length}건: ${noRegion.slice(0, 5).join(" / ")}`);
      if (collector.source === "gh" && result.notices.length === 0 && result.warnings.length === 0) {
        outcome.warnings.push("GH 0건 — 화면 구조 변경 의심 (BR-U3-71)");
      }
    } catch (e) {
      outcome.ok = false;
      outcome.error = errorMessage(e);
    }
    sources.push(outcome);
    await repo.recordRun({
      runId: opts.runId,
      source: collector.source,
      ok: outcome.ok,
      fetchedCount: outcome.fetched,
      upsertedCount: outcome.kept,
      warning: outcome.warnings.length > 0 ? outcome.warnings.join("\n").slice(0, 2000) : null,
      error: outcome.error,
      startedAt,
      finishedAt: clock.now(),
    });
  }

  // 4~6. 묶기 → 변경분만 저장 (표준 요건, pending)
  const groups = groupNotices(notices);
  const states = notices.length > 0 ? await repo.collectState(notices.map((n) => ({ source: n.source, sourceNoticeNo: n.sourceNoticeNo }))) : [];
  const stored = new Map(states.map((s) => [`${s.source}:${s.sourceNoticeNo}`, s]));
  let changed = 0;
  let saved = 0;
  let saveErrors = 0;
  for (const group of groups) {
    if (!isGroupChanged(group, stored)) continue; // BR-U3-51
    changed += 1;
    const base = baseFromGroup(group);
    const bundle = buildBundle(base, buildUnits(base, null, standards), { summary_status: "pending", ai_attempts: 0 }); // P-U3-R4
    try {
      await repo.upsertBundle(bundle);
      saved += 1;
    } catch {
      saveErrors += 1; // 공고 단위 격리
    }
  }

  // 7. 전체 판정 재계산 (나이가 날마다 바뀌므로 매일). api 묶음은 저장한 공고가 있을 때만 — 하루 한 번은 crawl 묶음이 한다 (P-U3-C2)
  let recompute: RecomputeAllSummary | null = null;
  let recomputeError: string | null = null;
  if (opts.group !== "api" || saved > 0) {
    try {
      recompute = await deps.recomputer.recomputeAll(opts.today);
    } catch (e) {
      recomputeError = errorMessage(e);
    }
  }

  const summary: CollectSummary = { runId: opts.runId, sources, groups: groups.length, changed, saved, saveErrors, recompute, recomputeError };
  await repo.recordRun({
    runId: opts.runId,
    source: "all",
    ok: recomputeError === null && saveErrors === 0 && sources.every((s) => s.ok),
    fetchedCount: sources.reduce((a, s) => a + s.fetched, 0),
    upsertedCount: saved,
    warning: JSON.stringify({ group: opts.group ?? "all", groups: groups.length, changed, saveErrors, recompute }),
    error: recomputeError,
    startedAt: runStartedAt,
    finishedAt: clock.now(),
  });
  return summary;
}

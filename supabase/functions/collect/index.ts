// Edge Function collect — 매일 KST 05:00 api 묶음(collect-daily), 05:10 crawl 묶음(collect-crawl). AI 호출 없음 (U3 변경 메모)
// 본문 { "group": "api" | "crawl" } — 없으면 전체 (수동 실행, 변경 2 P-U3-C1)
// 소스 수집 → 정규화·묶기 → 변경분만 표준 요건으로 저장(pending) → 전체 재계산 → 실행 기록
import { parseCollectGroup, runCollect } from "../_shared/collect/collect-orchestrator.ts";
import { toKstDate } from "../_shared/domain/dates.ts";
import { createPipeline, systemClock } from "../_lib/deps.ts";
import { readFunctionEnv } from "../_lib/env.ts";
import { cronHandler } from "../_lib/guard.ts";

Deno.serve(
  cronHandler("collect", async ({ runId, log, req }) => {
    const body = (await req.json().catch(() => null)) as { group?: unknown } | null;
    const group = parseCollectGroup(body?.group);
    const pipeline = createPipeline(readFunctionEnv(), log);
    const summary = await runCollect(
      { collectors: pipeline.collectors(), repo: pipeline.repo, recomputer: pipeline.recomputer, clock: systemClock },
      { runId, today: toKstDate(systemClock.now()), group },
    );
    return summary;
  }),
);

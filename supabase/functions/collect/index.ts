// Edge Function collect — 매일 KST 05:00 (pg_cron collect-daily). AI 호출 없음 (U3 변경 메모)
// 소스 수집 → 정규화·묶기 → 변경분만 표준 요건으로 저장(pending) → 전체 재계산 → 실행 기록
import { runCollect } from "../_shared/collect/collect-orchestrator.ts";
import { toKstDate } from "../_shared/domain/dates.ts";
import { createPipeline, systemClock } from "../_lib/deps.ts";
import { readFunctionEnv } from "../_lib/env.ts";
import { cronHandler } from "../_lib/guard.ts";

Deno.serve(
  cronHandler("collect", async ({ runId, log }) => {
    const pipeline = createPipeline(readFunctionEnv(), log);
    const summary = await runCollect(
      { collectors: pipeline.collectors(), repo: pipeline.repo, recomputer: pipeline.recomputer, clock: systemClock },
      { runId, today: toKstDate(systemClock.now()) },
    );
    return summary;
  }),
);

// Edge Function analyze — 매시 30분 (pg_cron analyze-hourly). 공고문 PDF를 Gemini로 읽어 요건·요약 저장
// 공고 2건 예약 → PDF → 추출 → 검증 → 저장 / 실패 시 해제 → 처리 1건 이상이면 재계산 → 실행 기록
import { runAnalyze } from "../_shared/collect/analyze-orchestrator.ts";
import { toKstDate } from "../_shared/domain/dates.ts";
import { createPipeline, systemClock } from "../_lib/deps.ts";
import { readFunctionEnv } from "../_lib/env.ts";
import { cronHandler } from "../_lib/guard.ts";

Deno.serve(
  cronHandler("analyze", async ({ runId, startedAtMs, log }) => {
    const pipeline = createPipeline(readFunctionEnv(), log);
    const ai = pipeline.ai();
    if (!ai) {
      log.warn("GEMINI_API_KEY 없음 — 분석 건너뜀");
      return { runId, skipped: "no_gemini_key" };
    }
    return await runAnalyze(
      { repo: pipeline.repo, pdf: ai.pdf, extractor: ai.extractor, recomputer: pipeline.recomputer, clock: systemClock },
      { runId, today: toKstDate(systemClock.now()), startedAtMs },
    );
  }),
);

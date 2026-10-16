// Edge Function dispatch — 매시 정각 (pg_cron dispatch-hourly, business-logic-model §1)
// 대상 기기 → 피드와 같은 노출로 계획 → 하루 몫 잡기 → 웹 푸시 → 기록 / 되돌리기 → dispatch_runs 1행
import { createLogger } from "../_shared/log/logger.ts";
import { kstHour, runDispatch } from "../_shared/push/dispatch.ts";
import { createRpcDispatchStore, type RpcClient } from "../_shared/push/store-rpc.ts";
import { createVapidSigner, isValidVapidConfig } from "../_shared/push/vapid.ts";
import { createPipeline, systemClock } from "../_lib/deps.ts";
import { DbError } from "../_lib/db/client.ts";
import { readFunctionEnv } from "../_lib/env.ts";
import { cronHandler } from "../_lib/guard.ts";

/** 본문 { "part": 0, "parts": 3 } — 없으면 한 번에 전부 (infrastructure-design §4) */
async function readPart(req: Request): Promise<{ index: number; count: number } | undefined> {
  const body = await req.json().catch(() => null) as { part?: unknown; parts?: unknown } | null;
  const index = Number(body?.part);
  const count = Number(body?.parts);
  return Number.isInteger(index) && Number.isInteger(count) && count > 1 && index >= 0 && index < count ? { index, count } : undefined;
}

Deno.serve(
  cronHandler("dispatch", async ({ runId, log, req }) => {
    const env = readFunctionEnv();
    if (!isValidVapidConfig(env.vapid)) throw new Error("VAPID 설정이 없어요 (VAPID_PUBLIC_KEY·VAPID_PRIVATE_KEY·VAPID_SUBJECT)");
    const pipeline = createPipeline(env, log);
    const db = pipeline.db;
    const now = systemClock.now();

    const { data: run, error: runError } = await db.from("dispatch_runs").insert({ hour: kstHour(now) }).select("id").single();
    if (runError) throw new DbError("dispatch_runs.insert", runError);

    const finish = async (fields: Record<string, unknown>) => {
      const { error } = await db.from("dispatch_runs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", run.id);
      if (error) log.error("dispatch_runs.update.failed", { code: error.code });
    };

    try {
      const store = createRpcDispatchStore(db as unknown as RpcClient, async () => {
        const { error, count } = await db.from("notices").select("id", { count: "exact", head: true });
        if (error) throw new DbError("notices.count", error);
        return count ?? 0;
      });
      const summary = await runDispatch(
        {
          store,
          vapid: await createVapidSigner(env.vapid),
          transport: (url, init) => fetch(url, init),
          recompute: pipeline.recomputeDevice,
          log: createLogger({ fn: "dispatch", runId }),
          nowMs: systemClock.nowMs,
          part: await readPart(req),
        },
        now,
      );
      await finish({
        devices: summary.devices,
        sent: summary.sent,
        skipped_empty: summary.skippedEmpty,
        skipped_claimed: summary.skippedClaimed,
        skipped_budget: summary.skippedBudget,
        failed: summary.failed,
        removed_subscriptions: summary.removedSubscriptions,
        recomputed: summary.recomputed,
        time_budget_exceeded: summary.timeBudgetExceeded,
      });
      return summary;
    } catch (error) {
      await finish({ error: error instanceof Error ? error.name : "unknown" });
      throw error;
    }
  }),
);

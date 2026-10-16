// 함수 진입 공통 처리 (L-U3-10, P-U3-S1·P1): 메서드·서버 키 확인, 시작 시각, 오류 시 500
import { isCronAuthorized } from "../_shared/collect/guard.ts";
import { errorMessage } from "../_shared/collect/ports.ts";
import { createLogger, type Logger } from "../_shared/log/logger.ts";

export interface RunContext {
  runId: string;
  startedAtMs: number;
  log: Logger;
  /** 본문을 읽어야 하는 함수용 (dispatch의 나눠 부르기) */
  req: Request;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** POST + Bearer CRON_SECRET만 통과. 결과 요약을 JSON으로 돌려준다 (개인정보 없음) */
export function cronHandler(name: string, run: (ctx: RunContext) => Promise<unknown>): (req: Request) => Promise<Response> {
  return async (req) => {
    const startedAtMs = Date.now();
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (!isCronAuthorized(req.headers.get("authorization"), Deno.env.get("CRON_SECRET"))) {
      return json(401, { error: "unauthorized" });
    }
    const runId = crypto.randomUUID();
    const log = createLogger({ fn: name, runId });
    try {
      const result = await run({ runId, startedAtMs, log, req });
      log.info("완료", { elapsedMs: Date.now() - startedAtMs });
      return json(200, result);
    } catch (e) {
      log.error("실패", { error: errorMessage(e), elapsedMs: Date.now() - startedAtMs });
      return json(500, { error: "internal", runId });
    }
  };
}

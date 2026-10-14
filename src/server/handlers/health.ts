// GET /api/health — DB 가벼운 조회 1번 (L12, NFR-U1-08). 내부 정보는 응답에 넣지 않는다.
import "server-only";
import { createLogger, type LogSink } from "@shared/log/logger.ts";
import { json, newRequestId } from "../http/respond";

export function createHealthHandler(ping: () => Promise<void>, sink?: LogSink) {
  return async (): Promise<Response> => {
    const requestId = newRequestId();
    const log = createLogger({ requestId, route: "GET /api/health" }, sink);
    try {
      await ping();
      return json({ ok: true }, 200, requestId);
    } catch (error) {
      log.error("health check failed", { error: error instanceof Error ? error.message : String(error) });
      return json({ ok: false }, 503, requestId);
    }
  };
}

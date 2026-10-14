// 기기 인증 라우트 래퍼 (L3: 본문 크기 → 인증 → lastSeenAt 갱신 → 핸들러 → 로그)
// BR-U1-06~08, 11 / P-P2, P-S6
import "server-only";
import { parseAuthHeaders } from "@shared/security/auth-headers.ts";
import { verifyToken } from "@shared/security/token.ts";
import type { DeviceRepository } from "@shared/db/repositories.ts";
import { createLogger, type LogSink, type Logger } from "@shared/log/logger.ts";
import { errorResponse, newRequestId, readJsonBody, REQUEST_ID_HEADER } from "../http/respond";

export const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

/** 마지막 갱신 후 1시간 이상 지났을 때만 lastSeenAt을 쓴다 (BR-U1-11). */
export function shouldTouch(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= TOUCH_INTERVAL_MS;
}

export interface DeviceContext {
  req: Request;
  deviceId: string;
  requestId: string;
  log: Logger;
  /** maxBodyBytes를 준 경우에만 채워진다 */
  body: unknown;
}

export interface GuardOptions {
  route: string;
  /** POST·PUT 본문 최대 크기. 주지 않으면 본문을 읽지 않는다 */
  maxBodyBytes?: number;
}

export interface GuardDeps {
  devices: DeviceRepository;
  now: () => Date;
}

/**
 * @param getDeps 본문 검사를 통과한 뒤에만 호출한다 (환경 변수·DB 연결 문제가 413·400 응답을 가리지 않게,
 *                그리고 그 문제도 { code, message } 형식의 500으로 응답하게)
 */
export function createRouteGuard(getDeps: () => GuardDeps, sink?: LogSink) {
  return function withDevice(handler: (ctx: DeviceContext) => Promise<Response>, options: GuardOptions) {
    return async (req: Request): Promise<Response> => {
      const requestId = newRequestId();
      const started = Date.now();
      const log = createLogger({ requestId, route: options.route }, sink);

      const finish = (response: Response, deviceId?: string) => {
        if (!response.headers.has(REQUEST_ID_HEADER)) response.headers.set(REQUEST_ID_HEADER, requestId);
        log.info("request", { status: response.status, ms: Date.now() - started, deviceId });
        return response;
      };

      try {
        let body: unknown = null;
        if (options.maxBodyBytes !== undefined) {
          const result = await readJsonBody(req, options.maxBodyBytes, requestId);
          if (!result.ok) return finish(result.response);
          body = result.value;
        }

        const credentials = parseAuthHeaders(req.headers);
        if (!credentials) return finish(errorResponse("AUTH_MISSING", 401, requestId));

        const deps = getDeps();
        const record = await deps.devices.findAuth(credentials.deviceId);
        if (!record) return finish(errorResponse("DEVICE_UNKNOWN", 401, requestId), credentials.deviceId);
        if (!(await verifyToken(credentials.token, record.tokenHash))) {
          return finish(errorResponse("TOKEN_MISMATCH", 401, requestId), credentials.deviceId);
        }

        const now = deps.now();
        if (shouldTouch(record.lastSeenAt, now)) await deps.devices.touch(credentials.deviceId, now);

        const response = await handler({ req, deviceId: credentials.deviceId, requestId, log, body });
        return finish(response, credentials.deviceId);
      } catch (error) {
        log.error("unhandled", { error: error instanceof Error ? error.message : String(error) });
        return finish(errorResponse("SERVER", 500, requestId));
      }
    };
  };
}

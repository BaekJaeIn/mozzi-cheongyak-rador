// POST /api/device — 기기 등록 (BR-U1-02~05, P-S4, 계약 K3)
import "server-only";
import type { DeviceRepository } from "@shared/db/repositories.ts";
import { createLogger, type LogSink } from "@shared/log/logger.ts";
import { hashToken, isValidDeviceId, isValidToken } from "@shared/security/token.ts";
import { errorResponse, json, newRequestId, readJsonBody } from "../http/respond";

export const REGISTER_MAX_BODY_BYTES = 1024;

/**
 * @param getDevices 입력 검증을 통과한 뒤에만 호출한다 (환경 변수·DB 연결 문제가 400·413 응답을 가리지 않게)
 */
export function createRegisterHandler(getDevices: () => DeviceRepository, sink?: LogSink) {
  return async (req: Request): Promise<Response> => {
    const requestId = newRequestId();
    const log = createLogger({ requestId, route: "POST /api/device" }, sink);
    const done = (response: Response, deviceId?: string) => {
      log.info("request", { status: response.status, deviceId });
      return response;
    };

    try {
      const body = await readJsonBody(req, REGISTER_MAX_BODY_BYTES, requestId);
      if (!body.ok) return done(body.response);

      const { deviceId, token } = (body.value ?? {}) as Record<string, unknown>;
      if (!isValidDeviceId(deviceId) || !isValidToken(token)) {
        return done(errorResponse("BAD_REQUEST", 400, requestId));
      }

      const result = await getDevices().register(deviceId, await hashToken(token));
      switch (result) {
        case "created":
          return done(json({ status: "created" }, 201, requestId), deviceId);
        case "existing":
          return done(json({ status: "existing" }, 200, requestId), deviceId);
        case "conflict":
          return done(errorResponse("DEVICE_CONFLICT", 409, requestId), deviceId);
        case "rate_limited":
          return done(errorResponse("TOO_MANY_REGISTRATIONS", 429, requestId), deviceId);
      }
    } catch (error) {
      log.error("unhandled", { error: error instanceof Error ? error.message : String(error) });
      return done(errorResponse("SERVER", 500, requestId));
    }
  };
}

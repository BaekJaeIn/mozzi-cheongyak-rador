// U6 API (S6): POST /api/push/subscribe, POST /api/push/test, GET /api/push/key
// 로그에는 기기 ID·건수·상태 코드만 — 구독 주소·키·알림 내용은 남기지 않는다 (NFR-U6-16)
import "server-only";
import { toKstDate } from "@shared/domain/dates.ts";
import { validateSubscription } from "@shared/push/endpoint.ts";
import { testPayload } from "@shared/push/payload.ts";
import { visibleNoticeIds } from "@shared/push/plan.ts";
import { type PushTarget, type PushTransport, sendPush, settleDevice, TEST_TTL_SECONDS } from "@shared/push/send.ts";
import { createVapidSigner, isValidVapidConfig, type VapidConfig } from "@shared/push/vapid.ts";
import type { DeviceContext } from "../auth/route-guard";
import type { FeedQueryRepository } from "../feed/types";
import { errorResponse, json, newRequestId } from "../http/respond";

export const SUBSCRIBE_MAX_BODY_BYTES = 4 * 1024;

export interface PushDeps {
  vapid: () => VapidConfig | null;
  feed: () => FeedQueryRepository;
  saveSubscription: (input: { deviceId: string; endpoint: string; p256dh: string; auth: string; baselineIds: readonly string[] }) => Promise<{
    saved: boolean;
    baselined: boolean;
  }>;
  tryTestPush: (deviceId: string) => Promise<boolean>;
  listSubscriptions: (deviceId: string) => Promise<PushTarget[]>;
  recordResult: (deviceId: string, result: { success: string[]; failed: string[]; gone: string[] }) => Promise<void>;
  transport: PushTransport;
  now: () => Date;
}

/** GET /api/push/key — 공개 값. 설정이 없으면 503 (BR-U6-92, 미리보기 배포) */
export function createPushKeyHandler(deps: Pick<PushDeps, "vapid">) {
  return async (): Promise<Response> => {
    const requestId = newRequestId();
    const config = deps.vapid();
    if (!config || !isValidVapidConfig(config)) return errorResponse("PUSH_NOT_CONFIGURED", 503, requestId);
    return json({ publicKey: config.publicKey }, 200, requestId);
  };
}

/** POST /api/push/subscribe (BR-U6-50~55): 검사 → 저장(옮기기·5개 제한) → 첫 구독이면 기준선 */
export function createSubscribeHandler(deps: PushDeps) {
  return async ({ deviceId, requestId, log, body }: DeviceContext): Promise<Response> => {
    const checked = validateSubscription(body);
    if (!checked.ok) {
      log.warn("push.subscribe.invalid", { field: checked.field });
      return errorResponse("BAD_REQUEST", 400, requestId);
    }
    // 기준선 = 지금 이 기기 피드에 보이는 공고 (피드와 같은 코드, BR-U6-10)
    const today = toKstDate(deps.now());
    const baselineIds = visibleNoticeIds(await deps.feed().listFeedRows(deviceId, today), today);
    const { endpoint, keys } = checked.value;
    const result = await deps.saveSubscription({ deviceId, endpoint, p256dh: keys.p256dh, auth: keys.auth, baselineIds });
    if (!result.saved) return errorResponse("DEVICE_UNKNOWN", 401, requestId);
    log.info("push.subscribed", { baselined: result.baselined, baseline: result.baselined ? baselineIds.length : 0 });
    return json({ subscribed: true }, 200, requestId);
  };
}

/** POST /api/push/test (BR-U6-65~68): 한도 → 모든 구독에 시험 알림 → 성공·실패·만료 반영 */
export function createTestPushHandler(deps: PushDeps) {
  return async ({ deviceId, requestId, log }: DeviceContext): Promise<Response> => {
    const config = deps.vapid();
    if (!config || !isValidVapidConfig(config)) return errorResponse("PUSH_NOT_CONFIGURED", 503, requestId);
    const subscriptions = await deps.listSubscriptions(deviceId);
    if (subscriptions.length === 0) return errorResponse("NO_SUBSCRIPTION", 409, requestId);
    if (!(await deps.tryTestPush(deviceId))) return errorResponse("TOO_MANY_TESTS", 429, requestId);

    const vapid = await createVapidSigner(config);
    const nowSeconds = Math.floor(deps.now().getTime() / 1000);
    const results = [];
    for (const sub of subscriptions) {
      const outcome = await sendPush(sub, testPayload(), { vapid, transport: deps.transport, nowSeconds, ttl: TEST_TTL_SECONDS });
      if (outcome.kind === "rejected") log.warn("push.rejected", { status: outcome.status });
      results.push({ endpoint: sub.endpoint, outcome });
    }
    const settled = settleDevice(results);
    await deps.recordResult(deviceId, { success: settled.success, failed: settled.failed, gone: settled.gone });
    log.info("push.test", { sent: settled.success.length, failed: settled.failed.length, removed: settled.gone.length });
    return json({ sent: settled.success.length, failed: settled.failed.length, removed: settled.gone.length }, 200, requestId);
  };
}

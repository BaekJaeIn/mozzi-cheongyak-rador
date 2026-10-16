// 운영 의존성 묶음. 라우트 파일은 여기서 만든 핸들러·서비스만 연결한다.
import "server-only";
import { createLogger } from "@shared/log/logger.ts";
import { createJudgementService } from "@shared/services/judgement-service.ts";
import { createRouteGuard } from "./auth/route-guard";
import { getDb, DbError } from "./db/client";
import { createDeviceRepository } from "./db/device-repository";
import { createJudgementRepository } from "./db/judgement-repository";
import { createNoticeRepository } from "./db/notice-repository";
import { createProfileRepository } from "./db/profile-repository";
import { createReferenceRepository } from "./db/reference-repository";
import { getKeyring } from "./security/keyring";
import { districtsCache, supplyTypeLabelsCache } from "./cache/reference-cache";
import { createFeedRepository } from "./db/feed-repository";
import { createPushRepository } from "./db/push-repository";
import { getVapidEnv } from "./env";
import { createPushKeyHandler, createSubscribeHandler, createTestPushHandler, type PushDeps, SUBSCRIBE_MAX_BODY_BYTES } from "./handlers/push";
import type { TypeLabels } from "./feed/build";
import { createCalendarHandler, createFeedHandler, createNoticeDetailHandler, createNoticeSummariesHandler } from "./handlers/feed";
import {
  createDeleteDeviceHandler,
  createNotifySettingsHandler,
  createSaveProfileHandler,
  NOTIFY_MAX_BODY_BYTES,
  PROFILE_MAX_BODY_BYTES,
} from "./handlers/profile-settings";

export const deviceRepository = () => createDeviceRepository(getDb());
export const profileRepository = () => createProfileRepository(getDb());

export const withDevice = createRouteGuard(() => ({ devices: deviceRepository(), now: () => new Date() }));

/** U4 프로필 저장 API가 사용 (K6) */
export function judgementService() {
  const db = getDb();
  return createJudgementService({
    profiles: createProfileRepository(db),
    notices: createNoticeRepository(db),
    reference: createReferenceRepository(db),
    judgements: createJudgementRepository(db),
    keyring: getKeyring,
    log: createLogger({ component: "judgement-service" }),
  });
}

export async function pingDb(): Promise<void> {
  const { error } = await getDb().from("districts").select("id").limit(1);
  if (error) throw new DbError("health.ping", error);
}

// ---------- U4 API (S3) ----------
export const saveProfileRoute = withDevice(
  createSaveProfileHandler({
    profiles: profileRepository,
    keyring: getKeyring,
    activeDistrictIds: async () => (await districtsCache.get()).filter((d) => d.active).map((d) => d.id),
    recompute: (deviceId, asOf) => judgementService().recomputeForDevice(deviceId, asOf),
    now: () => new Date(),
  }),
  { route: "PUT /api/profile", maxBodyBytes: PROFILE_MAX_BODY_BYTES },
);

export const notifySettingsRoute = withDevice(createNotifySettingsHandler(deviceRepository), {
  route: "PUT /api/notify-settings",
  maxBodyBytes: NOTIFY_MAX_BODY_BYTES,
});

export const deleteDeviceRoute = withDevice(createDeleteDeviceHandler(deviceRepository), { route: "DELETE /api/device" });

// ---------- U5 API (S4) ----------
export const feedRepository = () => createFeedRepository(getDb());

async function typeLabels(): Promise<TypeLabels> {
  const labels = await supplyTypeLabelsCache.get();
  return new Map(labels.map((l) => [l.code, { plain: l.plainLabel, formal: l.formalLabel }]));
}

const feedDeps = {
  feed: feedRepository,
  profiles: profileRepository,
  labels: typeLabels,
  recompute: (deviceId: string, asOf: string) => judgementService().recomputeForDevice(deviceId, asOf),
  now: () => new Date(),
};

export const feedRoute = withDevice(createFeedHandler(feedDeps), { route: "GET /api/feed" });
export const noticeDetailRoute = withDevice(createNoticeDetailHandler(feedDeps), { route: "GET /api/notices/[id]" });
export const noticeSummariesRoute = withDevice(createNoticeSummariesHandler(feedDeps), { route: "GET /api/notices" });
export const noticeCalendarRoute = createCalendarHandler(feedDeps);

// ---------- U6 API (S6) ----------
export const pushRepository = () => createPushRepository(getDb());

const pushDeps: PushDeps = {
  vapid: getVapidEnv,
  feed: feedRepository,
  saveSubscription: (input) => pushRepository().save(input),
  tryTestPush: (deviceId) => pushRepository().tryTest(deviceId),
  listSubscriptions: (deviceId) => pushRepository().list(deviceId),
  recordResult: (deviceId, result) => pushRepository().record(deviceId, result),
  transport: (url, init) => fetch(url, init),
  now: () => new Date(),
};

export const pushKeyRoute = createPushKeyHandler(pushDeps);
export const pushSubscribeRoute = withDevice(createSubscribeHandler(pushDeps), {
  route: "POST /api/push/subscribe",
  maxBodyBytes: SUBSCRIBE_MAX_BODY_BYTES,
});
export const pushTestRoute = withDevice(createTestPushHandler(pushDeps), { route: "POST /api/push/test" });

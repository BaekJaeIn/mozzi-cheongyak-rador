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

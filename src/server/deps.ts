// 운영 의존성 묶음. 라우트 파일은 여기서 만든 핸들러만 연결한다.
import "server-only";
import { createRouteGuard } from "./auth/route-guard";
import { getDb, DbError } from "./db/client";
import { createDeviceRepository } from "./db/device-repository";

export const deviceRepository = () => createDeviceRepository(getDb());

export const withDevice = createRouteGuard(() => ({ devices: deviceRepository(), now: () => new Date() }));

export async function pingDb(): Promise<void> {
  const { error } = await getDb().from("districts").select("id").limit(1);
  if (error) throw new DbError("health.ping", error);
}

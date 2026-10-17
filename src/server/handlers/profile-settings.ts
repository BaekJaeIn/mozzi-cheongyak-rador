// U4 API 핸들러 (S3): PUT /api/profile, PUT /api/notify-settings, DELETE /api/device
// 인증·본문 크기·로그 틀은 route guard(U1)가 맡고, 여기서는 검증·저장만 한다.
// 로그에는 프로필 내용·금액을 남기지 않는다 (BR-U4-103, NFR-2).
import "server-only";
import type { DeviceRepository, ProfileRepository } from "@shared/db/repositories.ts";
import { type IsoDate, toKstDate } from "@shared/domain/dates.ts";
import { parseProfile } from "@shared/domain/profile-migrate.ts";
import type { Keyring } from "@shared/security/amount-cipher.ts";
import { encodeProfile } from "@shared/security/profile-codec.ts";
import type { DeviceContext } from "../auth/route-guard";
import { errorResponse, json, noContent } from "../http/respond";

export const PROFILE_MAX_BODY_BYTES = 16 * 1024;
export const NOTIFY_MAX_BODY_BYTES = 1024;

export interface SaveProfileDeps {
  profiles: () => ProfileRepository;
  keyring: () => Promise<Keyring>;
  /** 활성 지구 ID (기준 데이터 캐시) */
  activeDistrictIds: () => Promise<string[]>;
  /** 이 기기 판정 재계산 (U2 recomputeForDevice) */
  recompute: (deviceId: string, asOf: IsoDate) => Promise<unknown>;
  now: () => Date;
}

/** PUT /api/profile (BR-U4-100·104) */
export function createSaveProfileHandler(deps: SaveProfileDeps) {
  return async ({ deviceId, requestId, log, body }: DeviceContext): Promise<Response> => {
    const checked = parseProfile(body); // 열려 있던 옛 화면이 버전 1을 보내도 옮겨 받는다
    if (!checked.ok) {
      log.warn("profile.invalid", { fields: checked.errors }); // 틀린 항목 이름만
      return errorResponse("BAD_REQUEST", 400, requestId);
    }
    const active = new Set(await deps.activeDistrictIds());
    const unknown = checked.value.prefs.districtIds.filter((id) => !active.has(id));
    if (unknown.length > 0) {
      log.warn("profile.invalid", { fields: ["prefs.districtIds"] });
      return errorResponse("BAD_REQUEST", 400, requestId);
    }

    const fields = await encodeProfile(checked.value, await deps.keyring());
    const profileVersion = await deps.profiles().save(deviceId, fields);
    const now = deps.now();

    try {
      await deps.recompute(deviceId, toKstDate(now));
    } catch (error) {
      // 저장은 성공 — 다음 일일 재계산이 바로잡는다 (BR-U4-68)
      log.error("recompute.device.failed", { error: error instanceof Error ? error.message : String(error) });
    }
    return json({ savedAt: now.toISOString(), profileVersion }, 200, requestId);
  };
}

/** PUT /api/notify-settings (BR-U4-101) */
export function createNotifySettingsHandler(devices: () => DeviceRepository) {
  return async ({ deviceId, requestId, body }: DeviceContext): Promise<Response> => {
    if (typeof body !== "object" || body === null || Array.isArray(body)) return errorResponse("BAD_REQUEST", 400, requestId);
    const keys = Object.keys(body);
    const { hour, enabled } = body as Record<string, unknown>;
    const valid =
      keys.length === 2 &&
      keys.includes("hour") &&
      keys.includes("enabled") &&
      typeof hour === "number" &&
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23 &&
      typeof enabled === "boolean";
    if (!valid) return errorResponse("BAD_REQUEST", 400, requestId);

    await devices().updateNotifySettings(deviceId, { hour: hour as number, enabled: enabled as boolean });
    return json({ hour, enabled }, 200, requestId);
  };
}

/** DELETE /api/device (BR-U4-102). 기기 행 삭제 → 프로필·판정·구독·알림 기록 함께 삭제 */
export function createDeleteDeviceHandler(devices: () => DeviceRepository) {
  return async ({ deviceId, requestId }: DeviceContext): Promise<Response> => {
    await devices().deleteAll(deviceId);
    return noContent(requestId);
  };
}

// U4 API 호출 (U1 api-client 경유: 인증 헤더·1회 재시도·재등록)
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import type { ApiClient } from "@/features/device/api-client";
import type { NotifySettings } from "./model/storage";
import type { ApiOutcome, SyncApi } from "./model/sync";

const putJson = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function createSyncApi(client: ApiClient): SyncApi {
  const outcome = async (p: ReturnType<ApiClient["request"]>): Promise<ApiOutcome> => {
    const r = await p;
    return r.ok ? { ok: true } : { ok: false, status: r.status };
  };
  return {
    putProfile: (profile: HouseholdProfile) => outcome(client.request("/api/profile", putJson(profile))),
    putNotify: (settings: NotifySettings) => outcome(client.request("/api/notify-settings", putJson(settings))),
  };
}

export type DeleteOutcome = "deleted" | "offline";

/** 서버에서 기기를 지운다 (BR-U4-92·93). 재등록하지 않는다. 이미 없으면 지운 것으로 본다 */
export async function deleteDeviceOnServer(client: ApiClient): Promise<DeleteOutcome> {
  const r = await client.request("/api/device", { method: "DELETE" }, { reregister: false });
  if (r.ok) return "deleted";
  if (r.status === 401) return "deleted"; // DEVICE_UNKNOWN·TOKEN_MISMATCH·AUTH_MISSING: 서버에 이 기기의 정보가 없다
  return "offline";
}

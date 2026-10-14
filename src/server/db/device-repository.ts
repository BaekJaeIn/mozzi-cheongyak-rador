// DeviceRepository Node 구현 (C19, BR-U1-02~05, 11, 16)
import "server-only";
import type { DeviceAuthRecord, DeviceRepository, RegisterResult } from "@shared/db/repositories.ts";
import { type DbClient, DbError } from "./client";

const REGISTER_RESULTS: readonly RegisterResult[] = ["created", "existing", "conflict", "rate_limited"];

export function createDeviceRepository(db: DbClient): DeviceRepository {
  return {
    async register(deviceId, tokenHash) {
      const { data, error } = await db.rpc("register_device", { p_id: deviceId, p_token_hash: tokenHash });
      if (error) throw new DbError("register_device", error);
      if (!REGISTER_RESULTS.includes(data as RegisterResult)) throw new DbError("register_device: 알 수 없는 결과", null);
      return data as RegisterResult;
    },

    async findAuth(deviceId): Promise<DeviceAuthRecord | null> {
      const { data, error } = await db
        .from("devices")
        .select("token_hash, last_seen_at")
        .eq("id", deviceId)
        .maybeSingle();
      if (error) throw new DbError("devices.findAuth", error);
      if (!data) return null;
      const row = data as { token_hash: string; last_seen_at: string };
      return { tokenHash: row.token_hash, lastSeenAt: new Date(row.last_seen_at) };
    },

    async touch(deviceId, now) {
      const { error } = await db.from("devices").update({ last_seen_at: now.toISOString() }).eq("id", deviceId);
      if (error) throw new DbError("devices.touch", error);
    },

    async deleteAll(deviceId) {
      const { data, error } = await db.rpc("delete_device", { p_id: deviceId });
      if (error) throw new DbError("delete_device", error);
      return data === true;
    },
  };
}

// ProfileRepository Node 구현 (U2, L-U2-8). save는 U4 저장 API가 사용
import "server-only";
import { storedProfileMapper } from "@shared/db/mappers.ts";
import type { ProfileRepository } from "@shared/db/repositories.ts";
import type { StoredProfileRow } from "@shared/db/types.ts";
import { type DbClient, DbError } from "./client";

const PAGE = 1000;

export function createProfileRepository(db: DbClient): ProfileRepository {
  return {
    async save(deviceId, fields) {
      const { data, error } = await db.rpc("save_device_profile", {
        p_device_id: deviceId,
        p_profile: {
          schema_version: fields.schemaVersion,
          data: fields.data,
          enc_monthly_income: fields.encMonthlyIncome,
          enc_total_asset: fields.encTotalAsset,
          enc_car_value: fields.encCarValue,
        },
      });
      if (error) throw new DbError("save_device_profile", error);
      if (typeof data !== "number") throw new DbError("save_device_profile: 버전 없음", null);
      return data;
    },

    async get(deviceId) {
      const { data, error } = await db
        .from("device_profiles")
        .select("device_id, schema_version, data, enc_monthly_income, enc_total_asset, enc_car_value, profile_version, updated_at")
        .eq("device_id", deviceId)
        .maybeSingle();
      if (error) throw new DbError("device_profiles.get", error);
      return data ? storedProfileMapper.fromRow(data as StoredProfileRow) : null;
    },

    async listDeviceIdsWithProfile() {
      const ids: string[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db.from("device_profiles").select("device_id").order("device_id").range(from, from + PAGE - 1);
        if (error) throw new DbError("device_profiles.list", error);
        const rows = (data ?? []) as { device_id: string }[];
        ids.push(...rows.map((r) => r.device_id));
        if (rows.length < PAGE) return ids;
      }
    },
  };
}

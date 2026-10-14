// JudgementRepository Node 구현 (U2, P-U2-R3: 프로필 버전 확인 RPC)
import "server-only";
import { judgementMapper } from "@shared/db/mappers.ts";
import type { JudgementRepository } from "@shared/db/repositories.ts";
import { type DbClient, DbError } from "./client";

export function createJudgementRepository(db: DbClient): JudgementRepository {
  return {
    async replaceForDevice(deviceId, profileVersion, judgements) {
      // 기기 ID·버전은 RPC 인자로 따로 넘긴다
      const rows = judgements.map((j) => {
        const r = judgementMapper.toRow(j);
        return { notice_id: r.notice_id, verdict: r.verdict, in_district: r.in_district, score: r.score, detail: r.detail, computed_at: r.computed_at };
      });
      const { data, error } = await db.rpc("replace_judgements_for_device", {
        p_device_id: deviceId,
        p_profile_version: profileVersion,
        p_rows: rows,
      });
      if (error) throw new DbError("replace_judgements_for_device", error);
      return data === -1 ? "stale" : "saved";
    },
  };
}

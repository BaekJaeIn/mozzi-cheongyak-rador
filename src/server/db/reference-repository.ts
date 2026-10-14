// ReferenceDataRepository Node 구현 (C18). 기준표·표준 요건 조회는 U2에서 추가한다.
import "server-only";
import { districtMapper } from "@shared/db/mappers.ts";
import type { ReferenceDataRepository } from "@shared/db/repositories.ts";
import type { DistrictRow, SupplyTypeLabel, Tenure } from "@shared/db/types.ts";
import { type DbClient, DbError } from "./client";

export function createReferenceRepository(db: DbClient): ReferenceDataRepository {
  return {
    async listDistricts() {
      const { data, error } = await db
        .from("districts")
        .select("id, name, sido, sigungu, keywords, active, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (error) throw new DbError("districts.list", error);
      return ((data ?? []) as DistrictRow[]).map(districtMapper.fromRow);
    },

    async listSupplyTypeLabels(): Promise<SupplyTypeLabel[]> {
      const { data, error } = await db.from("supply_type_standards").select("code, formal_label, plain_label, tenure");
      if (error) throw new DbError("supply_type_standards.list", error);
      return ((data ?? []) as { code: string; formal_label: string; plain_label: string; tenure: Tenure }[]).map((r) => ({
        code: r.code,
        formalLabel: r.formal_label,
        plainLabel: r.plain_label,
        tenure: r.tenure,
      }));
    },
  };
}

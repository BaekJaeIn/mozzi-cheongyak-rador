// U1·U2 Repository Deno 구현 (CG-1). 쿼리는 src/server/db/*의 Node 구현과 같다 — 바꿀 때 함께 바꾼다.
import { districtMapper, judgementMapper, storedProfileMapper } from "../../_shared/db/mappers.ts";
import type {
  JudgementRepository,
  NoticeRepository,
  ProfileRepository,
  ReferenceDataRepository,
} from "../../_shared/db/repositories.ts";
import type { DistrictRow, StoredProfileRow, SupplyTypeLabel, Tenure } from "../../_shared/db/types.ts";
import type { IncomeBasis } from "../../_shared/domain/requirements.ts";
import { validateRequirements } from "../../_shared/domain/requirements.ts";
import type { IncomeThreshold } from "../../_shared/eligibility/income-table.ts";
import { parseNoticeRegions } from "../../_shared/eligibility/area.ts";
import type { NoticeForJudgement } from "../../_shared/eligibility/types.ts";
import { type DbClient, DbError } from "./client.ts";

const PAGE = 1000;

/** 재계산은 저장하지 않으므로 save는 쓰지 않는다 (U4 저장 API = Node) */
export function createProfileRepository(db: DbClient): Pick<ProfileRepository, "get" | "listDeviceIdsWithProfile"> {
  return {
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

interface NoticeBundleRow {
  id: string;
  tenure: Tenure;
  announced_at: string | null;
  apply_start: string | null;
  apply_end: string | null;
  housing_units: { id: string; supply_type: string; exclusive_area_m2: number | string | null; requirements: unknown }[] | null;
  notice_districts: { district_id: string }[] | null;
  regions: unknown;
}

function toNoticeForJudgement(row: NoticeBundleRow): NoticeForJudgement {
  return {
    id: row.id,
    tenure: row.tenure,
    announcedAt: row.announced_at,
    applyStart: row.apply_start,
    applyEnd: row.apply_end,
    districtIds: (row.notice_districts ?? []).map((d) => d.district_id),
    regions: parseNoticeRegions(row.regions),
    units: (row.housing_units ?? []).map((u) => ({
      id: u.id,
      supplyType: u.supply_type,
      exclusiveAreaM2: u.exclusive_area_m2 === null ? null : Number(u.exclusive_area_m2),
      requirements: validateRequirements(u.requirements) ?? { unclassified: true },
    })),
  };
}

export function createNoticeRepository(db: DbClient): Pick<NoticeRepository, "listRetainedWithUnits"> {
  return {
    async listRetainedWithUnits() {
      const out: NoticeForJudgement[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from("notices")
          .select(
            "id, tenure, announced_at, apply_start, apply_end, regions, housing_units(id, supply_type, exclusive_area_m2, requirements), notice_districts(district_id)",
          )
          .order("id")
          .range(from, from + PAGE - 1);
        if (error) throw new DbError("notices.listRetainedWithUnits", error);
        const rows = (data ?? []) as NoticeBundleRow[];
        out.push(...rows.map(toNoticeForJudgement));
        if (rows.length < PAGE) return out;
      }
    },
  };
}

export function createReferenceRepository(db: DbClient): ReferenceDataRepository {
  return {
    async listDistricts() {
      const { data, error } = await db
        .from("districts")
        .select("id, name, sido, sigungu, keywords, area_keywords, active, sort_order")
        .eq("active", true)
        .order("sort_order");
      if (error) throw new DbError("districts.list", error);
      return ((data ?? []) as DistrictRow[]).map(districtMapper.fromRow);
    },

    async loadIncomeThresholds(): Promise<IncomeThreshold[]> {
      const { data, error } = await db
        .from("income_asset_thresholds")
        .select("year, basis, household_size, amount_won")
        .eq("kind", "monthly_income");
      if (error) throw new DbError("income_asset_thresholds.load", error);
      return ((data ?? []) as { year: number; basis: IncomeBasis; household_size: number; amount_won: number | string }[]).map(
        (r) => ({ year: r.year, basis: r.basis, householdSize: r.household_size, amountWon: Number(r.amount_won) }),
      );
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

export function createJudgementRepository(db: DbClient): JudgementRepository {
  return {
    async replaceForDevice(deviceId, profileVersion, judgements) {
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

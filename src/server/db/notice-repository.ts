// NoticeRepository Node 구현 (U2: 재계산용 묶음 조회, P-U2-P2)
// Supabase(PostgREST)는 한 번에 최대 1,000행만 돌려주므로 페이지로 나눠 읽는다.
import "server-only";
import { noticeMapper } from "@shared/db/mappers.ts";
import type { NoticeRepository } from "@shared/db/repositories.ts";
import type { NoticeRow, Tenure } from "@shared/db/types.ts";
import { validateRequirements } from "@shared/domain/requirements.ts";
import { parseNoticeRegions } from "@shared/eligibility/area.ts";
import type { NoticeForJudgement } from "@shared/eligibility/types.ts";
import { type DbClient, DbError } from "./client";

const PAGE = 1000;

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

export function toNoticeForJudgement(row: NoticeBundleRow): NoticeForJudgement {
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
      // 저장된 요건 형식이 깨졌으면 "확인 필요"가 되도록 분류 실패로 취급 (놓치지 않기)
      requirements: validateRequirements(u.requirements) ?? { unclassified: true },
    })),
  };
}

export function createNoticeRepository(db: DbClient): NoticeRepository {
  return {
    async getById(id) {
      const { data, error } = await db.from("notices").select("*").eq("id", id).maybeSingle();
      if (error) throw new DbError("notices.get", error);
      return data ? noticeMapper.fromRow(data as NoticeRow) : null;
    },

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

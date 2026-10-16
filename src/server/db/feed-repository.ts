// FeedQueryRepository Node 구현 (U5) — 피드·상세·관심 공고 조회
// 공고의 원천 응답(raw)·요건 원본·AI 처리 정보는 읽지 않는다 (BR-U5-134)
import "server-only";
import type { FeedQueryRepository, FeedRow, NoticeBundle, NoticeCore, SourceRow, UnitRow, DistrictInfo } from "../feed/types";
import type { SourceCode, SummaryStatus, Tenure, Verdict } from "@shared/db/types.ts";
import { type DbClient, DbError } from "./client";

const PAGE = 1000;

const NOTICE_COLUMNS =
  "id, title, complex_name, location, provider, primary_source, tenure, announced_at, apply_start, apply_end, result_at, contract_start, contract_end, summary, summary_status, first_seen_at";
const BUNDLE_SELECT = `${NOTICE_COLUMNS}, housing_units(id, label, supply_type, exclusive_area_m2, supply_count), notice_districts(districts(id, name, sort_order)), source_notices(source, original_url, last_seen_at)`;

interface DistrictJoin {
  districts: { id: string; name: string; sort_order: number } | null;
}

interface NoticeRowLite {
  id: string;
  title: string;
  complex_name: string | null;
  location: string | null;
  provider: string;
  primary_source: SourceCode;
  tenure: Tenure;
  announced_at: string | null;
  apply_start: string | null;
  apply_end: string | null;
  result_at: string | null;
  contract_start: string | null;
  contract_end: string | null;
  summary: unknown;
  summary_status: SummaryStatus;
  first_seen_at: string;
}

interface BundleRow extends NoticeRowLite {
  housing_units: { id: string; label: string | null; supply_type: string; exclusive_area_m2: number | string | null; supply_count: number | null }[] | null;
  notice_districts: DistrictJoin[] | null;
  source_notices: { source: SourceCode; original_url: string; last_seen_at: string }[] | null;
}

interface FeedJoinRow {
  verdict: Verdict;
  in_district: boolean;
  score: number | string | null;
  detail: unknown;
  notices: {
    id: string;
    title: string;
    complex_name: string | null;
    tenure: Tenure;
    apply_start: string | null;
    apply_end: string | null;
    first_seen_at: string;
    notice_districts: DistrictJoin[] | null;
  } | null;
}

const toIso = (t: string) => new Date(t).toISOString();

function toDistricts(joins: DistrictJoin[] | null): DistrictInfo[] {
  return (joins ?? []).flatMap((j) => (j.districts ? [{ id: j.districts.id, name: j.districts.name, sortOrder: j.districts.sort_order }] : []));
}

export function toNoticeCore(r: NoticeRowLite): NoticeCore {
  return {
    id: r.id,
    title: r.title,
    complexName: r.complex_name,
    location: r.location,
    provider: r.provider,
    primarySource: r.primary_source,
    tenure: r.tenure,
    announcedAt: r.announced_at,
    applyStart: r.apply_start,
    applyEnd: r.apply_end,
    resultAt: r.result_at,
    contractStart: r.contract_start,
    contractEnd: r.contract_end,
    summary: r.summary,
    summaryStatus: r.summary_status,
    firstSeenAt: toIso(r.first_seen_at),
  };
}

export function toBundle(r: BundleRow): NoticeBundle {
  const units: UnitRow[] = (r.housing_units ?? []).map((u) => ({
    id: u.id,
    label: u.label,
    supplyType: u.supply_type,
    exclusiveAreaM2: u.exclusive_area_m2 === null ? null : Number(u.exclusive_area_m2),
    supplyCount: u.supply_count,
  }));
  const sources: SourceRow[] = (r.source_notices ?? []).map((s) => ({ source: s.source, originalUrl: s.original_url, lastSeenAt: toIso(s.last_seen_at) }));
  return { notice: toNoticeCore(r), units, districts: toDistricts(r.notice_districts), sources };
}

export function toFeedRow(r: FeedJoinRow): FeedRow | null {
  const n = r.notices;
  if (!n) return null;
  return {
    verdict: r.verdict,
    inDistrict: r.in_district,
    score: r.score === null ? null : Number(r.score),
    detail: r.detail,
    notice: {
      id: n.id,
      title: n.title,
      complexName: n.complex_name,
      tenure: n.tenure,
      applyStart: n.apply_start,
      applyEnd: n.apply_end,
      firstSeenAt: toIso(n.first_seen_at),
    },
    districts: toDistricts(n.notice_districts),
  };
}

export function createFeedRepository(db: DbClient): FeedQueryRepository {
  return {
    async listFeedRows(deviceId, today) {
      const out: FeedRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db
          .from("judgements")
          .select(
            "verdict, in_district, score, detail, notices!inner(id, title, complex_name, tenure, apply_start, apply_end, first_seen_at, notice_districts(districts(id, name, sort_order)))",
          )
          .eq("device_id", deviceId)
          .neq("verdict", "ineligible")
          .eq("in_district", true)
          .or(`apply_end.gte.${today},apply_end.is.null`, { referencedTable: "notices" })
          .order("notice_id")
          .range(from, from + PAGE - 1);
        if (error) throw new DbError("judgements.listFeedRows", error);
        const rows = (data ?? []) as unknown as FeedJoinRow[];
        for (const r of rows) {
          const row = toFeedRow(r);
          if (row) out.push(row);
        }
        if (rows.length < PAGE) return out;
      }
    },

    async judgementStats(deviceId) {
      const { data, error, count } = await db
        .from("judgements")
        .select("profile_version", { count: "exact" })
        .eq("device_id", deviceId)
        .order("profile_version", { ascending: true })
        .limit(1);
      if (error) throw new DbError("judgements.stats", error);
      const first = ((data ?? []) as { profile_version: number }[])[0];
      return { count: count ?? 0, minProfileVersion: first ? first.profile_version : null };
    },

    async countNotices() {
      const { error, count } = await db.from("notices").select("id", { count: "exact", head: true });
      if (error) throw new DbError("notices.count", error);
      return count ?? 0;
    },

    async getJudgement(deviceId, noticeId) {
      const { data, error } = await db
        .from("judgements")
        .select("verdict, in_district, detail, profile_version")
        .eq("device_id", deviceId)
        .eq("notice_id", noticeId)
        .maybeSingle();
      if (error) throw new DbError("judgements.get", error);
      if (!data) return null;
      const r = data as { verdict: Verdict; in_district: boolean; detail: unknown; profile_version: number };
      return { verdict: r.verdict, inDistrict: r.in_district, detail: r.detail, profileVersion: r.profile_version };
    },

    async getNoticeBundle(noticeId) {
      const { data, error } = await db.from("notices").select(BUNDLE_SELECT).eq("id", noticeId).maybeSingle();
      if (error) throw new DbError("notices.getBundle", error);
      return data ? toBundle(data as unknown as BundleRow) : null;
    },

    async listNoticeBundles(noticeIds) {
      if (noticeIds.length === 0) return [];
      const { data, error } = await db.from("notices").select(BUNDLE_SELECT).in("id", [...noticeIds]);
      if (error) throw new DbError("notices.listBundles", error);
      return ((data ?? []) as unknown as BundleRow[]).map(toBundle);
    },
  };
}

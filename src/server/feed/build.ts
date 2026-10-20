// 피드·상세·요약 응답 만들기 — DB와 분리한 순수 함수 (BR-U5-01·04·10·22·25·95·100~102·134)
import type { IsoDate } from "@shared/domain/dates.ts";
import { noticeStatus } from "@shared/domain/retention.ts";
import type { SourceCode } from "@shared/db/types.ts";
import { isVisible } from "@shared/eligibility/visibility.ts";
import { labelOf, orderDistricts, parseJudgementDetail, type TypeLabels } from "@shared/feed/visible.ts";
import { orderRegions } from "@shared/feed/place.ts";
import type {
  JudgementView,
  NoticeDetail,
  NoticeSummary,
  SourceLink,
} from "@/features/notice/model/api-types";
import type { JudgementRecord, NoticeBundle, SourceRow } from "./types";

// 피드 노출·정렬은 알림(U6)과 함께 쓰려고 _shared/feed/visible.ts로 옮겼다
export {
  buildFeed,
  feedSupplyTypes,
  labelOf,
  needsRecompute,
  orderDistricts,
  parseJudgementDetail,
  type TypeLabel,
  type TypeLabels,
} from "@shared/feed/visible.ts";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------- 원문 링크 (BR-U5-100~102) ----------

export const SOURCE_LABELS: Readonly<Record<SourceCode, string>> = {
  applyhome: "청약홈",
  lh_rental: "LH 청약플러스",
  myhome_complex: "마이홈",
  sh: "SH 서울주택도시공사",
  gh: "GH 경기주택도시공사",
};

const SOURCE_ORDER: readonly SourceCode[] = ["applyhome", "lh_rental", "sh", "gh", "myhome_complex"];

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function pickSources(sources: readonly SourceRow[], primary: SourceCode): SourceLink[] {
  // 출처마다 마지막으로 확인된 쓸 수 있는 주소 하나
  const best = new Map<SourceCode, SourceRow>();
  for (const s of sources) {
    if (!isHttpUrl(s.originalUrl)) continue;
    const cur = best.get(s.source);
    if (!cur || s.lastSeenAt > cur.lastSeenAt) best.set(s.source, s);
  }
  const ordered = SOURCE_ORDER.filter((code) => best.has(code)).map((code) => best.get(code)!);
  const main = best.get(primary) ?? ordered[0];
  if (!main) return [];
  return [main, ...ordered.filter((s) => s !== main)].map((s) => ({
    source: s.source,
    label: SOURCE_LABELS[s.source],
    url: s.originalUrl,
    primary: s === main,
  }));
}

// ---------- 상세·요약 ----------

/** BR-U5-95: done이고 두 글이 모두 비어 있지 않을 때만 */
export function readSummary(status: string, summary: unknown): NoticeDetail["summary"] {
  if (status !== "done" || !isObject(summary)) return null;
  const a = summary.eligibilityPlain;
  const b = summary.forSeniorCouple;
  if (typeof a !== "string" || typeof b !== "string" || a.trim() === "" || b.trim() === "") return null;
  // 변경 3: 신혼부부가 볼 점은 선택 (BR-U3-D21) — 비면 싣지 않는다
  const c = summary.forNewlywed;
  return typeof c === "string" && c.trim() !== ""
    ? { eligibilityPlain: a.trim(), forSeniorCouple: b.trim(), forNewlywed: c.trim() }
    : { eligibilityPlain: a.trim(), forSeniorCouple: b.trim() };
}

export function toNoticeDetail(bundle: NoticeBundle, today: IsoDate, labels: TypeLabels, interestDistrictIds: readonly string[]): NoticeDetail {
  const n = bundle.notice;
  return {
    id: n.id,
    title: n.title,
    complexName: n.complexName,
    location: n.location,
    provider: n.provider,
    tenure: n.tenure,
    schedule: {
      announcedAt: n.announcedAt,
      applyStart: n.applyStart,
      applyEnd: n.applyEnd,
      resultAt: n.resultAt,
      contractStart: n.contractStart,
      contractEnd: n.contractEnd,
    },
    status: noticeStatus({ applyStart: n.applyStart, applyEnd: n.applyEnd }, today),
    districts: orderDistricts(bundle.districts, new Set(interestDistrictIds)),
    regions: orderRegions(n.regions, []), // 공용 목록 순서 — 관심 지역 순서는 기기에서 (BR-U5-C5)
    units: bundle.units.map((u) => {
      const l = labelOf(labels, u.supplyType);
      return { ...u, plain: l.plain, formal: l.formal };
    }),
    summary: readSummary(n.summaryStatus, n.summary),
    sources: pickSources(bundle.sources, n.primarySource),
    firstSeenAt: n.firstSeenAt,
  };
}

export function toJudgementView(record: JudgementRecord, status: NoticeDetail["status"], currentProfileVersion: number): JudgementView {
  const detail = parseJudgementDetail(record.detail);
  return {
    verdict: record.verdict,
    inDistrict: record.inDistrict,
    visible: isVisible({ verdict: record.verdict, inDistrict: record.inDistrict, status }),
    outdated: record.profileVersion < currentProfileVersion,
    baseDate: detail.baseDate ?? "",
    units: detail.units,
  };
}

export const SUMMARY_SUPPLY_TYPES = 3;

export function toNoticeSummary(bundle: NoticeBundle, today: IsoDate, labels: TypeLabels): NoticeSummary {
  const n = bundle.notice;
  const plains: string[] = [];
  for (const u of bundle.units) {
    const p = labelOf(labels, u.supplyType).plain;
    if (!plains.includes(p)) plains.push(p);
  }
  return {
    id: n.id,
    title: n.title,
    complexName: n.complexName,
    districts: [...bundle.districts].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko")).map((d) => d.name),
    regions: orderRegions(n.regions, []),
    applyStart: n.applyStart,
    applyEnd: n.applyEnd,
    status: noticeStatus({ applyStart: n.applyStart, applyEnd: n.applyEnd }, today),
    supplyTypes: plains.slice(0, SUMMARY_SUPPLY_TYPES),
  };
}

/** 공고 ID 형식 (UUID) — 아니면 DB 조회 없이 404·400 (BR-U5-131·132) */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isNoticeId(id: string): boolean {
  return UUID.test(id);
}

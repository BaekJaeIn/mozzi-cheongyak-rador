// 피드·상세·요약 응답 만들기 — DB와 분리한 순수 함수 (BR-U5-01·04·10·22·25·95·100~102·134)
import type { IsoDate } from "@shared/domain/dates.ts";
import { noticeStatus } from "@shared/domain/retention.ts";
import type { SourceCode } from "@shared/db/types.ts";
import { compareFeedItems } from "@shared/eligibility/scoring.ts";
import type { CriterionKey, CriterionResult, UnitJudgement, UserValueKey, Verdict } from "@shared/eligibility/types.ts";
import { isVisible } from "@shared/eligibility/visibility.ts";
import type {
  DistrictRef,
  FeedItem,
  JudgementView,
  NoticeDetail,
  NoticeSummary,
  SourceLink,
} from "@/features/notice/model/api-types";
import type { DistrictInfo, FeedRow, JudgementRecord, JudgementStats, NoticeBundle, SourceRow } from "./types";

export interface TypeLabel {
  plain: string;
  formal: string;
}
export type TypeLabels = ReadonlyMap<string, TypeLabel>;

const labelOf = (labels: TypeLabels, code: string): TypeLabel => labels.get(code) ?? { plain: code, formal: code };

// ---------- 판정 상세 읽기 ----------

const VERDICTS: readonly Verdict[] = ["eligible", "ineligible", "unknown"];
const CRITERION_KEYS: readonly CriterionKey[] = ["type", "age", "homeless", "income", "asset", "car", "savings", "residence", "household", "welfare"];
const USER_VALUE_KEYS: readonly UserValueKey[] = ["monthlyIncome", "totalAsset", "carValue"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function toCriterion(v: unknown): CriterionResult | null {
  if (!isObject(v)) return null;
  if (!CRITERION_KEYS.includes(v.key as CriterionKey) || !VERDICTS.includes(v.verdict as Verdict)) return null;
  if (typeof v.code !== "string" || typeof v.reason !== "string") return null;
  const c: CriterionResult = { key: v.key as CriterionKey, verdict: v.verdict as Verdict, code: v.code, reason: v.reason };
  if (typeof v.action === "string") c.action = v.action;
  if (USER_VALUE_KEYS.includes(v.userValue as UserValueKey)) c.userValue = v.userValue as UserValueKey;
  return c;
}

/** 저장된 `detail = { baseDate, units }`. 형식이 틀린 주택형·조건은 버린다 */
export function parseJudgementDetail(detail: unknown): { baseDate: IsoDate | null; units: UnitJudgement[] } {
  if (!isObject(detail)) return { baseDate: null, units: [] };
  const units: UnitJudgement[] = [];
  for (const u of Array.isArray(detail.units) ? detail.units : []) {
    if (!isObject(u) || typeof u.unitId !== "string" || typeof u.supplyType !== "string") continue;
    if (!VERDICTS.includes(u.verdict as Verdict)) continue;
    const criteria = (Array.isArray(u.criteria) ? u.criteria : []).map(toCriterion).filter((c): c is CriterionResult => c !== null);
    units.push({ unitId: u.unitId, supplyType: u.supplyType, verdict: u.verdict as Verdict, criteria });
  }
  return { baseDate: typeof detail.baseDate === "string" ? detail.baseDate : null, units };
}

// ---------- 지구 ----------

/** 관심 지구 먼저, 그 안에서 이름 순 (BR-U5-25) */
export function orderDistricts(districts: readonly DistrictInfo[], interest: ReadonlySet<string>): DistrictRef[] {
  return [...districts]
    .sort((a, b) => Number(interest.has(b.id)) - Number(interest.has(a.id)) || a.name.localeCompare(b.name, "ko") || (a.id < b.id ? -1 : 1))
    .map(({ id, name }) => ({ id, name }));
}

// ---------- 피드 ----------

/** 충족·확인 필요 주택형의 공급유형, 처음 나온 순서·중복 없음 (BR-U5-22) */
export function feedSupplyTypes(units: readonly UnitJudgement[], labels: TypeLabels): { code: string; plain: string }[] {
  const out: { code: string; plain: string }[] = [];
  for (const u of units) {
    if (u.verdict === "ineligible" || out.some((s) => s.code === u.supplyType)) continue;
    out.push({ code: u.supplyType, plain: labelOf(labels, u.supplyType).plain });
  }
  return out;
}

export function buildFeed(
  rows: readonly FeedRow[],
  today: IsoDate,
  labels: TypeLabels,
  interestDistrictIds: readonly string[],
): FeedItem[] {
  const interest = new Set(interestDistrictIds);
  const items: FeedItem[] = [];
  for (const row of rows) {
    const n = row.notice;
    const status = noticeStatus({ applyStart: n.applyStart, applyEnd: n.applyEnd }, today);
    if (!isVisible({ verdict: row.verdict, inDistrict: row.inDistrict, status })) continue;
    if (row.verdict === "ineligible" || status === "closed") continue; // isVisible과 같음 — 타입 좁히기
    items.push({
      id: n.id,
      title: n.title,
      complexName: n.complexName,
      districts: orderDistricts(row.districts, interest),
      tenure: n.tenure,
      applyStart: n.applyStart,
      applyEnd: n.applyEnd,
      status,
      verdict: row.verdict,
      score: row.score ?? 0,
      supplyTypes: feedSupplyTypes(parseJudgementDetail(row.detail).units, labels),
      firstSeenAt: n.firstSeenAt,
    });
  }
  return items.sort((a, b) => compareFeedItems({ ...a, noticeId: a.id }, { ...b, noticeId: b.id }));
}

/** 판정을 다시 계산해야 하나 (BR-U5-04) */
export function needsRecompute(stats: JudgementStats, profileVersion: number, noticeCount: number): boolean {
  if (stats.count === 0) return noticeCount > 0;
  return stats.minProfileVersion !== null && stats.minProfileVersion < profileVersion;
}

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
  return { eligibilityPlain: a.trim(), forSeniorCouple: b.trim() };
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

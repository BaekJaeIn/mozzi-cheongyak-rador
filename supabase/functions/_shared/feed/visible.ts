// 피드에 보이는 공고 — 피드(U5, Node)와 알림 발송(U6, Deno)이 **같은 코드**를 쓴다 (US-10 "피드와 똑같다")
// U5 src/server/feed/build.ts에서 옮김 (BR-U5-01·10·22·25, BR-U6-03)
import type { IsoDate } from "../domain/dates.ts";
import { noticeStatus } from "../domain/retention.ts";
import type { Tenure } from "../db/types.ts";
import { compareFeedItems } from "../eligibility/scoring.ts";
import type { RegionPick } from "../domain/profile.ts";
import type { CriterionKey, CriterionResult, NoticeRegion, UnitJudgement, UserValueKey, Verdict } from "../eligibility/types.ts";
import { isVisible } from "../eligibility/visibility.ts";
import { orderRegions } from "./place.ts";

export interface DistrictInfo {
  id: string;
  name: string;
  sortOrder: number;
}

export interface DistrictRef {
  id: string;
  name: string;
}

/** 피드 후보 1행: 판정 + 공고 + 지구 */
export interface FeedRow {
  verdict: Verdict;
  inDistrict: boolean;
  score: number | null;
  detail: unknown;
  notice: {
    id: string;
    title: string;
    complexName: string | null;
    tenure: Tenure;
    applyStart: IsoDate | null;
    applyEnd: IsoDate | null;
    /** ISO 시각 */
    firstSeenAt: string;
    /** 공고 지역 (U3 regions_ai ?? regions). 알림 발송처럼 쓰지 않는 곳은 비워 둬도 된다 (변경 2) */
    regions?: NoticeRegion[];
  };
  districts: DistrictInfo[];
}

export interface FeedItem {
  id: string;
  title: string;
  complexName: string | null;
  /** 관심 지구 먼저, 이름 순 (BR-U5-25) */
  districts: DistrictRef[];
  /** 공고 지역 — 내 관심 지역 먼저 (변경 2 BR-U5-C2). 지구가 없는 공고의 위치 표시 */
  regions: NoticeRegion[];
  tenure: Tenure;
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  status: "open" | "upcoming";
  verdict: "eligible" | "unknown";
  score: number;
  /** 충족·확인 필요 주택형의 공급유형, 중복 없음 (BR-U5-22) */
  supplyTypes: { code: string; plain: string }[];
  firstSeenAt: string;
}

export interface JudgementStats {
  count: number;
  minProfileVersion: number | null;
}

export interface TypeLabel {
  plain: string;
  formal: string;
}
export type TypeLabels = ReadonlyMap<string, TypeLabel>;

export const labelOf = (labels: TypeLabels, code: string): TypeLabel => labels.get(code) ?? { plain: code, formal: code };

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

/** 노출 조건(isVisible)을 통과한 공고를 카드 값으로 바꾸고 피드 순서로 정렬 */
export function buildFeed(
  rows: readonly FeedRow[],
  today: IsoDate,
  labels: TypeLabels,
  interestDistrictIds: readonly string[],
  interestRegions: readonly RegionPick[] = [],
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
      regions: orderRegions(n.regions ?? [], interestRegions),
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

/** 판정을 다시 계산해야 하나 (BR-U5-04, BR-U6-04) */
export function needsRecompute(stats: JudgementStats, profileVersion: number, noticeCount: number): boolean {
  if (stats.count === 0) return noticeCount > 0;
  return stats.minProfileVersion !== null && stats.minProfileVersion < profileVersion;
}

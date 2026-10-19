// 묶음(+추출) → upsert_notice_bundle 입력 (BR-U3-65·66, P-U3-R4)
import type { IsoDate } from "../domain/dates.ts";
import type { Tenure } from "../domain/profile.ts";
import type { Requirements } from "../domain/requirements.ts";
import { resolveRequirements } from "../domain/requirement-resolver.ts";
import { classifySupplyType, type SupplyTypeCode } from "../domain/supply-types.ts";
import type { JsonObject } from "../db/types.ts";
import type { NoticeRegion } from "../eligibility/types.ts";
import { mergedSchedule } from "./grouping.ts";
import { mergeRegions } from "./regions.ts";
import {
  type CollectSource,
  type NoticeBundle,
  type NoticeExtraction,
  type NoticeGroup,
  SCHEDULE_KEYS,
  type Schedule,
} from "./types.ts";

export type StandardRequirements = Readonly<Record<string, Requirements>>;

/** collect(묶음)와 analyze(저장된 공고)가 같이 쓰는 저장 기반 */
export interface BundleBase {
  dedupKey: string;
  title: string;
  complexName: string | null;
  location: string | null;
  sido: string | null;
  sigungu: string | null;
  provider: string;
  primarySource: CollectSource;
  tenure: Tenure;
  supplyType: SupplyTypeCode;
  schedule: Schedule;
  districtIds: string[];
  regions: NoticeRegion[];
  sources: NoticeBundle["sources"];
}

export function baseFromGroup(group: NoticeGroup): BundleBase {
  const p = group.members[0]!;
  return {
    dedupKey: group.dedupKey,
    title: p.title,
    complexName: p.complexName ?? group.members.find((m) => m.complexName)?.complexName ?? null,
    location: p.location ?? group.members.find((m) => m.location)?.location ?? null,
    sido: p.sido,
    sigungu: p.sigungu,
    provider: p.provider,
    primarySource: p.source,
    tenure: p.tenure,
    supplyType: p.supplyType,
    schedule: mergedSchedule(group),
    districtIds: [...new Set(group.members.flatMap((m) => m.districtIds))].sort(),
    regions: mergeRegions(...group.members.map((m) => m.regions)), // 묶음 지역 = 합집합 (BR-U3-C7)
    sources: group.members.map((m) => ({
      source: m.source,
      source_notice_no: m.sourceNoticeNo,
      original_url: m.originalUrl,
      raw: m.raw,
      content_hash: m.contentHash,
      attachments: m.attachments,
    })),
  };
}

const toJson = (r: Requirements) => r as unknown as JsonObject;
const standardOf = (standards: StandardRequirements, type: SupplyTypeCode): Requirements =>
  standards[type] ?? { unclassified: true };

/** BR-U3-65: 추출 주택형이 있으면 주택형마다, 없으면 공고 공급유형으로 1개 (표준 요건) */
export function buildUnits(base: BundleBase, extraction: NoticeExtraction | null, standards: StandardRequirements): NoticeBundle["units"] {
  const units = extraction?.isNotice ? extraction.units : [];
  if (units.length === 0) {
    const standard = standardOf(standards, base.supplyType);
    return [
      {
        label: null,
        supply_type: base.supplyType,
        exclusive_area_m2: null,
        supply_count: null,
        standard_requirements: toJson(standard),
        extracted_requirements: null,
        requirements: toJson(standard),
      },
    ];
  }
  return units.map((u) => {
    const own = classifySupplyType({ text: u.supplyTypeText });
    const type = own === "other" ? base.supplyType : own;
    const standard = standardOf(standards, type);
    return {
      label: u.label,
      supply_type: type,
      exclusive_area_m2: u.exclusiveAreaM2,
      supply_count: u.supplyCount,
      standard_requirements: toJson(standard),
      extracted_requirements: u.requirements ? toJson(u.requirements) : null,
      requirements: toJson(resolveRequirements(standard, u.requirements)),
    };
  });
}

/** BR-U3-66: 소스 일정 우선, 빈 칸만 추출 일정으로 */
export function fillSchedule(source: Schedule, extracted: Schedule | null): Schedule {
  if (!extracted) return source;
  const out = { ...source };
  for (const key of SCHEDULE_KEYS) if (out[key] === null) out[key] = extracted[key];
  return out;
}

export function buildBundle(
  base: BundleBase,
  units: NoticeBundle["units"],
  extra: Pick<NoticeBundle, "summary" | "summary_status" | "ai_attempts" | "ai_source_url" | "release_claim" | "regions_ai"> = {},
  schedule: Schedule = base.schedule,
): NoticeBundle {
  const d = (k: keyof Schedule): IsoDate | null => schedule[k];
  return {
    notice: {
      dedup_key: base.dedupKey,
      title: base.title,
      complex_name: base.complexName,
      location: base.location,
      sido: base.sido,
      sigungu: base.sigungu,
      provider: base.provider,
      primary_source: base.primarySource,
      tenure: base.tenure,
      announced_at: d("announcedAt"),
      apply_start: d("applyStart"),
      apply_end: d("applyEnd"),
      result_at: d("resultAt"),
      contract_start: d("contractStart"),
      contract_end: d("contractEnd"),
      regions: base.regions,
    },
    sources: base.sources,
    units,
    district_ids: base.districtIds,
    ...extra,
  };
}

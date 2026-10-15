// 원천 공고 → 정규화 공고 (BR-U3-11~15·20·22)
import { type DistrictRule, matchDistricts } from "../domain/district-matcher.ts";
import { findSido, normalizeSido } from "../domain/profile.ts";
import { classifySupplyType, compactText, SUPPLY_TYPES } from "../domain/supply-types.ts";
import { extractBlockKey } from "./block-key.ts";
import { contentHash } from "./content-hash.ts";
import { parseSchedule } from "./dates.ts";
import type { NormalizedNotice, RawNotice } from "./types.ts";

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};

const SIGUNGU = /([가-힣]{1,10}(?:시|군))(?:\s*([가-힣]{1,10}구))?|([가-힣]{1,10}구)/;

/** 주소에서 시군구 (예: "경기도 고양시 덕양구 화전동" → "고양시 덕양구"). 시도 이름 부분은 건너뛴다 */
export function extractSigungu(location: string | null): string | null {
  if (!location) return null;
  const withoutSido = location.replace(/^\s*\S+(?:특별시|광역시|특별자치시|특별자치도|도)\s+/, "");
  const m = SIGUNGU.exec(withoutSido);
  if (!m) return null;
  return m[3] ?? (m[2] ? `${m[1]} ${m[2]}` : m[1]!) ?? null;
}

/** 해시 없이 정규화 (동기). 번호·제목이 비면 null (BR-U3-14) */
export function normalizeWithoutHash(
  raw: RawNotice,
  districts: readonly DistrictRule[],
): Omit<NormalizedNotice, "contentHash"> | null {
  const sourceNoticeNo = clean(raw.sourceNoticeNo);
  const title = clean(raw.title);
  if (!sourceNoticeNo || !title) return null;

  const location = clean(raw.location);
  const complexName = clean(raw.complexName);
  const supplyTypeText = clean(raw.supplyTypeText);
  const supplyType = classifySupplyType({ text: `${title} ${supplyTypeText ?? ""}`, source: raw.source }); // BR-U3-12
  const sigungu = clean(raw.sigungu) ?? extractSigungu(location);
  const sidoText = findSido(`${location ?? ""} ${title}`);

  return {
    source: raw.source,
    sourceNoticeNo,
    title,
    complexName,
    location,
    sido: sidoText ? normalizeSido(sidoText) : null, // BR-U3-15
    sigungu,
    provider: clean(raw.provider) ?? raw.source,
    supplyTypeText,
    supplyType,
    tenure: raw.tenureHint ?? SUPPLY_TYPES[supplyType].tenure, // BR-U3-13
    schedule: parseSchedule(raw.dates), // BR-U3-10·11
    districtIds: matchDistricts({ title, complexName, location, sigungu }, districts), // BR-U3-20
    blockKey: extractBlockKey(`${title} ${complexName ?? ""}`),
    originalUrl: raw.originalUrl,
    attachments: raw.attachments.filter((a) => a.url.trim() !== ""),
    raw: raw.raw,
  };
}

export async function normalizeNotice(raw: RawNotice, districts: readonly DistrictRule[]): Promise<NormalizedNotice | null> {
  const n = normalizeWithoutHash(raw, districts);
  return n ? { ...n, contentHash: await contentHash(n) } : null;
}

/**
 * BR-U3-22: 지구는 없지만 6개 지구의 시군구 안에 있는 공고 (동 키워드 보완 후보).
 */
export function isDistrictCandidate(
  n: Pick<NormalizedNotice, "districtIds" | "title" | "location" | "sigungu">,
  districts: readonly DistrictRule[],
): boolean {
  if (n.districtIds.length > 0) return false;
  const text = compactText(`${n.title} ${n.location ?? ""} ${n.sigungu ?? ""}`);
  return districts.some((d) => d.active && d.sigungu.some((s) => text.includes(compactText(s.split(" ").pop() ?? s))));
}

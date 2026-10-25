// 원천 공고 → 정규화 공고 (BR-U3-11~15·20·22)
import { type DistrictRule, matchDistricts } from "../domain/district-matcher.ts";
import { findSido, normalizeSido } from "../domain/profile.ts";
import { classifySupplyType, compactText, SUPPLY_TYPES } from "../domain/supply-types.ts";
import { extractBlockKey } from "./block-key.ts";
import { matchCapitalSigungu, mergeRegions, resolveRegions } from "./regions.ts";
import { findPlaceRegions } from "./place-names.ts";
import { allTargetedAudiences, findAudiences, noticeAttachmentNames } from "./audience-words.ts";
import { NOTICE_AUDIENCES, type NoticeAudience } from "../domain/audiences.ts";
import { isCapitalSido } from "../domain/regions.ts";
import type { NoticeRegion } from "../eligibility/types.ts";
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

const uniqueClean = (texts: readonly string[]): string[] => [...new Set(texts.map(clean).filter((t): t is string => t !== null))];

/** 공급 위치 칸 → 지역. 시도가 없으면 공고 시도, 수도권 밖이면 버린다 (변경 4 BR-U3-E2) */
function locationRegions(texts: readonly string[], noticeSido: string | null): NoticeRegion[] {
  const out: NoticeRegion[] = [];
  for (const text of texts) {
    const named = findSido(text);
    const sido = named ? normalizeSido(named) : noticeSido;
    if (!isCapitalSido(sido)) continue;
    out.push({ sido, sigungu: matchCapitalSigungu(sido, extractSigungu(text), text) });
  }
  return out;
}

/** 공고 대상 = 제목·공급유형 글의 낱말 ∪ 주택형 칸 목록 ∪ 공고문 첨부 목록 (목록은 모든 항목이 대상일 때만, BR-U3-E20) */
function noticeAudiences(title: string, supplyTypeText: string | null, houseTypes: readonly string[], attachmentNames: readonly string[]): NoticeAudience[] {
  const found = [...findAudiences([title, supplyTypeText ?? ""]), ...allTargetedAudiences(houseTypes), ...allTargetedAudiences(attachmentNames)];
  return NOTICE_AUDIENCES.filter((a) => found.includes(a));
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
  const sido = sidoText ? normalizeSido(sidoText) : null;
  const districtIds = matchDistricts({ title, complexName, location, sigungu }, districts); // BR-U3-20
  const attachments = raw.attachments.filter((a) => a.url.trim() !== "");
  const locationTexts = uniqueClean(raw.locationTexts ?? []);
  const hintTexts = uniqueClean([...(raw.hintTexts ?? []), ...noticeAttachmentNames(attachments)]);
  const regions = mergeRegions(
    resolveRegions({ sido, sigungu, text: [location, title, complexName].filter(Boolean).join(" "), districtIds, districts }), // 변경 2
    locationRegions(locationTexts, sido), // 변경 4 BR-U3-E2: 원천 공급 위치 칸
    isCapitalSido(sido) ? findPlaceRegions(sido, [title, complexName ?? "", ...hintTexts]) : [], // 변경 4 BR-U3-E4: 지구 이름
  );

  return {
    source: raw.source,
    sourceNoticeNo,
    title,
    complexName,
    location,
    sido, // BR-U3-15
    sigungu,
    provider: clean(raw.provider) ?? raw.source,
    supplyTypeText,
    supplyType,
    tenure: raw.tenureHint ?? SUPPLY_TYPES[supplyType].tenure, // BR-U3-13
    schedule: parseSchedule(raw.dates), // BR-U3-10·11
    districtIds,
    regions,
    audiences: noticeAudiences(title, supplyTypeText, raw.hintTexts ?? [], noticeAttachmentNames(attachments)), // 변경 4 BR-U3-E20
    locationTexts,
    hintTexts,
    blockKey: extractBlockKey(`${title} ${complexName ?? ""}`),
    originalUrl: raw.originalUrl,
    attachments,
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

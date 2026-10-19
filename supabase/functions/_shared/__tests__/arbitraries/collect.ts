// U3 생성기 (PBT-07): 날짜 문자열 변형, 블록 표기 변형, 원천·정규화 공고
import fc from "fast-check";
import { mergeRegions } from "../../collect/regions.ts";
import type { IsoDate } from "../../domain/dates.ts";
import { formatBlock } from "../../collect/block-key.ts";
import { COLLECT_SOURCES, type NormalizedNotice, type RawNotice, type Schedule } from "../../collect/types.ts";
import { SUPPLY_TYPE_CODES } from "../../domain/supply-types.ts";
import { DISTRICT_IDS, noticeDateArb, noticeRegionArb } from "./eligibility.ts";

/** 유효한 날짜를 원천 형식 중 하나로 */
export const sourceDateArb = fc
  .tuple(noticeDateArb, fc.constantFrom("compact", "dot", "dash", "slash", "dotTime", "dashDay", "spacedDot"))
  .map(([iso, style]) => {
    const [y, m, d] = iso.split("-") as [string, string, string];
    const text = {
      compact: `${y}${m}${d}`,
      dot: `${y}.${m}.${d}`,
      dash: iso,
      slash: `${y}/${Number(m)}/${Number(d)}`,
      dotTime: `${y}.${m}.${d} 10:00`,
      dashDay: `${iso}(월)`,
      spacedDot: `${y}. ${Number(m)}. ${Number(d)}.`,
    }[style];
    return { iso: iso as IsoDate, text };
  });

/** 블록 키 (예: A2, S1, A1-1) */
export const blockKeyArb = fc
  .tuple(fc.constantFrom("A", "B", "S", "C", "AA"), fc.integer({ min: 1, max: 30 }), fc.option(fc.integer({ min: 1, max: 9 }), { nil: null }))
  .map(([letters, n1, n2]) => `${letters}${n1}${n2 ? `-${n2}` : ""}`);

export const blockStyleArb = fc.constantFrom("korean" as const, "hyphenBl" as const, "lowerSpaced" as const);

const scheduleArb: fc.Arbitrary<Schedule> = fc.record({
  announcedAt: fc.option(noticeDateArb, { nil: null }),
  applyStart: fc.option(noticeDateArb, { nil: null }),
  applyEnd: fc.option(noticeDateArb, { nil: null }),
  resultAt: fc.option(noticeDateArb, { nil: null }),
  contractStart: fc.option(noticeDateArb, { nil: null }),
  contractEnd: fc.option(noticeDateArb, { nil: null }),
});

/** 정규화 공고 — 묶기·범위·번들 PBT용. 같은 블록·같은 공고일로 묶일 확률을 높이려고 값 범위를 좁힘 */
export const normalizedArb: fc.Arbitrary<NormalizedNotice> = fc
  .record({
    source: fc.constantFrom(...COLLECT_SOURCES),
    sourceNoticeNo: fc.constantFrom("N1", "N2", "N3", "N4", "N5", "N6"),
    title: fc.string({ minLength: 1, maxLength: 20 }),
    districtIds: fc.subarray(DISTRICT_IDS.slice(0, 2)),
    regions: fc.array(noticeRegionArb, { minLength: 1, maxLength: 2 }).map((r) => mergeRegions(r)),
    blockKey: fc.option(fc.constantFrom("A1", "A2", "S1"), { nil: null }),
    announcedAt: fc.option(fc.constantFrom("2026-10-01", "2026-10-02"), { nil: null }),
    schedule: scheduleArb,
    supplyType: fc.constantFrom(...SUPPLY_TYPE_CODES),
    contentHash: fc.constantFrom("h1", "h2", "h3"),
  })
  .map((r) => ({
    source: r.source,
    sourceNoticeNo: r.sourceNoticeNo,
    title: r.title,
    complexName: null,
    location: null,
    sido: "경기",
    sigungu: null,
    provider: "LH",
    supplyTypeText: null,
    supplyType: r.supplyType,
    tenure: "rent",
    schedule: { ...r.schedule, announcedAt: r.announcedAt },
    districtIds: r.districtIds,
    regions: r.regions,
    blockKey: r.blockKey,
    originalUrl: "https://example.invalid",
    attachments: [],
    raw: null,
    contentHash: r.contentHash,
  }));

export const rawNoticeArb: fc.Arbitrary<RawNotice> = fc.record({
  source: fc.constantFrom(...COLLECT_SOURCES),
  sourceNoticeNo: fc.string({ maxLength: 10 }),
  title: fc.string({ maxLength: 40 }),
  complexName: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  location: fc.option(fc.string({ maxLength: 30 }), { nil: null }),
  sigungu: fc.option(fc.string({ maxLength: 10 }), { nil: null }),
  provider: fc.string({ maxLength: 10 }),
  supplyTypeText: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  tenureHint: fc.constantFrom("sale" as const, "rent" as const, null),
  dates: fc.record({
    announcedAt: fc.option(fc.string({ maxLength: 15 }), { nil: null }),
    applyStart: fc.option(fc.string({ maxLength: 15 }), { nil: null }),
    applyEnd: fc.option(fc.string({ maxLength: 15 }), { nil: null }),
    resultAt: fc.constant(null),
    contractStart: fc.constant(null),
    contractEnd: fc.constant(null),
  }),
  originalUrl: fc.constant("https://example.invalid"),
  attachments: fc.constant([]),
  raw: fc.constant(null),
});

export { formatBlock };

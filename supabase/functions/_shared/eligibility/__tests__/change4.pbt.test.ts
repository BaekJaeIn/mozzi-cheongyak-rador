// 속성 기반 테스트 — 변경 요청 4 (business-logic-model §8.2, P-C4-1~6)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { AUDIENCE_ALLOWED, audienceBlocked, NOTICE_AUDIENCES } from "../../domain/audiences.ts";
import { normalizeRegionPicks } from "../../domain/profile.ts";
import { noticeStatus } from "../../domain/retention.ts";
import { classifySupplyType } from "../../domain/supply-types.ts";
import {
  DISTRICT_IDS,
  newlywedProfileArb,
  noticeArb,
  noticeDateArb,
  noticeRegionArb,
  profileArb,
  regionPicksArb,
  requirementsArb,
} from "../../__tests__/arbitraries/eligibility.ts";
import { REFERENCE_2026 } from "../../__tests__/fixtures.ts";
import { inInterestArea } from "../area.ts";
import { judgeNotice, judgeUnit } from "../engine.ts";
import { judgeNotice as change3JudgeNotice } from "./legacy/change3/engine.ts";
import { isVisible } from "../visibility.ts";

const audiencesArb = fc.subarray([...NOTICE_AUDIENCES]);
const kindArb = fc.constantFrom("senior" as const, "newlywed" as const);
const anyProfileArb = fc.oneof(profileArb({ nullable: true }), newlywedProfileArb);
const areaNoticeArb = fc.record({ districtIds: fc.subarray(DISTRICT_IDS), regions: fc.array(noticeRegionArb, { maxLength: 3 }) });
const areaPrefsArb = fc.record({ districtIds: fc.subarray(DISTRICT_IDS), regions: regionPicksArb });

test.prop([areaNoticeArb, areaPrefsArb, areaPrefsArb])("P-C4-1 관심 지역·지구를 늘리면 안이던 공고는 계속 안", (n, small, extra) => {
  const bigger = {
    districtIds: [...new Set([...small.districtIds, ...extra.districtIds])],
    regions: normalizeRegionPicks([...small.regions, ...extra.regions]),
  };
  if (inInterestArea(n, small)) expect(inInterestArea(n, bigger)).toBe(true);
});

test.prop([fc.array(fc.constantFrom("서울" as const, "경기" as const, "인천" as const), { minLength: 1, maxLength: 3 }), areaPrefsArb])(
  "P-C4-2 시도까지만 공고(지구 없음)는 그 시도 전체를 골랐을 때만 안",
  (sidos, prefs) => {
    const n = { districtIds: [], regions: sidos.map((sido) => ({ sido, sigungu: null })) };
    const oracle = prefs.regions.some((p) => p.sigungu === null && sidos.includes(p.sido));
    expect(inInterestArea(n, prefs)).toBe(oracle);
  },
);

test.prop([kindArb, audiencesArb, fc.constantFrom(...NOTICE_AUDIENCES)])("P-C4-3 대상 막힘 = 표 정의, 허용 대상을 더하면 풀리기만 한다", (kind, audiences, extra) => {
  const blocked = audienceBlocked(kind, audiences);
  const oracle = audiences.length > 0 && !audiences.some((a) => AUDIENCE_ALLOWED[kind].has(a));
  expect(blocked !== null).toBe(oracle);
  if (blocked) expect(audiences).toContain(blocked);
  if (AUDIENCE_ALLOWED[kind].has(extra)) expect(audienceBlocked(kind, [...audiences, extra])).toBeNull();
  if (blocked === null) expect(audiences.length === 0 || audiences.some((a) => AUDIENCE_ALLOWED[kind].has(a))).toBe(true);
});

test.prop([anyProfileArb, noticeArb, audiencesArb, noticeDateArb])("P-C4-4 대상이 막힌 공고는 미충족이고 피드·알림에 보이지 않는다", (p, raw, audiences, asOf) => {
  const n = { ...raw, audiences };
  const j = judgeNotice(p, n, REFERENCE_2026, asOf);
  if (audienceBlocked(p.householdKind, audiences) === null) return;
  expect(j.verdict).toBe("ineligible");
  for (const u of j.units) expect(u.criteria.map((c) => c.key)).toEqual(["audience"]);
  expect(isVisible({ verdict: j.verdict, inDistrict: j.inDistrict, status: noticeStatus(n, asOf) })).toBe(false);
});

// 변경 4로 신혼 가구 판정이 바뀐 공급유형 (BR-U2-E22) — 그 밖은 변경 3 결과와 같아야 한다
const NEWLYWED_CHANGED = new Set(["happy_senior", "national_rental_senior", "happy_unknown", "national_rental_unknown"]);

test.prop([anyProfileArb, noticeArb, noticeDateArb])("P-C4-5 대상 없음 + 지역이 시군구까지 확인된 공고: 변경 4 결과 = 변경 3 결과", (p, raw, asOf) => {
  const regions = raw.regions.filter((r) => r.sigungu !== null);
  const units = p.householdKind === "newlywed" ? raw.units.filter((u) => !NEWLYWED_CHANGED.has(u.supplyType)) : raw.units;
  const n = { ...raw, regions, units, audiences: [] };
  expect(judgeNotice(p, n, REFERENCE_2026, asOf)).toEqual(change3JudgeNotice(p, n, REFERENCE_2026, asOf));
});

test.prop([profileArb({ nullable: true }), requirementsArb, fc.option(fc.integer({ min: 20, max: 140 }), { nil: null }), noticeDateArb])(
  "P-C4-5 노부부: 계층 모름 주택형 판정 = 같은 요건의 고령자 계층 판정 (이름 제외)",
  (p, requirements, area, baseDate) => {
    for (const [unknown, senior] of [["happy_unknown", "happy_senior"], ["national_rental_unknown", "national_rental_senior"]] as const) {
      const a = judgeUnit(p, { id: "u", supplyType: unknown, exclusiveAreaM2: area, requirements }, REFERENCE_2026, baseDate);
      const b = judgeUnit(p, { id: "u", supplyType: senior, exclusiveAreaM2: area, requirements }, REFERENCE_2026, baseDate);
      expect({ ...a, supplyType: "" }).toEqual({ ...b, supplyType: "" });
    }
  },
);

const WORDS = ["행복주택", "국민임대", "영구임대", "공공분양", "민영", "통합공공임대", "청년", "기숙사", "연천BIX", " ", "A2"];
const textArb = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 5 }).map((ws) => ws.join(""));

test.prop([textArb, fc.constantFrom("applyhome" as const, "lh_rental" as const, null), fc.constantFrom("고령자", "어르신")])(
  "P-C4-6 고령자 말이 없으면 *_senior로 분류하지 않고, 고령자 말을 더하면 *_unknown → *_senior만 바뀐다",
  (text, source, word) => {
    const code = classifySupplyType({ text, source });
    expect(["happy_senior", "national_rental_senior"]).not.toContain(code);
    const withWord = classifySupplyType({ text: `${text}${word}`, source });
    const tier: Record<string, string> = { happy_unknown: "happy_senior", national_rental_unknown: "national_rental_senior" };
    expect(withWord).toBe(tier[code] ?? code);
  },
);

// 속성 기반 테스트 — U5 변경 2 (domain-entities §8.3, P-U5-C1~C3)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { noticeRegionArb, regionPicksArb } from "../../__tests__/arbitraries/eligibility.ts";
import { regionMatches } from "../../eligibility/area.ts";
import { orderRegions, placeNames, summaryView } from "../place.ts";

const regionsArb = fc.array(noticeRegionArb, { maxLength: 6 });
const key = (r: { sido: string; sigungu: string | null }) => `${r.sido}|${r.sigungu ?? "*"}`;

test.prop([regionsArb, regionPicksArb])("P-U5-C1 orderRegions는 순열이고 관심 지역에 드는 것이 모두 앞에 온다", (regions, interest) => {
  const out = orderRegions(regions, interest);
  expect(out.map(key).sort()).toEqual(regions.map(key).sort());
  const flags = out.map((r) => interest.some((p) => regionMatches(r, p)));
  const firstOut = flags.indexOf(false);
  if (firstOut >= 0) expect(flags.slice(firstOut).every((f) => !f)).toBe(true);
  expect(orderRegions(out, interest)).toEqual(out); // 다시 정렬해도 같다
});

test.prop([fc.array(fc.string({ minLength: 1, maxLength: 8 }), { maxLength: 4 }), regionsArb])(
  "P-U5-C2 지구나 지역이 있으면 위치 이름은 비지 않고, 지구가 있으면 지구 이름만",
  (districts, regions) => {
    const names = placeNames(districts, regions);
    if (districts.length + regions.length > 0) expect(names.length).toBeGreaterThan(0);
    if (districts.length > 0) expect(names).toEqual(districts);
    else expect(names).toHaveLength(regions.length);
  },
);

test.prop([fc.option(fc.record({ eligibilityPlain: fc.string(), forSeniorCouple: fc.string() }), { nil: null }), fc.option(fc.record({ inDistrict: fc.boolean() }), { nil: null })])(
  "P-U5-C3 '관심 지역 밖'이면 요약이 없고 판정이 관심 지역 밖, 요약이 있으면 항상 요약",
  (summary, judgement) => {
    const view = summaryView(summary, judgement);
    if (summary !== null) expect(view).toBe("summary");
    if (view === "outOfArea") expect(summary === null && judgement !== null && !judgement.inDistrict).toBe(true);
  },
);

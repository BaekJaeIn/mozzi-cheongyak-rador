// 속성 기반 테스트 — U3 변경 3 (business-logic-model 변경 3 절, P-U3-D1~D4)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { classifySupplyType } from "../../domain/supply-types.ts";
import { classifySupplyType as legacyClassify } from "../../eligibility/__tests__/legacy/supply-types.ts";
import { requirementsArb } from "../../__tests__/arbitraries/eligibility.ts";
import { STANDARD_REQUIREMENTS } from "../../eligibility/reference-data.ts";
import { mergeRequirements } from "../../eligibility/routes.ts";
import { runAnalyze } from "../analyze-orchestrator.ts";
import { runCollect } from "../collect-orchestrator.ts";
import { parseExtraction } from "../extraction.ts";
import { createMemoryCollectRepo, fakeClock, fakeExtractor, fakePdf, fakeRecomputer, mockCollectors, TODAY } from "../../__tests__/collect-fakes.ts";

const WORDS = ["행복주택", "국민임대", "영구임대", "공공분양", "민영", "고령자", "일반공급", "특별공급", "신혼부부", "신혼", "생애최초", "신혼희망타운", "무순위", "통합공공임대", "뉴:홈", " ", "A2"];
const textArb = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 5 }).map((ws) => ws.join(""));
/** 변경 4 BR-U2-E20: 고령자 말이 없으면 국민임대·행복주택은 계층 모름 */
const withUnknownTier = (code: string, text: string) =>
  text.includes("고령자") || text.includes("어르신") ? code : ({ national_rental_senior: "national_rental_unknown", happy_senior: "happy_unknown" }[code] ?? code);
const EARLY = ["무순위", "잔여세대", "계약취소", "취소후재공급", "고령자복지주택"];

test.prop([textArb, fc.constantFrom("applyhome" as const, "lh_rental" as const, null)])("P-U3-D1 분류 순서: 신혼희망타운·임대+신혼은 항상 그 코드, 신혼·생애최초 낱말이 없으면 변경 3 전과 같다", (text, source) => {
  const code = classifySupplyType({ text, source });
  const early = EARLY.some((w) => text.includes(w));
  if (!early && text.includes("신혼희망타운")) expect(code).toBe("newlywed_hope_town");
  else if (!early && text.includes("신혼") && ["행복주택", "국민임대", "영구임대", "통합공공임대"].some((w) => text.includes(w))) expect(code).toBe("rental_newlywed_supply");
  if (!text.includes("신혼") && !text.includes("생애최초")) expect(code).toBe(withUnknownTier(legacyClassify({ text, source }), text));
});

test.prop([requirementsArb, fc.constantFrom("newlywed_special_supply" as const, "first_time_supply" as const, "rental_newlywed_supply" as const)])(
  "P-U3-D2 요건 합치기: 표준·공고문 키의 합집합, 공고문 키는 공고문 값 그대로",
  (notice, code) => {
    const merged = mergeRequirements(STANDARD_REQUIREMENTS[code], notice);
    if (notice.unclassified) {
      expect(merged).toEqual(notice);
      return;
    }
    expect(new Set(Object.keys(merged))).toEqual(new Set([...Object.keys(STANDARD_REQUIREMENTS[code]), ...Object.keys(notice)]));
    for (const [k, v] of Object.entries(notice)) expect((merged as Record<string, unknown>)[k]).toEqual(v);
  },
);

test.prop([fc.jsonValue(), fc.record({ eligibilityPlain: fc.string({ minLength: 1 }), forSeniorCouple: fc.string({ minLength: 1 }) }), fc.anything()])(
  "P-U3-D3 어떤 JSON이 와도 추출 검증은 예외가 없고, forNewlywed가 틀려도 나머지 요약은 살아 있다",
  (any, summary, newlywed) => {
    expect(() => parseExtraction(any)).not.toThrow();
    const parsed = parseExtraction({ isNotice: true, units: [], summary: { ...summary, forNewlywed: newlywed } });
    if (summary.eligibilityPlain.trim() && summary.forSeniorCouple.trim()) {
      expect(parsed!.summary).toMatchObject({ eligibilityPlain: summary.eligibilityPlain.trim().slice(0, 600), forSeniorCouple: summary.forSeniorCouple.trim().slice(0, 600) });
    }
  },
);

test.prop([fc.constantFrom("invalid", "throw", "not_notice")], { numRuns: 6 })("P-U3-D4 다시 분석이 실패하면 기존 요약·주택형·판은 바뀌지 않는다", async (mode) => {
  const box = createMemoryCollectRepo();
  await runCollect({ collectors: mockCollectors(), repo: box.repo, recomputer: fakeRecomputer(), clock: fakeClock() }, { runId: "r", today: TODAY });
  for (const n of box.notices.values()) Object.assign(n, { summaryStatus: "done", summary: { eligibilityPlain: "옛", forSeniorCouple: "옛" }, analysisVersion: 1 });
  const before = new Map([...box.notices.values()].map((n) => [n.id, JSON.stringify({ s: n.summary, u: n.bundle.units, v: n.analysisVersion })]));
  const extractor = fakeExtractor(() => {
    if (mode === "throw") throw new Error("gemini down");
    return mode === "invalid" ? { isNotice: "x" } : { isNotice: false, units: [] };
  });
  const clock = fakeClock();
  await runAnalyze({ repo: box.repo, pdf: fakePdf(), extractor, recomputer: fakeRecomputer(), clock }, { runId: "a", today: TODAY, startedAtMs: clock.nowMs() });
  for (const n of box.notices.values()) expect(JSON.stringify({ s: n.summary, u: n.bundle.units, v: n.analysisVersion })).toBe(before.get(n.id));
});

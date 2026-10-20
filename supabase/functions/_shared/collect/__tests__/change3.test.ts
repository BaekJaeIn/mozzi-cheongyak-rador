// 변경 요청 3 예시 — 신혼 물량 분류, 추출 새 항목, 신혼부부가 볼 점, 다시 분석 (business-rules §11)
import { describe, expect, it } from "vitest";
import { classifySupplyType } from "../../domain/supply-types.ts";
import { makeProfile, makeUnit, REFERENCE_2026 } from "../../__tests__/fixtures.ts";
import { judgeUnit } from "../../eligibility/engine.ts";
import { mergeRequirements } from "../../eligibility/routes.ts";
import { STANDARD_REQUIREMENTS } from "../../eligibility/reference-data.ts";
import { ANALYSIS_VERSION, runAnalyze } from "../analyze-orchestrator.ts";
import { runCollect } from "../collect-orchestrator.ts";
import { flatToRequirements, parseExtraction } from "../extraction.ts";
import { RESPONSE_SCHEMA, buildUserPrompt } from "../prompt.ts";
import { createMemoryCollectRepo, fakeClock, fakeExtractor, fakePdf, fakeRecomputer, mockCollectors, REANALYSIS_PER_DAY, TODAY } from "../../__tests__/collect-fakes.ts";

describe("신혼 물량 분류 (BR-U3-D1)", () => {
  it.each([
    ["신혼희망타운 공공분양", "newlywed_hope_town"],
    ["행복주택 신혼부부", "rental_newlywed_supply"],
    ["국민임대 신혼부부 우선공급", "rental_newlywed_supply"],
    ["신혼부부 특별공급", "newlywed_special_supply"],
    ["신혼부부특공", "newlywed_special_supply"],
    ["생애최초 특별공급", "first_time_supply"],
    ["무순위 신혼부부", "unranked"], // 무순위가 먼저
    ["고령자복지주택", "senior_welfare"],
    ["행복주택 고령자", "happy_senior"], // 신혼 낱말 없음 → 지금 규칙 그대로
    ["공공분양 일반공급", "public_sale_general"],
  ])("%s → %s", (text, code) => {
    expect(classifySupplyType({ text })).toBe(code);
  });
});

describe("신혼 물량 줄 판정 (BR-U3-D3~D5, BR-U2-D51·D52)", () => {
  const newlywed = {
    ...makeProfile({ self: { birthDate: "1994-05-01" }, spouse: { birthDate: "1995-08-01" } }),
    householdKind: "newlywed" as const,
    savings: { has: true, owner: "self" as const, kind: "comprehensive" as const, months: 24, paymentCount: 24, depositManwon: 600 },
    money: { monthlyIncome: 700, spouseMonthlyIncome: 300, totalAsset: 20_000, carValue: 1_500, spouseEarns: true },
    newlywed: { marriage: "engaged" as const, marriageDate: "2027-03-20", children: 0, neverOwnedHome: true, incomeTax5y: true, spouseSavings: null },
  };

  it("공고문 요건(예비신혼 허용)이 표준을 덮어쓰고, 공고문에 없는 혼인 기간은 표준으로 채운다", () => {
    const unit = makeUnit("newlywed_special_supply", 59, { marriage: { maxYears: 7, engagedAllowed: true } });
    const u = judgeUnit(newlywed, unit, REFERENCE_2026, "2026-11-02");
    expect(u.routes!.map((r) => r.route)).toEqual(["newlywed_special"]);
    expect(u.verdict).toBe("eligible");
    expect(u.criteria.find((c) => c.key === "marriage")!.code).toBe("marriage_engaged_ok");
    expect(u.criteria.find((c) => c.key === "income")!.reason).toContain("일반적인 기준이에요"); // 소득은 표준값
  });

  it("공고문에서 온 조건에는 '일반적인 기준' 꼬리가 없다", () => {
    const unit = makeUnit("newlywed_special_supply", 59, { income: { basis: "urban_worker", percent: 140, dualIncomePercent: 160 } });
    const u = judgeUnit(newlywed, unit, REFERENCE_2026, "2026-11-02");
    expect(u.criteria.find((c) => c.key === "income")!.reason).not.toContain("일반적인 기준이에요");
  });

  it("노부부 가구에게 신혼·생애최초 물량 줄은 미충족, 판정 형식은 지금과 같다(routes 없음)", () => {
    for (const code of ["newlywed_special_supply", "first_time_supply", "rental_newlywed_supply"] as const) {
      const u = judgeUnit(makeProfile(), makeUnit(code), REFERENCE_2026, "2026-11-02");
      expect(u).toMatchObject({ verdict: "ineligible", criteria: [{ code: "type_newlywed_only", reason: "신혼부부·생애최초 대상 물량이에요" }] });
      expect(u.routes).toBeUndefined();
    }
  });

  it("합치기: 표준 키 + 공고문 키, 공고문 값 우선, 분류 불가는 그대로", () => {
    const merged = mergeRequirements(STANDARD_REQUIREMENTS.newlywed_special_supply, { savings: { minMonths: 24 } });
    expect(merged.savings).toEqual({ minMonths: 24 });
    expect(merged.marriage).toEqual(STANDARD_REQUIREMENTS.newlywed_special_supply.marriage);
    expect(mergeRequirements(STANDARD_REQUIREMENTS.newlywed_special_supply, { unclassified: true })).toEqual({ unclassified: true });
  });
});

describe("추출 새 항목 (BR-U3-D10~D12, D20·D21)", () => {
  it("지시문·스키마에 신혼 물량·새 칸·신혼부부가 볼 점", () => {
    const prompt = buildUserPrompt({ title: "t", supplyTypeHint: "h" });
    expect(prompt).toContain("신혼부부 특별공급·생애최초 특별공급·신혼희망타운");
    expect(prompt).toContain("summary.forNewlywed");
    const props = RESPONSE_SCHEMA.properties.units.items.properties.requirements.properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["marriageMaxYears", "preNewlywedAllowed", "firstTimeIncomeTaxYears", "incomePriorityPercent", "lotteryRealEstateMaxManwon"]));
  });

  it("혼인·예비신혼·생애최초·우선·추첨 → U2 요건", () => {
    expect(
      flatToRequirements({
        marriageMaxYears: 7,
        preNewlywedAllowed: true,
        firstTimeIncomeTaxYears: 5,
        incomeBasis: "urban_worker",
        incomePercent: 140,
        incomeDualPercent: 160,
        incomePriorityPercent: 100,
        incomePriorityDualPercent: 120,
        lotteryRealEstateMaxManwon: 33100,
      }),
    ).toEqual({
      marriage: { maxYears: 7, engagedAllowed: true },
      firstTime: { neverOwned: true, incomeTaxYears: 5, marriedOrChildRequired: true },
      income: { basis: "urban_worker", percent: 140, dualIncomePercent: 160, priorityPercent: 100, priorityDualIncomePercent: 120, overLottery: { realEstateMaxManwon: 33100 } },
    });
    expect(flatToRequirements({ marriageMaxYears: 7, preNewlywedAllowed: null })?.marriage).toEqual({ maxYears: 7, engagedAllowed: "unknown" });
  });

  it("신혼부부가 볼 점은 선택 — 틀려도 나머지 요약은 살아 있다", () => {
    const base = { isNotice: true, units: [], summary: { eligibilityPlain: "가", forSeniorCouple: "나" } };
    expect(parseExtraction({ ...base, summary: { ...base.summary, forNewlywed: "다" } })!.summary).toEqual({ eligibilityPlain: "가", forSeniorCouple: "나", forNewlywed: "다" });
    expect(parseExtraction({ ...base, summary: { ...base.summary, forNewlywed: 3 } })!.summary).toEqual({ eligibilityPlain: "가", forSeniorCouple: "나" });
  });
});

describe("다시 분석 (BR-U3-D30~D33)", () => {
  async function analyzedBox() {
    const box = createMemoryCollectRepo();
    await runCollect({ collectors: mockCollectors(), repo: box.repo, recomputer: fakeRecomputer(), clock: fakeClock() }, { runId: "r", today: TODAY });
    return box;
  }
  const analyze = (box: ReturnType<typeof createMemoryCollectRepo>, extractor = fakeExtractor(), clock = fakeClock()) =>
    runAnalyze({ repo: box.repo, pdf: fakePdf(), extractor, recomputer: fakeRecomputer(), clock }, { runId: "a", today: TODAY, startedAtMs: clock.nowMs() });

  it("새 분석은 판 2, 판 1 요약 완료 공고는 남는 몫으로 다시 분석해 판 2", async () => {
    const box = await analyzedBox();
    // 변경 3 전에 분석된 것처럼: 모두 요약 완료·판 1
    for (const n of box.notices.values()) Object.assign(n, { summaryStatus: "done", summary: { eligibilityPlain: "옛 요약", forSeniorCouple: "옛" }, analysisVersion: 1 });
    const s = await analyze(box);
    const re = s.outcomes.filter((o) => o.status === "done" && o.reanalysis);
    expect(re.length).toBe(2); // 새 공고 없음 → 배치 2개 모두 다시 분석
    for (const o of re) expect(box.notices.get(o.noticeId)!.analysisVersion).toBe(ANALYSIS_VERSION);
  });

  it("다시 분석이 실패하면 기존 요약·판은 그대로, 시도 +1", async () => {
    const box = await analyzedBox();
    for (const n of box.notices.values()) Object.assign(n, { summaryStatus: "done", summary: { eligibilityPlain: "옛 요약", forSeniorCouple: "옛" }, analysisVersion: 1 });
    const s = await analyze(box, fakeExtractor(() => ({ isNotice: "깨짐" })));
    const failed = s.outcomes.filter((o) => o.status === "failed");
    expect(failed.length).toBe(2);
    for (const o of failed) {
      const n = box.notices.get(o.noticeId)!;
      expect(n).toMatchObject({ summaryStatus: "done", analysisVersion: 1, reanalysisAttempts: 1, claimedAt: null });
      expect(n.summary?.eligibilityPlain).toBe("옛 요약");
    }
  });

  it("다시 분석은 한국 날짜 하루 5건까지", async () => {
    const box = await analyzedBox();
    for (const n of box.notices.values()) Object.assign(n, { summaryStatus: "done", analysisVersion: 1 });
    const extractor = fakeExtractor(() => ({ isNotice: "깨짐" })); // 실패시켜 판 1로 남긴다
    const clock = fakeClock();
    let total = 0;
    for (let i = 0; i < 6; i++) {
      const s = await analyze(box, extractor, clock);
      total += s.claimed;
      clock.advance(11 * 60 * 1000); // 예약 만료 뒤
    }
    expect(total).toBeLessThanOrEqual(REANALYSIS_PER_DAY);
  });
});

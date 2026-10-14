// 예시 기반 테스트 — 판정 핵심 시나리오 9개 (business-logic-model §4·§5, PBT-10)
import { describe, expect, it } from "vitest";
import { judgeNotice } from "../engine.ts";
import { STANDARD_REQUIREMENTS } from "../reference-data.ts";
import { makeNotice, makeProfile, makeUnit, REFERENCE_2026 } from "../../__tests__/fixtures.ts";
import type { CriterionKey, NoticeJudgement } from "../types.ts";

const criterion = (j: NoticeJudgement, key: CriterionKey, unit = 0) => j.units[unit]!.criteria.find((c) => c.key === key);

describe("① 행복주택 고령자 예시 (business-logic-model §4)", () => {
  const j = judgeNotice(makeProfile(), makeNotice([makeUnit("happy_senior", 36)]), REFERENCE_2026, "2026-10-14");

  it("공고 충족, 관심 지구, 점수 2", () => {
    expect(j).toMatchObject({ verdict: "eligible", inDistrict: true, score: 2, baseDate: "2026-09-15" });
  });

  it("조건별 사유는 기준 값만 담는다", () => {
    expect(criterion(j, "age")?.reason).toBe("만 65세 이상 → 두 분 중 만 66세인 분이 있어요");
    expect(criterion(j, "income")?.reason).toBe("2인 가구 기준 월 645만 2,897원 이하");
    expect(criterion(j, "income")?.userValue).toBe("monthlyIncome");
    expect(criterion(j, "asset")?.reason).toBe("총자산 3억 4,500만원 이하");
    expect(criterion(j, "car")?.reason).toBe("자동차 4,542만원 이하");
  });
});

describe("② 만 64세 / 65세 경계 (모집공고일 2026-09-15 기준)", () => {
  const notice = makeNotice([makeUnit("happy_senior")]);
  it("모집공고일 다음 날이 생일이면 아직 64세 → 미충족", () => {
    const p = makeProfile({ self: { birthDate: "1961-09-16" }, spouse: { birthDate: "1965-01-01" } });
    expect(criterion(judgeNotice(p, notice, REFERENCE_2026, "2026-10-14"), "age")?.verdict).toBe("ineligible");
  });
  it("모집공고일이 생일이면 65세 → 충족", () => {
    const p = makeProfile({ self: { birthDate: "1961-09-15" }, spouse: { birthDate: "1965-01-01" } });
    expect(criterion(judgeNotice(p, notice, REFERENCE_2026, "2026-10-14"), "age")?.verdict).toBe("eligible");
  });
  it("배우자만 65세여도 충족 (가구 단위, Q1=A)", () => {
    const p = makeProfile({ self: { birthDate: "1970-01-01" }, spouse: { birthDate: "1960-01-01" } });
    expect(criterion(judgeNotice(p, notice, REFERENCE_2026, "2026-10-14"), "age")?.verdict).toBe("eligible");
  });
});

describe("③ 2인 가구 소득 경계 (행복주택 110% = 6,452,897원)", () => {
  const notice = makeNotice([makeUnit("happy_senior")]);
  it("월 645만원 → 충족", () => {
    const p = makeProfile({ money: { monthlyIncome: 645 } });
    expect(criterion(judgeNotice(p, notice, REFERENCE_2026, "2026-10-14"), "income")?.verdict).toBe("eligible");
  });
  it("월 646만원 → 미충족", () => {
    const p = makeProfile({ money: { monthlyIncome: 646 } });
    expect(criterion(judgeNotice(p, notice, REFERENCE_2026, "2026-10-14"), "income")?.verdict).toBe("ineligible");
  });
  it("공고 금액이 있으면 공고 금액을 쓴다 (Q4=A)", () => {
    const unit = makeUnit("happy_senior", 36, {
      ...STANDARD_REQUIREMENTS.happy_senior,
      income: { basis: "urban_worker", percent: 100, percentBySize: { 2: 110 }, amountsWon: { 2: 6_500_000 } },
    });
    const p = makeProfile({ money: { monthlyIncome: 646 } });
    expect(criterion(judgeNotice(p, makeNotice([unit]), REFERENCE_2026, "2026-10-14"), "income")?.verdict).toBe("eligible");
  });
});

describe("④ 세대주가 다른 가족", () => {
  it("세대주 조건이 있으면 미충족", () => {
    const unit = makeUnit("public_sale_general", 59, {
      ...STANDARD_REQUIREMENTS.public_sale_general,
      household: { headRequired: true },
      income: undefined,
    });
    const p = makeProfile({ householdHead: "other" });
    const j = judgeNotice(p, makeNotice([unit], { tenure: "sale" }), REFERENCE_2026, "2026-10-14");
    expect(criterion(j, "household")?.verdict).toBe("ineligible");
    expect(j.verdict).toBe("ineligible");
  });
});

describe("⑤ 수급자 + 소득 초과 (고령자 복지주택)", () => {
  const p = makeProfile({ welfare: "livelihood_or_medical", money: { monthlyIncome: 900 } });
  const j = judgeNotice(p, makeNotice([makeUnit("senior_welfare")]), REFERENCE_2026, "2026-10-14");
  it("복지 조건은 수급 경로로 충족", () => {
    expect(criterion(j, "welfare")?.verdict).toBe("eligible");
  });
  it("자산 기준 미확인이라 공고는 확인 필요 (숨기지 않음)", () => {
    expect(criterion(j, "asset")?.verdict).toBe("unknown");
    expect(j.verdict).toBe("unknown");
  });
});

describe("⑥ 공공분양 60㎡ 초과 주택형은 소득 조건 없음", () => {
  const p = makeProfile({ money: { monthlyIncome: 1200 } });
  const j = judgeNotice(
    p,
    makeNotice([makeUnit("public_sale_general", 59), makeUnit("public_sale_general", 84)], { tenure: "sale" }),
    REFERENCE_2026,
    "2026-10-14",
  );
  it("59㎡는 소득 미충족", () => {
    expect(criterion(j, "income", 0)?.verdict).toBe("ineligible");
  });
  it("84㎡는 소득 조건 자체가 없다", () => {
    expect(criterion(j, "income", 1)).toBeUndefined();
  });
  it("면적을 모르면 소득 초과여도 확인 필요 (BR-U2-45a)", () => {
    const j2 = judgeNotice(p, makeNotice([makeUnit("public_sale_general", null)], { tenure: "sale" }), REFERENCE_2026, "2026-10-14");
    expect(criterion(j2, "income")?.verdict).toBe("unknown");
  });
});

describe("⑦ 민영 예치금 (지역·면적 구간)", () => {
  const judge = (sido: string, deposit: number, area: number | null) =>
    criterion(
      judgeNotice(
        makeProfile({ residence: { sido }, savings: { depositManwon: deposit } }),
        makeNotice([makeUnit("private_sale_general", area)], { tenure: "sale" }),
        REFERENCE_2026,
        "2026-10-14",
      ),
      "savings",
    )?.verdict;

  it("경기 거주 84㎡: 200만원 필요", () => {
    expect(judge("경기도", 200, 84)).toBe("eligible");
    expect(judge("경기도", 150, 84)).toBe("ineligible");
  });
  it("인천 거주 110㎡: 700만원 필요", () => {
    expect(judge("인천광역시", 700, 110)).toBe("eligible");
    expect(judge("인천광역시", 300, 110)).toBe("ineligible");
  });
  it("면적을 모르면 가장 낮은 구간 미달만 미충족", () => {
    expect(judge("경기", 150, null)).toBe("ineligible");
    expect(judge("경기", 250, null)).toBe("unknown");
    expect(judge("경기", 500, null)).toBe("eligible");
  });
});

describe("⑧ 기준표가 없는 연도", () => {
  it("2027년 공고의 소득 조건은 확인 필요", () => {
    const j = judgeNotice(makeProfile(), makeNotice([makeUnit("happy_senior")], { announcedAt: "2027-02-01" }), REFERENCE_2026, "2027-02-10");
    expect(criterion(j, "income")).toMatchObject({ verdict: "unknown", code: "income_table_missing" });
    expect(j.verdict).toBe("unknown");
  });
});

describe("⑨ 공급유형을 알 수 없음", () => {
  it("other → 확인 필요", () => {
    const j = judgeNotice(makeProfile(), makeNotice([makeUnit("other")]), REFERENCE_2026, "2026-10-14");
    expect(j.verdict).toBe("unknown");
    expect(j.units[0]!.criteria[0]).toMatchObject({ key: "type", code: "type_unclassified" });
  });
});

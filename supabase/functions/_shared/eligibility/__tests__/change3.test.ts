// 변경 요청 3 예시 — 가구 종류·옮기기, 신청 방법, 혼인·소득·통장·생애최초, P3 예시 (business-rules §11, business-logic-model §7.1)
import { describe, expect, it } from "vitest";
import type { HouseholdProfile, NewlywedInfo } from "../../domain/profile.ts";
import { validateProfile } from "../../domain/profile.ts";
import { migrateProfile, parseProfile } from "../../domain/profile-migrate.ts";
import { classifySupplyType } from "../../domain/supply-types.ts";
import { makeNotice, makeProfile, makeUnit, REFERENCE_2026 } from "../../__tests__/fixtures.ts";
import { childBonus, judgeNotice, judgeUnit } from "../engine.ts";
import { addYears } from "../criteria/marriage.ts";
import { routesFor } from "../routes.ts";
import type { CriterionResult, UnitJudgement } from "../types.ts";

const BASE = "2026-11-02";

/** P3: 예비신혼 맞벌이, 본인 420 + 배우자 380, 무주택, 집 가진 적 없음, 소득세 5년, 본인 통장 2년·24회 */
function newlywed(over: { newlywed?: Partial<NewlywedInfo>; money?: Partial<HouseholdProfile["money"]>; savings?: Partial<HouseholdProfile["savings"]> } = {}): HouseholdProfile {
  const base = makeProfile({
    self: { birthDate: "1994-05-01" },
    spouse: { birthDate: "1995-08-01" },
    residence: { sido: "경기", sigungu: "안양시", years: 3 },
    housing: { homeless: true, homelessYears: 5, ownedCount: 0 },
  });
  return {
    ...base,
    householdKind: "newlywed",
    savings: { has: true, owner: "self", kind: "comprehensive", months: 24, paymentCount: 24, depositManwon: 600, ...over.savings },
    money: { ...base.money, monthlyIncome: 800, spouseMonthlyIncome: 380, spouseEarns: true, ...over.money },
    newlywed: {
      marriage: "engaged",
      marriageDate: "2027-03-20",
      children: 0,
      neverOwnedHome: true,
      incomeTax5y: true,
      spouseSavings: null,
      ...over.newlywed,
    },
  };
}

const criterion = (u: UnitJudgement, route: string, key: string): CriterionResult | undefined =>
  u.routes?.find((r) => r.route === route)?.criteria.find((c) => c.key === key);

describe("프로필 v3·옮기기 (BR-U2-D1·D3)", () => {
  it("v1·v2 → v3 노부부, 신혼 정보 없음, 멱등", () => {
    const v2 = { ...makeProfile(), schemaVersion: 2 } as Record<string, unknown>;
    delete v2.householdKind;
    delete v2.newlywed;
    const once = migrateProfile(v2);
    expect(once).toMatchObject({ schemaVersion: 3, householdKind: "senior", newlywed: null });
    expect(migrateProfile(once)).toEqual(once);
    expect(parseProfile(v2).ok).toBe(true);
  });

  it("신혼 가구는 배우자와 신혼 정보가 있어야 하고, 노부부는 신혼 정보가 없어야 한다", () => {
    expect(validateProfile(newlywed()).ok).toBe(true);
    expect(validateProfile({ ...newlywed(), spouse: null, householdType: "single", householdSize: 1 }).ok).toBe(false);
    expect(validateProfile({ ...newlywed(), newlywed: null }).ok).toBe(false);
    expect(validateProfile({ ...makeProfile(), newlywed: newlywed().newlywed }).ok).toBe(false);
    expect(validateProfile({ ...makeProfile(), money: { ...makeProfile().money, spouseMonthlyIncome: 100 } }).ok).toBe(false);
  });
});

describe("신청 방법 (BR-U2-D10·D11·D14)", () => {
  it("가구 종류 × 공급유형", () => {
    expect(routesFor("senior", "private_sale_general")).toEqual(["own_type"]);
    expect(routesFor("newlywed", "private_sale_general")).toEqual(["newlywed_special", "first_time", "general"]);
    expect(routesFor("newlywed", "happy_senior")).toEqual(["rental_newlywed"]);
    expect(routesFor("newlywed", "newlywed_hope_town")).toEqual(["newlywed_hope"]);
    expect(routesFor("newlywed", "senior_welfare")).toEqual([]);
  });

  it("신혼희망타운 분류는 공공분양보다 먼저", () => {
    expect(classifySupplyType({ text: "신혼희망타운(공공분양)" })).toBe("newlywed_hope_town");
    expect(classifySupplyType({ text: "공공분양 일반공급" })).toBe("public_sale_general");
  });

  it("어르신 대상 주택은 신혼 가구에 미충족, 신혼희망타운은 노부부 가구에 미충족", () => {
    const u = judgeUnit(newlywed(), makeUnit("senior_welfare"), REFERENCE_2026, BASE);
    expect(u).toMatchObject({ verdict: "ineligible", routes: [] });
    expect(u.criteria[0]!.reason).toBe("어르신 대상 주택이에요");
    const senior = judgeUnit(makeProfile(), makeUnit("newlywed_hope_town"), REFERENCE_2026, BASE);
    expect(senior.verdict).toBe("ineligible");
    expect(senior.routes).toBeUndefined(); // 노부부 저장 형식 그대로
    expect(senior.criteria.find((c) => c.key === "marriage")!.reason).toBe("신혼부부 대상 주택이에요");
  });
});

describe("P3 예시 (business-logic-model §7.1)", () => {
  it("민영 84㎡, 예비신혼 받음 → 신혼 특공·생애최초 충족", () => {
    const unit = makeUnit("private_sale_general", 84);
    unit.routeRequirements = { newlywed_special: { marriage: { maxYears: 7, engagedAllowed: true }, homeless: { minYears: null }, income: { basis: "urban_worker", percent: 140, dualIncomePercent: 160 } } };
    const u = judgeUnit(newlywed(), unit, REFERENCE_2026, BASE);
    expect(u.verdict).toBe("eligible");
    expect(u.routes!.map((r) => [r.route, r.verdict])).toEqual([
      ["newlywed_special", "eligible"],
      ["first_time", "eligible"],
      ["general", expect.any(String)],
    ]);
    expect(criterion(u, "newlywed_special", "marriage")).toMatchObject({ verdict: "eligible", action: "입주 전까지 혼인신고를 해야 해요" });
  });

  it("예비신혼을 받지 않는 공고: 신혼 특공 미충족, 생애최초로 충족", () => {
    const unit = makeUnit("private_sale_general", 84);
    unit.routeRequirements = { newlywed_special: { marriage: { maxYears: 7, engagedAllowed: false } } };
    const u = judgeUnit(newlywed(), unit, REFERENCE_2026, BASE);
    expect(u.routes!.find((r) => r.route === "newlywed_special")!.verdict).toBe("ineligible");
    expect(criterion(u, "newlywed_special", "marriage")!.reason).toBe("이 공고는 예비신혼부부를 받지 않아요");
    expect(u.verdict).toBe("eligible");
    expect(u.criteria.some((c) => c.key === "firstTime")).toBe(true); // 대표 조건 = 생애최초
  });

  it("표준 요건(공고 값 없음): 예비신혼 받는지 확인 필요, 금액 조건에 '일반적인 기준' 꼬리", () => {
    const u = judgeUnit(newlywed(), makeUnit("private_sale_general", 84), REFERENCE_2026, BASE);
    expect(criterion(u, "newlywed_special", "marriage")).toMatchObject({ verdict: "unknown", code: "marriage_engaged_unknown" });
    expect(criterion(u, "newlywed_special", "income")!.reason).toContain("일반적인 기준이에요");
  });
});

describe("혼인 (BR-U2-D20~D22)", () => {
  const married = (date: string | null) => newlywed({ newlywed: { marriage: "married", marriageDate: date } });
  const marriage = (p: HouseholdProfile) => criterion(judgeUnit(p, makeUnit("public_sale_general", 59), REFERENCE_2026, BASE), "newlywed_special", "marriage");
  it("혼인신고 7년 이내 충족, 넘으면 미충족, 날짜 모르면 확인 필요", () => {
    expect(marriage(married("2020-01-01"))!.verdict).toBe("eligible");
    expect(marriage(married("2019-11-02"))!.verdict).toBe("eligible"); // 기준일이 정확히 7년째
    expect(marriage(married("2019-11-01"))!.verdict).toBe("ineligible");
    expect(marriage(married(null))!.verdict).toBe("unknown");
    expect(marriage(newlywed({ newlywed: { marriage: null } }))!.verdict).toBe("unknown");
  });
  it("2월 29일 + 7년", () => {
    expect(addYears("2020-02-29", 7)).toBe("2027-02-28");
  });
});

describe("소득 (BR-U2-D23~D25)", () => {
  // 2인 가구 2026 도시근로자 100% = 5,866,270원
  const income = (monthly: number, spouse: number) =>
    criterion(judgeUnit(newlywed({ money: { monthlyIncome: monthly, spouseMonthlyIncome: spouse, spouseEarns: spouse > 0 } }), makeUnit("private_sale_general", 84), REFERENCE_2026, BASE), "newlywed_special", "income")!;
  it("외벌이 140%, 맞벌이 160%, 넘으면 추첨 안내로 확인 필요, 우선공급 안이면 안내", () => {
    expect(income(800, 0).verdict).toBe("eligible"); // 800 ≤ 821 (140%)
    expect(income(850, 0)).toMatchObject({ verdict: "unknown", code: "income_over_lottery" }); // 850 > 821, 외벌이
    expect(income(900, 300).verdict).toBe("eligible"); // 맞벌이 160% = 938
    expect(income(950, 300).code).toBe("income_over_lottery");
    expect(income(550, 0).reason).toContain("우선공급 소득 기준 안이에요"); // 100% = 586
    expect(income(650, 300).reason).toContain("우선공급 소득 기준 안이에요"); // 맞벌이 우선 120% = 703
    expect(income(800, 0).reason).not.toContain("우선공급");
  });
});

describe("통장 (BR-U2-D30·D31)", () => {
  const spouseAccount = { has: true, owner: "spouse" as const, kind: "comprehensive" as const, months: 60, paymentCount: 60, depositManwon: 1500 };
  it("본인 통장이 없어도 배우자 통장이 맞으면 충족 + 어느 통장인지", () => {
    const p = newlywed({ savings: { has: false, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null }, newlywed: { spouseSavings: spouseAccount } });
    const u = judgeUnit(p, makeUnit("public_sale_general", 59), REFERENCE_2026, BASE);
    const r = u.routes!.find((x) => x.route === "newlywed_special")!;
    expect(r.savingsBy).toBe("spouse");
    expect(r.criteria.find((c) => c.key === "savings")).toMatchObject({ verdict: "eligible" });
    expect(r.criteria.find((c) => c.key === "savings")!.reason).toContain("배우자 통장으로 신청하면 돼요");
  });
  it("둘 다 맞으면 본인 통장", () => {
    const u = judgeUnit(newlywed({ newlywed: { spouseSavings: spouseAccount } }), makeUnit("public_sale_general", 59), REFERENCE_2026, BASE);
    expect(u.routes!.find((x) => x.route === "newlywed_special")!.savingsBy).toBe("self");
  });
});

describe("생애최초 (BR-U2-D35·D36)", () => {
  const ft = (n: Partial<NewlywedInfo>, housing?: HouseholdProfile["housing"]) => {
    const p = newlywed({ newlywed: n });
    return judgeUnit(housing ? { ...p, housing } : p, makeUnit("private_sale_general", 84), REFERENCE_2026, BASE).routes!.find((r) => r.route === "first_time")!;
  };
  it("집 가진 적 있음·소득세 5년 없음 → 미충족, 모르면 확인 필요", () => {
    expect(ft({ neverOwnedHome: false }).criteria.find((c) => c.key === "firstTime")!.verdict).toBe("ineligible");
    expect(ft({ incomeTax5y: false }).criteria.find((c) => c.key === "firstTime")!.verdict).toBe("ineligible");
    expect(ft({ neverOwnedHome: null }).criteria.find((c) => c.key === "firstTime")!.verdict).toBe("unknown");
  });
  it("지금 집이 있으면 생애최초·신혼 특공 모두 미충족 (무주택 조건)", () => {
    const owned = { homeless: false, homelessYears: null, ownedCount: 1 };
    expect(ft({}, owned).verdict).toBe("ineligible");
  });
});

describe("자녀 보너스 (BR-U2-D42)", () => {
  it("신혼 특공으로 신청할 수 있는 공고에만 자녀 수만큼(최대 2), 노부부는 0", () => {
    const withKids = newlywed({ newlywed: { children: 3 } });
    const sale = judgeNotice(withKids, makeNotice([makeUnit("private_sale_general", 84)]), REFERENCE_2026, BASE);
    const rental = judgeNotice(withKids, makeNotice([makeUnit("integrated_rental", 46)]), REFERENCE_2026, BASE);
    expect(childBonus(withKids, sale.units)).toBe(2);
    expect(childBonus(withKids, rental.units)).toBe(0);
    expect(childBonus(makeProfile(), sale.units)).toBe(0);
  });
});

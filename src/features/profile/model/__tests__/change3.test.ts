// U4 변경 3 예시 — 가구 종류, 신혼 화면·변환, 가구 종류 바꾸기, 초안 v3, 요약 (business-rules §10, domain-entities §8)
import { validateProfile } from "@shared/domain/profile.ts";
import { describe, expect, it } from "vitest";
import { fromProfile, hasBlankFields, switchKind, toProfile } from "../convert";
import { birthYears, groupOrder, isComplete, marriageYears, pruneHidden, visibleSteps } from "../steps";
import { DRAFT_KEY, loadDraft, migrateDraft } from "../storage";
import { groupSummary } from "../summary";
import { UNKNOWN, type WizardAnswers } from "../types";
import { initialUpdates } from "../updates";
import { memoryStorage, MOTHER_ANSWERS } from "./helpers";

const TODAY = "2026-10-20";

/** 예비신혼, 집 없음, 통장 두 분 다, 맞벌이 (business-logic-model §9.3 둘째 줄) */
const ENGAGED: WizardAnswers = {
  householdKind: "newlywed",
  selfBirth: "1996-04-12",
  spouseBirth: "1997-09-03",
  head: "self",
  marriage: "engaged",
  marriageDate: "2027-03-01",
  children: 0,
  sido: "경기",
  sigungu: "안양시",
  residenceYearsBand: "2to3",
  homeOwned: false,
  homelessYearsBand: "lt1",
  neverOwned: true,
  incomeTax5y: true,
  savingsOwner: "both",
  savingsKind: "comprehensive",
  savingsMonthsBand: "12to24",
  paymentCount: 15,
  depositManwon: 300,
  spouseSavingsKind: "comprehensive",
  spouseSavingsMonthsBand: "24to60",
  spousePaymentCount: 30,
  spouseDepositManwon: 600,
  monthlyIncome: 300,
  spouseIncome: 250,
  totalAsset: 8000,
  carValue: 0,
  districtIds: [],
  regions: [{ sido: "경기", sigungu: "안양시" }, { sido: "서울", sigungu: null }],
  tenure: "both",
  lowFloor: false,
};

const ids = (a: WizardAnswers, scope?: Parameters<typeof visibleSteps>[1]) => visibleSteps(a, scope).map((s) => s.id);

describe("가구 종류 화면 (BR-U4-D1~D4)", () => {
  it("처음 입력 첫 화면, 처음부터 다시 입력(full)·그룹 고치기에는 없다", () => {
    expect(ids({})[0]).toBe("householdKind");
    expect(ids(ENGAGED, "full")).not.toContain("householdKind");
    expect(ids(ENGAGED, "basic")).toEqual(["selfBirth", "spouseBirth", "head", "review"]);
  });

  it("가구 종류가 없는 옛 답은 노부부로 저장된다 (필수 검사에서 빠짐)", () => {
    expect(isComplete(MOTHER_ANSWERS)).toBe(true);
    expect(toProfile(MOTHER_ANSWERS)).toMatchObject({ householdKind: "senior", newlywed: null });
  });

  it("v3로 저장된 기기는 '새로 바뀐 점' 안내를 본 것으로 (안내 번호 그대로)", () => {
    const p = toProfile(ENGAGED);
    expect(initialUpdates({ profile: p, storedSchemaVersion: 3 }).pending).toEqual([]);
  });
});

describe("신혼 화면 (BR-U4-D10~D22, business-logic-model §9.3)", () => {
  it("예비신혼, 집 없음, 통장 두 분 다 → 29화면", () => {
    expect(ids(ENGAGED)).toEqual([
      "householdKind", "selfBirth", "spouseBirth", "head", "marriage", "marriageDate", "children",
      "residence", "residenceYears", "homeOwned", "homelessYears", "neverOwned", "incomeTax",
      "savingsOwner", "savingsKind", "savingsPeriod", "savingsAmount", "spouseSavingsKind", "spouseSavingsPeriod", "spouseSavingsAmount",
      "income", "spouseIncome", "asset", "car", "districts", "regions", "area", "tenurePrefs", "review",
    ]);
  });

  it("신혼, 집 있음, 통장 나 → 25화면 (가진 적 없음·배우자 통장 화면 없음)", () => {
    const list = ids({ ...ENGAGED, marriage: "married", homeOwned: true, homeCount: 1, savingsOwner: "self" });
    expect(list).toHaveLength(25);
    expect(list).not.toContain("neverOwned");
    expect(list).not.toContain("spouseSavingsKind");
    expect(list).toContain("homeCount");
  });

  it("혼인 상태를 모르면 날짜 화면이 없고, 날짜 답은 지운다", () => {
    const a = pruneHidden({ ...ENGAGED, marriage: UNKNOWN });
    expect(ids(a)).not.toContain("marriageDate");
    expect(a.marriageDate).toBeUndefined();
  });

  it("배우자 생년월일은 가구 구성 화면 없이도 남는다", () => {
    expect(pruneHidden(ENGAGED)).toMatchObject({ householdType: "couple", spouseBirth: "1997-09-03" });
  });

  it("생년월일·혼인 날짜 범위 (BR-U4-D12·D13)", () => {
    expect(birthYears("newlywed", "self", TODAY)).toEqual({ from: 1960, to: 2007, initial: 1995 });
    expect(birthYears("senior", "self", TODAY)).toEqual({ from: 1930, to: 1975, initial: 1960 });
    expect(birthYears("senior", "self", TODAY, "1996-04-12")).toEqual({ from: 1930, to: 1996, initial: 1960 }); // 종류를 바꾼 경우 넓힘
    expect(marriageYears("engaged", TODAY)).toEqual({ from: 2026, to: 2029, initial: 2026 });
    expect(marriageYears("married", TODAY)).toEqual({ from: 1990, to: 2026, initial: 2026 });
  });
});

describe("신혼 답 → 프로필 (domain-entities §8.3)", () => {
  it("부부·자녀 → 가구원 수, 통장 두 분 다, 소득 합계, 생애최초, 복지 없음", () => {
    const p = toProfile(ENGAGED);
    expect(validateProfile(p).ok).toBe(true);
    expect(p).toMatchObject({
      householdKind: "newlywed",
      householdType: "couple",
      householdSize: 2,
      spouse: { birthDate: "1997-09-03" },
      savings: { has: true, owner: "self", kind: "comprehensive", months: 12, paymentCount: 15, depositManwon: 300 },
      money: { monthlyIncome: 550, spouseMonthlyIncome: 250, spouseEarns: true },
      welfare: null,
      newlywed: {
        marriage: "engaged",
        marriageDate: "2027-03-01",
        children: 0,
        neverOwnedHome: true,
        incomeTax5y: true,
        spouseSavings: { has: true, owner: "spouse", months: 24, paymentCount: 30, depositManwon: 600 },
      },
    });
  });

  it.each([
    ["self", { has: true, owner: "self" }, { has: false, owner: null }],
    ["spouse", { has: false, owner: null }, { has: true, owner: "spouse" }],
    ["none", { has: false, owner: null }, { has: false, owner: null }],
  ] as const)("통장 명의 %s → 본인·배우자 통장", (owner, own, spouse) => {
    const p = toProfile({ ...ENGAGED, savingsOwner: owner });
    expect(p.savings).toMatchObject(own);
    expect(p.newlywed!.spouseSavings).toMatchObject(spouse);
  });

  it("통장 모름 → 본인 has null, 배우자 통장 null", () => {
    const p = toProfile({ ...ENGAGED, savingsOwner: UNKNOWN });
    expect(p.savings.has).toBeNull();
    expect(p.newlywed!.spouseSavings).toBeNull();
  });

  it("배우자 소득을 모르면 합계·맞벌이 모름, 소득 없음(0)이면 외벌이", () => {
    expect(toProfile({ ...ENGAGED, spouseIncome: UNKNOWN }).money).toMatchObject({ monthlyIncome: null, spouseMonthlyIncome: null, spouseEarns: null });
    expect(toProfile({ ...ENGAGED, spouseIncome: 0 }).money).toMatchObject({ monthlyIncome: 300, spouseMonthlyIncome: 0, spouseEarns: false });
  });

  it("자녀 3명 이상 → 5명 가구, 지금 집 있음 → 가진 적 없음 false", () => {
    const p = toProfile({ ...ENGAGED, children: 3, homeOwned: true, homeCount: 1 });
    expect(p.householdSize).toBe(5);
    expect(p.newlywed!.neverOwnedHome).toBe(false);
  });

  it("왕복: 프로필 → 답 → 프로필", () => {
    const p = toProfile(ENGAGED);
    expect(fromProfile(p)).toMatchObject({ householdKind: "newlywed", monthlyIncome: 300, spouseIncome: 250, savingsOwner: "both", spouseSavingsMonthsBand: "24to60" });
    expect(toProfile(fromProfile(p))).toEqual(p);
  });

  it("확인 화면 안내: 비운 신혼 항목도 '확인 필요'로 센다", () => {
    expect(hasBlankFields(toProfile(ENGAGED))).toBe(false);
    expect(hasBlankFields(toProfile({ ...ENGAGED, incomeTax5y: UNKNOWN }))).toBe(true);
  });
});

describe("가구 종류 바꾸기 (domain-entities §8.4, business-logic-model §9.5)", () => {
  it("노부부(부부, 통장 나, 소득 합계) → 신혼: 공통 답은 채우고 소득·복지는 다시 묻는다", () => {
    const a = switchKind(MOTHER_ANSWERS, "newlywed");
    expect(a).toMatchObject({ householdKind: "newlywed", householdType: "couple", selfBirth: "1963-07-01", spouseBirth: "1960-03-02", savingsOwner: "self", savingsKind: "comprehensive", totalAsset: 20000 });
    expect(a.monthlyIncome).toBeUndefined();
    expect(a.welfare).toBeUndefined();
    expect(a.spouseEarns).toBeUndefined();
    expect(ids(a, "full")).toContain("marriage");
  });

  it("노부부 통장 배우자 → 신혼 배우자 통장으로, 두 분 다 → 다시 묻는다", () => {
    expect(switchKind({ ...MOTHER_ANSWERS, savingsOwner: "spouse" }, "newlywed")).toMatchObject({ savingsOwner: "spouse", spouseSavingsKind: "comprehensive", spousePaymentCount: 120 });
    const both = switchKind({ ...MOTHER_ANSWERS, savingsOwner: "both" }, "newlywed");
    expect(both.savingsOwner).toBeUndefined();
    expect(both.savingsKind).toBeUndefined();
  });

  it("신혼(두 분 다, 배우자 통장이 더 오래됨, 300+250) → 노부부: 배우자 통장 값, 합계 550", () => {
    const a = switchKind(ENGAGED, "senior");
    expect(a).toMatchObject({ householdKind: "senior", householdType: "couple", savingsOwner: "both", savingsMonthsBand: "24to60", paymentCount: 30, monthlyIncome: 550, spouseEarns: true });
    expect(a.marriage).toBeUndefined();
    expect(a.spouseIncome).toBeUndefined();
    expect(ids(a, "full")).toContain("welfare");
  });

  it("자녀가 있는 신혼 → 노부부: 다른 가족도 함께 (배우자 있음)", () => {
    expect(switchKind({ ...ENGAGED, children: 2 }, "senior")).toMatchObject({ householdType: "other", householdSize: 4, hasSpouse: true });
  });
});

describe("초안 버전 3 (domain-entities §8.5)", () => {
  it("버전 2 → 노부부로 옮김, 버전 3은 그대로", () => {
    const v2 = { version: 2, answers: { selfBirth: "1960-01-01" }, stepId: "income", updatedAt: "x" };
    expect(migrateDraft(v2)).toEqual({ version: 3, answers: { selfBirth: "1960-01-01", householdKind: "senior" }, stepId: "income", updatedAt: "x" });
    const v3 = { version: 3, answers: { householdKind: "newlywed" }, stepId: "marriage", updatedAt: "x" };
    expect(migrateDraft(v3)).toEqual(v3);
  });

  it("기기의 버전 3 신혼 초안을 그대로 읽는다", () => {
    const s = memoryStorage({ [DRAFT_KEY]: JSON.stringify({ version: 3, answers: ENGAGED, stepId: "spouseIncome", updatedAt: "x" }) });
    expect(loadDraft(s)).toMatchObject({ stepId: "spouseIncome", answers: { householdKind: "newlywed" } });
  });
});

describe("설정 그룹·요약 (BR-U4-D50·D51)", () => {
  it("신혼 8개 그룹, 노부부 7개 그대로", () => {
    expect(groupOrder("newlywed")).toEqual(["basic", "marriage", "residence", "housing", "savings", "money", "districts", "prefs"]);
    expect(groupOrder("senior")).toHaveLength(7);
  });

  it("요약 문구", () => {
    const p = toProfile(ENGAGED);
    expect(groupSummary(p, "marriage", TODAY)).toBe("예비신혼 · 2027년 3월 예정 · 자녀 없음");
    expect(groupSummary(toProfile({ ...ENGAGED, marriage: "married", marriageDate: "2024-05-11", children: 1 }), "marriage", TODAY)).toBe("혼인신고 2024년 5월 · 자녀 1명");
    expect(groupSummary(p, "housing", TODAY)).toBe("집 없음 · 1년 미만 · 집을 가진 적 없음");
    expect(groupSummary(p, "savings", TODAY)).toBe("내 통장 주택청약종합저축 1~2년 · 배우자 통장 주택청약종합저축 2~5년");
    expect(groupSummary(p, "money", TODAY)).toBe("본인 월 300만원 · 배우자 월 250만원 · 자산 8,000만원 · 자동차 0원");
    expect(groupSummary(toProfile({ ...ENGAGED, savingsOwner: "none" }), "savings", TODAY)).toBe("내 통장 없음 · 배우자 통장 없음");
  });
});

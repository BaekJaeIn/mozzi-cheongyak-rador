// 예시 기반 테스트 — 마법사 화면·변환·구간·금액·시각·요약·저장 (business-rules BR-U4-*, business-logic-model §2.1·§6)
import { validateProfile } from "@shared/domain/profile.ts";
import { describe, expect, it } from "vitest";
import { formatManwon, needsConfirm, exceedsMax, parseAmountInput, parseKoreanManwon } from "../amount";
import { bandOf, HOMELESS_BANDS, lowerOf, MONTHS_BANDS, RESIDENCE_BANDS } from "../bands";
import { fromProfile, hasBlankFields, IncompleteAnswersError, mergeGroupEdit, toProfile } from "../convert";
import { ALL_DISTRICT_IDS, DISTRICT_OPTIONS } from "../districts";
import { hourLabel } from "../hour";
import { isValidSigungu, needsSigungu, SIDO_OPTIONS, SIGUNGU_BY_SIDO } from "../regions";
import {
  canProceed,
  daysInMonth,
  isComplete,
  markUnknown,
  nextStep,
  prevStep,
  progress,
  pruneHidden,
  spouseBirthYears,
  toBirthDate,
  visibleSteps,
} from "../steps";
import {
  clearAllPersonal,
  commitProfile,
  DRAFT_KEY,
  loadDisplayMode,
  loadDraft,
  loadStoredNotify,
  loadStoredProfile,
  PROFILE_KEY,
  saveDraft,
} from "../storage";
import { groupSummary } from "../summary";
import { UNKNOWN, type WizardAnswers } from "../types";
import { memoryStorage, MINIMAL_ANSWERS, MOTHER_ANSWERS } from "./helpers";


describe("화면 순서 (business-logic-model §2.1)", () => {
  const ids = (a: WizardAnswers) => visibleSteps(a).map((s) => s.id);

  it("부부, 집 없음, 통장 있음 → 21화면", () => {
    const list = ids({ householdType: "couple", sido: "경기", homeOwned: false, savingsHas: true });
    expect(list).toEqual([
      "selfBirth", "household", "spouseBirth", "head", "residence", "residenceYears", "homeOwned", "homelessYears",
      "savingsHas", "savingsKind", "savingsPeriod", "savingsAmount", "income", "spouseEarns", "asset", "car", "welfare",
      "districts", "area", "tenurePrefs", "review",
    ]);
  });

  it("혼자, 집 있음, 통장 없음 → 16화면", () => {
    expect(ids({ householdType: "single", sido: "부산", homeOwned: true, savingsHas: false })).toHaveLength(16);
  });

  it("다른 가족도 함께(배우자 있음), 집·통장 모름 → 18화면", () => {
    const list = ids({ householdType: "other", householdSize: 4, hasSpouse: true, sido: "서울", homeOwned: UNKNOWN, savingsHas: UNKNOWN });
    expect(list).toHaveLength(18);
    expect(list).toContain("householdMore");
    expect(list).not.toContain("homeCount");
    expect(list).not.toContain("savingsKind");
  });

  it("진행 표시는 지금 답으로 보일 화면 수로 센다", () => {
    expect(progress({ householdType: "single" }, "household")).toEqual({ index: 2, total: 14 });
    expect(progress({ householdType: "couple", sido: "경기" }, "head")).toEqual({ index: 4, total: 17 });
  });

  it("다음·이전은 보이는 화면만 지난다", () => {
    const a: WizardAnswers = { householdType: "single", sido: "경기", homeOwned: false };
    expect(nextStep(a, "household")).toBe("head");
    expect(nextStep(a, "homeOwned")).toBe("homelessYears");
    expect(prevStep(a, "head")).toBe("household");
    expect(prevStep(a, "selfBirth")).toBeNull();
    expect(nextStep(a, "review")).toBeNull();
  });

  it("고치기: 그 그룹 화면 + 확인 화면만", () => {
    expect(visibleSteps({ householdType: "couple", homeOwned: true }, "housing").map((s) => s.id)).toEqual(["homeOwned", "homeCount", "review"]);
  });
});

describe("답을 바꾸면 안 보이게 된 답을 지운다 (BR-U4-12)", () => {
  it("부부 → 혼자: 배우자 생년월일·배우자 소득·세대주 '배우자'를 지운다", () => {
    const pruned = pruneHidden({ ...MOTHER_ANSWERS, householdType: "single" });
    expect(pruned.spouseBirth).toBeUndefined();
    expect(pruned.spouseEarns).toBeUndefined();
    expect(pruned.head).toBeUndefined();
    expect(pruned.monthlyIncome).toBe(450);
  });

  it("집 없음 → 있음: 무주택 기간을 지운다, 수도권 밖이면 시군구 null", () => {
    const pruned = pruneHidden({ ...MOTHER_ANSWERS, homeOwned: true, sido: "부산" });
    expect(pruned.homelessYearsBand).toBeUndefined();
    expect(pruned.sigungu).toBeNull();
  });
});

describe("필수·[잘 모르겠어요] (BR-U4-50~53)", () => {
  it("필수 화면은 답이 있어야 [다음]", () => {
    expect(canProceed("selfBirth", {})).toBe(false);
    expect(canProceed("residence", { sido: "경기" })).toBe(false);
    expect(canProceed("residence", { sido: "경기", sigungu: "하남시" })).toBe(true);
    expect(canProceed("residence", { sido: "부산", sigungu: null })).toBe(true);
    expect(canProceed("districts", { districtIds: [] })).toBe(false);
    expect(canProceed("householdMore", { householdSize: 3 })).toBe(false);
  });

  it("[잘 모르겠어요]는 그 화면 항목을 모두 UNKNOWN으로, 필수 화면은 바꾸지 않는다", () => {
    expect(markUnknown("savingsPeriod", {})).toEqual({ savingsMonthsBand: UNKNOWN, paymentCount: UNKNOWN });
    expect(markUnknown("selfBirth", {})).toEqual({});
    expect(markUnknown("area", { areaBands: ["s"] })).toEqual({ areaBands: ["s"] }); // 선호 화면에는 없음
    expect(markUnknown("tenurePrefs", {})).toEqual({});
  });

  it("필수만 채우면 저장할 수 있다", () => {
    expect(isComplete(MINIMAL_ANSWERS)).toBe(true);
    expect(isComplete({ ...MINIMAL_ANSWERS, districtIds: [] })).toBe(false);
    expect(() => toProfile({ householdType: "single" })).toThrow(IncompleteAnswersError);
  });
});

describe("답 → 프로필 (business-logic-model §6)", () => {
  it("어머니 기기 예시", () => {
    const p = toProfile(MOTHER_ANSWERS);
    expect(p).toEqual({
      schemaVersion: 2,
      self: { birthDate: "1963-07-01" },
      spouse: { birthDate: "1960-03-02" },
      householdType: "couple",
      householdSize: 2,
      householdHead: "spouse",
      residence: { sido: "경기", sigungu: "하남시", years: 5 },
      housing: { homeless: true, homelessYears: 10, ownedCount: 0 },
      savings: { has: true, owner: "self", kind: "comprehensive", months: 120, paymentCount: 120, depositManwon: 1200 },
      money: { monthlyIncome: 450, totalAsset: 20000, carValue: 1500, spouseEarns: true },
      welfare: "none",
      prefs: { districtIds: ALL_DISTRICT_IDS, regions: [], areaBands: ["s"], tenure: "rent", lowFloor: false },
    });
    expect(validateProfile(p).ok).toBe(true);
    expect(hasBlankFields(p)).toBe(false);
  });

  it("필수만: 나머지는 null, 선호는 기본값", () => {
    const p = toProfile(MINIMAL_ANSWERS);
    expect(p).toMatchObject({
      spouse: null,
      householdSize: 1,
      householdHead: null,
      residence: { sido: "부산", sigungu: null, years: null },
      housing: { homeless: null, homelessYears: null, ownedCount: null },
      savings: { has: null, kind: null },
      money: { monthlyIncome: null, spouseEarns: null },
      prefs: { areaBands: [], tenure: "both", lowFloor: false },
    });
    expect(validateProfile(p).ok).toBe(true);
    expect(hasBlankFields(p)).toBe(true);
  });

  it("집 있음 → homeless false·ownedCount, 통장 없음 → has false·나머지 null", () => {
    const p = toProfile({ ...MINIMAL_ANSWERS, homeOwned: true, homeCount: 2, savingsHas: false });
    expect(p.housing).toEqual({ homeless: false, homelessYears: null, ownedCount: 2 });
    expect(p.savings).toEqual({ has: false, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null });
  });

  it("다른 가족도 함께: 가족 수·배우자 유무", () => {
    const p = toProfile({ ...MINIMAL_ANSWERS, householdType: "other", householdSize: 4, hasSpouse: false });
    expect(p.householdSize).toBe(4);
    expect(p.spouse).toBeNull();
  });

  it("프로필 → 답 → 프로필이 같다", () => {
    expect(toProfile(fromProfile(toProfile(MOTHER_ANSWERS)))).toEqual(toProfile(MOTHER_ANSWERS));
    expect(toProfile(fromProfile(toProfile(MINIMAL_ANSWERS)))).toEqual(toProfile(MINIMAL_ANSWERS));
  });

  it("그룹 고치기: 기본에서 혼자로 바꾸면 다른 그룹의 배우자 소득도 지우고, 나머지는 그대로", () => {
    const current = fromProfile(toProfile(MOTHER_ANSWERS));
    const edited = { ...current, householdType: "single" as const };
    const merged = toProfile(mergeGroupEdit(current, edited, "basic"));
    expect(merged.spouse).toBeNull();
    expect(merged.money.spouseEarns).toBeNull();
    expect(merged.money.monthlyIncome).toBe(450);
    expect(merged.residence).toEqual(toProfile(MOTHER_ANSWERS).residence);
  });
});

describe("구간 (BR-U4-30·31)", () => {
  it("구간 → 아래 값, 값 → 구간 경계", () => {
    expect(lowerOf(RESIDENCE_BANDS, "2to3")).toBe(2);
    expect(bandOf(RESIDENCE_BANDS, 0)).toBe("lt1");
    expect(bandOf(RESIDENCE_BANDS, 1)).toBe("1to2");
    expect(bandOf(RESIDENCE_BANDS, 4)).toBe("3to5");
    expect(bandOf(RESIDENCE_BANDS, 40)).toBe("ge10");
    expect(bandOf(HOMELESS_BANDS, 14)).toBe("10to15");
    expect(bandOf(MONTHS_BANDS, 23)).toBe("12to24");
  });
});

describe("금액 (BR-U4-40~44)", () => {
  it("한글 표기", () => {
    expect(formatManwon(0)).toBe("0원");
    expect(formatManwon(350)).toBe("350만원");
    expect(formatManwon(12000)).toBe("1억 2,000만원");
    expect(formatManwon(100000)).toBe("10억원");
    expect(formatManwon(45000)).toBe("4억 5,000만원");
    expect(formatManwon(1000000)).toBe("100억원");
    expect(parseKoreanManwon("1억 2,000만원")).toBe(12000);
  });

  it("단위 실수 확인 기준: 넘으면 확인, 같으면 안 물음", () => {
    expect(needsConfirm("monthlyIncome", 2000)).toBe(false);
    expect(needsConfirm("monthlyIncome", 2001)).toBe(true);
    expect(needsConfirm("totalAsset", 300000)).toBe(false);
    expect(needsConfirm("totalAsset", 300001)).toBe(true);
    expect(needsConfirm("carValue", 10001)).toBe(true);
    expect(needsConfirm("depositManwon", 10001)).toBe(true);
  });

  it("상한 100억원 초과는 저장 불가, 키패드 입력은 숫자만", () => {
    expect(exceedsMax(1_000_000)).toBe(false);
    expect(exceedsMax(1_000_001)).toBe(true);
    expect(exceedsMax(4_500_000)).toBe(true);
    expect(parseAmountInput("0450")).toBe(450);
    expect(parseAmountInput("4,5a0")).toBe(450);
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("000")).toBe(0);
  });
});

describe("생년월일 (BR-U4-20·21)", () => {
  it("일 목록과 날짜 맞추기", () => {
    expect(daysInMonth(1960, 2)).toBe(29);
    expect(daysInMonth(1961, 2)).toBe(28);
    expect(toBirthDate(1961, 2, 31)).toBe("1961-02-28");
    expect(toBirthDate(1960, 3, 2)).toBe("1960-03-02");
  });
  it("배우자 연도는 올해−19년까지", () => {
    expect(spouseBirthYears("2026-10-15")).toEqual({ from: 1930, to: 2007, initial: 1960 });
  });
});

describe("시각·지역·지구", () => {
  it("알림 시각 표기 (BR-U4-74)", () => {
    expect(hourLabel(0)).toBe("오전 12시");
    expect(hourLabel(9)).toBe("오전 9시");
    expect(hourLabel(12)).toBe("오후 12시");
    expect(hourLabel(23)).toBe("오후 11시");
  });
  it("시군구는 서울 25·경기 31·인천 11, 수도권 밖은 시도까지만", () => {
    expect(SIDO_OPTIONS).toHaveLength(16);
    expect(SIGUNGU_BY_SIDO.서울).toHaveLength(25);
    expect(SIGUNGU_BY_SIDO.경기).toHaveLength(31);
    expect(SIGUNGU_BY_SIDO.인천).toHaveLength(11);
    expect(needsSigungu("부산")).toBe(false);
    expect(isValidSigungu("경기", "하남시")).toBe(true);
    expect(isValidSigungu("부산", null)).toBe(true);
    expect(isValidSigungu("경기", null)).toBe(false);
  });
  it("관심 지구 6개, sortOrder 순", () => {
    expect(DISTRICT_OPTIONS.map((d) => d.id)).toEqual(["wangsuk", "gyosan", "changneung", "daejang", "gyeyang", "gwangmyeong_siheung"]);
  });
});

describe("설정 요약 (business-logic-model §3)", () => {
  const p = toProfile(MOTHER_ANSWERS);
  const today = "2026-10-15";
  it("그룹별 한 줄", () => {
    expect(groupSummary(p, "basic", today)).toBe("본인 만 63세 · 배우자 만 66세 · 세대주 배우자");
    expect(groupSummary(p, "residence", today)).toBe("경기 하남시 · 5~10년");
    expect(groupSummary(p, "housing", today)).toBe("집 없음 · 10~15년");
    expect(groupSummary(p, "savings", today)).toBe("주택청약종합저축 · 10년 이상");
    expect(groupSummary(p, "money", today)).toBe("월 450만원 · 자산 2억원 · 자동차 1,500만원");
    expect(groupSummary(p, "districts", today)).toBe("6곳 모두");
    expect(groupSummary(p, "prefs", today)).toBe("40~60㎡ · 임대");
  });
  it("비어 있으면 '확인 필요'", () => {
    const m = toProfile(MINIMAL_ANSWERS);
    expect(groupSummary(m, "housing", today)).toBe("확인 필요");
    expect(groupSummary(m, "money", today)).toBe("월 확인 필요 · 자산 확인 필요 · 자동차 확인 필요");
    expect(groupSummary(m, "districts", today)).toBe("하남 교산");
  });
});

describe("기기 저장 (domain-entities §3)", () => {
  it("저장·읽기, 깨진 프로필은 null(지우지 않음), 깨진 초안은 지운다", () => {
    const s = memoryStorage();
    const stored = commitProfile(s, toProfile(MOTHER_ANSWERS), new Date("2026-10-15T00:00:00Z"));
    expect(stored.sync).toEqual({ state: "pending", since: "2026-10-15T00:00:00.000Z", attempts: 0 });
    expect(loadStoredProfile(s)?.profile.residence.sigungu).toBe("하남시");

    s.setItem(PROFILE_KEY, "{not json");
    expect(loadStoredProfile(s)).toBeNull();
    expect(s.getItem(PROFILE_KEY)).toBe("{not json");

    s.setItem(DRAFT_KEY, JSON.stringify({ version: 1, answers: {}, stepId: "nope", updatedAt: "x" }));
    expect(loadDraft(s)).toBeNull();
    expect(s.getItem(DRAFT_KEY)).toBeNull();
  });

  it("초안 저장·읽기", () => {
    const s = memoryStorage();
    saveDraft(s, { selfBirth: "1960-01-01" }, "household", new Date("2026-10-15T00:00:00Z"));
    expect(loadDraft(s)).toMatchObject({ answers: { selfBirth: "1960-01-01" }, stepId: "household" });
  });

  it("모두 지우기는 화면 모드만 남긴다 (BR-U4-94)", () => {
    const s = memoryStorage({
      "mz.profile": "{}",
      "mz.profile.draft": "{}",
      "mz.notify": "{}",
      "mz.bookmarks": "[]",
      "mz.seen": "{}",
      "mz.feed": "{}",
      "mz.device": "{}",
      "mz.display": "easy",
    });
    clearAllPersonal(s);
    expect([...s.data.keys()]).toEqual(["mz.display"]);
    expect(loadDisplayMode(s)).toBe("easy");
    expect(loadStoredNotify(s)).toBeNull();
  });
});

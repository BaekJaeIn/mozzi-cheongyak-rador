// 마법사 화면 정의 (BR-U4-10~16, 50~53). 화면 순서는 표 순서 그대로이고, 보이는 조건은 지금까지의 답으로만 정한다.
import type { IsoDate } from "@shared/domain/dates.ts";
import { needsSigungu } from "./regions";
import type { AnswerKey, WizardAnswers } from "./types";
import { UNKNOWN } from "./types";

export type GroupId = "basic" | "residence" | "housing" | "savings" | "money" | "districts" | "prefs";

export type StepId =
  | "selfBirth" | "household" | "householdMore" | "spouseBirth" | "head"
  | "residence" | "residenceYears"
  | "homeOwned" | "homeCount" | "homelessYears"
  | "savingsHas" | "savingsKind" | "savingsPeriod" | "savingsAmount"
  | "income" | "spouseEarns" | "asset" | "car" | "welfare"
  | "districts" | "area" | "tenurePrefs"
  | "review";

export interface WizardStep {
  id: StepId;
  group: GroupId | "review";
  visible(a: WizardAnswers): boolean;
  /** 필수: [잘 모르겠어요] 없음, 답이 있어야 [다음] */
  required: boolean;
  /** [잘 모르겠어요] 버튼 (필수 화면과 기본값이 있는 선호 화면에는 없음) */
  allowUnknown: boolean;
  /** 이 화면이 채우는 답 (안 보이게 되면 지운다, BR-U4-12) */
  fields: readonly AnswerKey[];
}

export const GROUP_LABELS: Readonly<Record<GroupId, string>> = {
  basic: "기본 정보",
  residence: "사는 곳",
  housing: "집",
  savings: "청약통장",
  money: "소득·자산",
  districts: "관심 지구",
  prefs: "원하는 집",
};

export const GROUP_ORDER: readonly GroupId[] = ["basic", "residence", "housing", "savings", "money", "districts", "prefs"];

/** 배우자가 있는 답인지 (BR-U4-13) */
export function hasSpouse(a: WizardAnswers): boolean {
  return a.householdType === "couple" || (a.householdType === "other" && a.hasSpouse === true);
}

const always = () => true;

export const STEPS: readonly WizardStep[] = [
  { id: "selfBirth", group: "basic", visible: always, required: true, allowUnknown: false, fields: ["selfBirth"] },
  { id: "household", group: "basic", visible: always, required: true, allowUnknown: false, fields: ["householdType"] },
  { id: "householdMore", group: "basic", visible: (a) => a.householdType === "other", required: true, allowUnknown: false, fields: ["householdSize", "hasSpouse"] },
  { id: "spouseBirth", group: "basic", visible: hasSpouse, required: false, allowUnknown: true, fields: ["spouseBirth"] },
  { id: "head", group: "basic", visible: always, required: false, allowUnknown: true, fields: ["head"] },
  { id: "residence", group: "residence", visible: always, required: true, allowUnknown: false, fields: ["sido", "sigungu"] },
  { id: "residenceYears", group: "residence", visible: (a) => a.sido !== undefined, required: false, allowUnknown: true, fields: ["residenceYearsBand"] },
  { id: "homeOwned", group: "housing", visible: always, required: false, allowUnknown: true, fields: ["homeOwned"] },
  { id: "homeCount", group: "housing", visible: (a) => a.homeOwned === true, required: false, allowUnknown: true, fields: ["homeCount"] },
  { id: "homelessYears", group: "housing", visible: (a) => a.homeOwned === false, required: false, allowUnknown: true, fields: ["homelessYearsBand"] },
  { id: "savingsHas", group: "savings", visible: always, required: false, allowUnknown: true, fields: ["savingsHas"] },
  { id: "savingsKind", group: "savings", visible: (a) => a.savingsHas === true, required: false, allowUnknown: true, fields: ["savingsKind"] },
  { id: "savingsPeriod", group: "savings", visible: (a) => a.savingsHas === true, required: false, allowUnknown: true, fields: ["savingsMonthsBand", "paymentCount"] },
  { id: "savingsAmount", group: "savings", visible: (a) => a.savingsHas === true, required: false, allowUnknown: true, fields: ["depositManwon"] },
  { id: "income", group: "money", visible: always, required: false, allowUnknown: true, fields: ["monthlyIncome"] },
  { id: "spouseEarns", group: "money", visible: hasSpouse, required: false, allowUnknown: true, fields: ["spouseEarns"] },
  { id: "asset", group: "money", visible: always, required: false, allowUnknown: true, fields: ["totalAsset"] },
  { id: "car", group: "money", visible: always, required: false, allowUnknown: true, fields: ["carValue"] },
  { id: "welfare", group: "money", visible: always, required: false, allowUnknown: true, fields: ["welfare"] },
  { id: "districts", group: "districts", visible: always, required: true, allowUnknown: false, fields: ["districtIds"] },
  { id: "area", group: "prefs", visible: always, required: false, allowUnknown: false, fields: ["areaBands"] },
  { id: "tenurePrefs", group: "prefs", visible: always, required: false, allowUnknown: false, fields: ["tenure", "lowFloor"] },
  { id: "review", group: "review", visible: always, required: false, allowUnknown: false, fields: [] },
];

export function stepById(id: StepId): WizardStep {
  return STEPS.find((s) => s.id === id)!;
}

/**
 * 안 보이는 화면의 답을 지운다 (BR-U4-12). 보이는 조건은 앞 화면의 답에만 기대므로 표 순서로 한 번 보면 된다.
 * 배우자가 없으면 세대주 "배우자"도 지운다. 수도권 밖이면 시군구는 null.
 */
export function pruneHidden(answers: WizardAnswers): WizardAnswers {
  const out: WizardAnswers = { ...answers };
  for (const step of STEPS) {
    if (!step.visible(out)) for (const f of step.fields) delete out[f];
  }
  if (out.householdType !== "other") {
    delete out.householdSize;
    delete out.hasSpouse;
  }
  if (out.head === "spouse" && !hasSpouse(out)) delete out.head;
  if (out.sido !== undefined && !needsSigungu(out.sido)) out.sigungu = null;
  return out;
}

/** 보이는 화면 목록 (review 포함). group을 주면 그 그룹 화면만 + review (고치기) */
export function visibleSteps(answers: WizardAnswers, group?: GroupId): WizardStep[] {
  const pruned = pruneHidden(answers);
  return STEPS.filter((s) => s.visible(pruned) && (group === undefined || s.group === group || s.group === "review"));
}

export function nextStep(answers: WizardAnswers, current: StepId, group?: GroupId): StepId | null {
  const list = visibleSteps(answers, group);
  const i = list.findIndex((s) => s.id === current);
  return i >= 0 && i + 1 < list.length ? list[i + 1]!.id : null;
}

export function prevStep(answers: WizardAnswers, current: StepId, group?: GroupId): StepId | null {
  const list = visibleSteps(answers, group);
  const i = list.findIndex((s) => s.id === current);
  return i > 0 ? list[i - 1]!.id : null;
}

/** 진행 표시 (BR-U4-10): 1부터, 분모는 지금 답으로 보일 화면 수(확인 화면 포함) */
export function progress(answers: WizardAnswers, current: StepId, group?: GroupId): { index: number; total: number } {
  const list = visibleSteps(answers, group);
  return { index: Math.max(0, list.findIndex((s) => s.id === current)) + 1, total: list.length };
}

/** 이 화면에서 [다음]을 누를 수 있는지 (BR-U4-27·50·51·53). [잘 모르겠어요]는 따로 처리 */
export function canProceed(step: StepId, a: WizardAnswers): boolean {
  switch (step) {
    case "selfBirth":
      return a.selfBirth !== undefined;
    case "household":
      return a.householdType !== undefined;
    case "householdMore":
      return a.householdSize !== undefined && a.hasSpouse !== undefined;
    case "residence":
      return a.sido !== undefined && (!needsSigungu(a.sido) || (typeof a.sigungu === "string" && a.sigungu.length > 0));
    case "districts":
      return (a.districtIds?.length ?? 0) > 0;
    case "savingsPeriod":
      return a.savingsMonthsBand !== undefined && a.paymentCount !== undefined;
    case "area":
      return true; // 안 고르면 "상관없음"
    case "tenurePrefs":
      return a.tenure !== undefined && a.lowFloor !== undefined;
    case "review":
      return true;
    default:
      return stepById(step).fields.every((f) => a[f] !== undefined);
  }
}

/** [잘 모르겠어요]: 그 화면 항목을 모두 UNKNOWN으로 (필수 화면에는 없음) */
export function markUnknown(step: StepId, a: WizardAnswers): WizardAnswers {
  const def = stepById(step);
  if (!def.allowUnknown) return a;
  const out: Record<string, unknown> = { ...a };
  for (const f of def.fields) out[f] = UNKNOWN;
  return out as WizardAnswers;
}

/** 필수 화면을 모두 채웠는지 (확인 화면의 [저장]) */
export function isComplete(answers: WizardAnswers): boolean {
  const pruned = pruneHidden(answers);
  return STEPS.filter((s) => s.required && s.visible(pruned)).every((s) => canProceed(s.id, pruned));
}

// ---------- 생년월일 연도 범위 (BR-U4-20) ----------
export const SELF_BIRTH_YEARS = { from: 1930, to: 1975, initial: 1960 } as const;

export function spouseBirthYears(today: IsoDate): { from: number; to: number; initial: number } {
  return { from: 1930, to: Number(today.slice(0, 4)) - 19, initial: 1960 };
}

/** 그 달의 날 수 (윤년 포함) */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 연·월·일 → IsoDate. 날이 그 달보다 크면 마지막 날로 (BR-U4-21) */
export function toBirthDate(year: number, month: number, day: number): IsoDate {
  const d = Math.min(day, daysInMonth(year, month));
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 오늘보다 뒤인 날짜는 고를 수 없다 (BR-U4-23) */
export function isFutureDate(date: IsoDate, today: IsoDate): boolean {
  return date > today;
}

/** 저장된 초안의 화면 ID 검사 */
export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && STEPS.some((s) => s.id === value);
}

/** 새로 입력을 시작할 때의 답: 관심 지구는 모두 선택(US-07), 선호는 둘 다·상관없음 */
export function initialAnswers(allDistrictIds: readonly string[]): WizardAnswers {
  return { districtIds: [...allDistrictIds], tenure: "both", lowFloor: false };
}

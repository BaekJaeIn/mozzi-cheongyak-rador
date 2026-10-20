// 마법사 화면 정의 (BR-U4-10~16, 50~53, 변경 2 BR-U4-C6·C10·C16·C17·C31·C32, 변경 3 BR-U4-D1~D22).
// 화면 순서는 표 순서 그대로이고, 보이는 조건은 지금까지의 답으로만 정한다.
import type { IsoDate } from "@shared/domain/dates.ts";
import type { HouseholdKind } from "@shared/domain/profile.ts";
import { needsSigungu } from "./regions";
import type { AnswerKey, SavingsOwnerAnswer, WizardAnswers } from "./types";
import { isNewlywed, UNKNOWN } from "./types";
import type { UpdateItem } from "./updates";

export type GroupId = "basic" | "marriage" | "residence" | "housing" | "savings" | "money" | "districts" | "prefs";

export type StepId =
  | "householdKind"
  | "selfBirth" | "household" | "householdMore" | "spouseBirth" | "head"
  | "marriage" | "marriageDate" | "children"
  | "residence" | "residenceYears"
  | "homeOwned" | "homeCount" | "homelessYears" | "neverOwned" | "incomeTax"
  | "savingsOwner" | "savingsKind" | "savingsPeriod" | "savingsAmount"
  | "spouseSavingsKind" | "spouseSavingsPeriod" | "spouseSavingsAmount"
  | "income" | "spouseIncome" | "spouseEarns" | "asset" | "car" | "welfare"
  | "districts" | "regions" | "area" | "tenurePrefs"
  | "review";

/**
 * 짧은 입력 화면(update)의 범위 (BR-U4-C31·C32): 아직 입력 안 한 새 항목, 예전 프로필의 통장 있음 여부.
 * 예전에 통장이 "있음"이었으면 자세한 화면은 묻지 않는다 (Q3=A)
 */
export interface UpdateScope {
  pending: readonly UpdateItem[];
  beforeSavingsHas: boolean | null;
}

/**
 * 화면 범위: 없음 = 처음 입력 전체(가구 종류 화면 포함), "full" = 처음부터 다시 입력(가구 종류 화면 없음, BR-U4-D42·D45),
 * 그룹 = 그룹 고치기, UpdateScope = 짧은 입력 화면
 */
export type StepScope = GroupId | "full" | UpdateScope | undefined;

export interface WizardStep {
  id: StepId;
  group: GroupId | "kind" | "review";
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
  marriage: "결혼·자녀",
  residence: "사는 곳",
  housing: "집",
  savings: "청약통장",
  money: "소득·자산",
  districts: "관심 지역",
  prefs: "원하는 집",
};

/** 노부부 그룹 순서 (변경 3 전과 같음) */
export const GROUP_ORDER: readonly GroupId[] = ["basic", "residence", "housing", "savings", "money", "districts", "prefs"];
/** 신혼 가구: 기본 정보 다음에 결혼·자녀 (BR-U4-D50) */
export const NEWLYWED_GROUP_ORDER: readonly GroupId[] = ["basic", "marriage", "residence", "housing", "savings", "money", "districts", "prefs"];

export function groupOrder(kind: HouseholdKind): readonly GroupId[] {
  return kind === "newlywed" ? NEWLYWED_GROUP_ORDER : GROUP_ORDER;
}

export const KIND_LABELS: Readonly<Record<HouseholdKind, string>> = { senior: "노부부·어르신", newlywed: "신혼부부·예비신혼부부" };

/** 배우자가 있는 답인지 (BR-U4-13). 신혼 가구는 항상 부부 (BR-U4-D10) */
export function hasSpouse(a: WizardAnswers): boolean {
  return isNewlywed(a) || a.householdType === "couple" || (a.householdType === "other" && a.hasSpouse === true);
}

const always = () => true;

const OWNERS_WITH_ACCOUNT: readonly SavingsOwnerAnswer[] = ["self", "spouse", "both"];

/** 통장이 있다는 답인지 (나·배우자·두 분 다, 혼자 사는 가구의 "있음" = self) */
export function savingsAnswered(a: WizardAnswers): boolean {
  return OWNERS_WITH_ACCOUNT.includes(a.savingsOwner as SavingsOwnerAnswer);
}

const senior = (a: WizardAnswers) => !isNewlywed(a);
/** 통장 자세한 화면 (신혼 = 본인 통장): 신혼은 나·두 분 다, 노부부는 지금 그대로 (BR-U4-D22) */
const ownSavingsVisible = (a: WizardAnswers) => (isNewlywed(a) ? a.savingsOwner === "self" || a.savingsOwner === "both" : savingsAnswered(a));
/** 배우자 통장 화면 (신혼만) */
const spouseSavingsVisible = (a: WizardAnswers) => isNewlywed(a) && (a.savingsOwner === "spouse" || a.savingsOwner === "both");
const knownMarriage = (a: WizardAnswers) => a.marriage === "engaged" || a.marriage === "married";

// 신혼 가구 화면은 노부부 화면 사이에 끼우고, 노부부에게는 보이지 않는다 (BR-U4-D60)
export const STEPS: readonly WizardStep[] = [
  { id: "householdKind", group: "kind", visible: always, required: true, allowUnknown: false, fields: ["householdKind"] },
  { id: "selfBirth", group: "basic", visible: always, required: true, allowUnknown: false, fields: ["selfBirth"] },
  { id: "household", group: "basic", visible: senior, required: true, allowUnknown: false, fields: ["householdType"] },
  { id: "householdMore", group: "basic", visible: (a) => senior(a) && a.householdType === "other", required: true, allowUnknown: false, fields: ["householdSize", "hasSpouse"] },
  { id: "spouseBirth", group: "basic", visible: hasSpouse, required: false, allowUnknown: true, fields: ["spouseBirth"] },
  { id: "head", group: "basic", visible: always, required: false, allowUnknown: true, fields: ["head"] },
  { id: "marriage", group: "marriage", visible: isNewlywed, required: false, allowUnknown: true, fields: ["marriage"] },
  { id: "marriageDate", group: "marriage", visible: (a) => isNewlywed(a) && knownMarriage(a), required: false, allowUnknown: true, fields: ["marriageDate"] },
  { id: "children", group: "marriage", visible: isNewlywed, required: false, allowUnknown: true, fields: ["children"] },
  { id: "residence", group: "residence", visible: always, required: true, allowUnknown: false, fields: ["sido", "sigungu"] },
  { id: "residenceYears", group: "residence", visible: (a) => a.sido !== undefined, required: false, allowUnknown: true, fields: ["residenceYearsBand"] },
  { id: "homeOwned", group: "housing", visible: always, required: false, allowUnknown: true, fields: ["homeOwned"] },
  { id: "homeCount", group: "housing", visible: (a) => a.homeOwned === true, required: false, allowUnknown: true, fields: ["homeCount"] },
  { id: "homelessYears", group: "housing", visible: (a) => a.homeOwned === false, required: false, allowUnknown: true, fields: ["homelessYearsBand"] },
  // 지금 집이 있으면 "가진 적 없음"은 묻지 않는다 (BR-U4-D17)
  { id: "neverOwned", group: "housing", visible: (a) => isNewlywed(a) && a.homeOwned !== true, required: false, allowUnknown: true, fields: ["neverOwned"] },
  { id: "incomeTax", group: "housing", visible: isNewlywed, required: false, allowUnknown: true, fields: ["incomeTax5y"] },
  { id: "savingsOwner", group: "savings", visible: always, required: false, allowUnknown: true, fields: ["savingsOwner"] },
  { id: "savingsKind", group: "savings", visible: ownSavingsVisible, required: false, allowUnknown: true, fields: ["savingsKind"] },
  { id: "savingsPeriod", group: "savings", visible: ownSavingsVisible, required: false, allowUnknown: true, fields: ["savingsMonthsBand", "paymentCount"] },
  { id: "savingsAmount", group: "savings", visible: ownSavingsVisible, required: false, allowUnknown: true, fields: ["depositManwon"] },
  { id: "spouseSavingsKind", group: "savings", visible: spouseSavingsVisible, required: false, allowUnknown: true, fields: ["spouseSavingsKind"] },
  { id: "spouseSavingsPeriod", group: "savings", visible: spouseSavingsVisible, required: false, allowUnknown: true, fields: ["spouseSavingsMonthsBand", "spousePaymentCount"] },
  { id: "spouseSavingsAmount", group: "savings", visible: spouseSavingsVisible, required: false, allowUnknown: true, fields: ["spouseDepositManwon"] },
  { id: "income", group: "money", visible: always, required: false, allowUnknown: true, fields: ["monthlyIncome"] },
  { id: "spouseIncome", group: "money", visible: isNewlywed, required: false, allowUnknown: true, fields: ["spouseIncome"] },
  { id: "spouseEarns", group: "money", visible: (a) => senior(a) && hasSpouse(a), required: false, allowUnknown: true, fields: ["spouseEarns"] },
  { id: "asset", group: "money", visible: always, required: false, allowUnknown: true, fields: ["totalAsset"] },
  { id: "car", group: "money", visible: always, required: false, allowUnknown: true, fields: ["carValue"] },
  { id: "welfare", group: "money", visible: senior, required: false, allowUnknown: true, fields: ["welfare"] },
  // 관심 지역 두 화면 (Q1=A): 3기 신도시는 0개여도 넘어가고, 다른 지역 화면에서 둘을 합쳐 1곳 이상인지 본다 (BR-U4-C10·C16·C17)
  { id: "districts", group: "districts", visible: always, required: false, allowUnknown: false, fields: ["districtIds"] },
  { id: "regions", group: "districts", visible: always, required: true, allowUnknown: false, fields: ["regions"] },
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
  if (isNewlywed(out)) out.householdType = "couple"; // 신혼 가구는 부부 — 가구 구성 화면은 안 보여도 값은 둔다 (BR-U4-D10)
  if (out.householdType !== "other") {
    delete out.householdSize;
    delete out.hasSpouse;
  }
  if (out.head === "spouse" && !hasSpouse(out)) delete out.head;
  // 배우자가 없어지면 배우자·두 분 다 통장 답은 지운다 (BR-U4-C6). 그 바람에 안 보이게 된 자세한 답도 지운다
  if ((out.savingsOwner === "spouse" || out.savingsOwner === "both") && !hasSpouse(out)) {
    delete out.savingsOwner;
    for (const step of STEPS) if (step.group === "savings" && !step.visible(out)) for (const f of step.fields) delete out[f];
  }
  if (out.sido !== undefined && !needsSigungu(out.sido)) out.sigungu = null;
  return out;
}

const isUpdateScope = (scope: StepScope): scope is UpdateScope => typeof scope === "object";

function inScope(step: WizardStep, scope: StepScope): boolean {
  if (scope === undefined) return true;
  if (scope === "full") return step.group !== "kind";
  return step.group === scope || step.group === "review";
}

/** 짧은 입력 화면의 화면 ID (확인 화면 없음, BR-U4-C31·C32) */
export function updateSteps(scope: UpdateScope, answers: WizardAnswers): StepId[] {
  const a = pruneHidden(answers);
  const out: StepId[] = [];
  if (scope.pending.includes("savings")) {
    out.push("savingsOwner");
    if (scope.beforeSavingsHas !== true && savingsAnswered(a)) out.push("savingsKind", "savingsPeriod", "savingsAmount");
  }
  if (scope.pending.includes("regions")) out.push("regions");
  return out;
}

/** 보이는 화면 목록. 그룹이면 그 그룹 화면만 + review (고치기), UpdateScope면 짧은 입력 화면 */
export function visibleSteps(answers: WizardAnswers, scope?: StepScope): WizardStep[] {
  if (isUpdateScope(scope)) return updateSteps(scope, answers).map(stepById);
  const pruned = pruneHidden(answers);
  return STEPS.filter((s) => s.visible(pruned) && inScope(s, scope));
}

export function nextStep(answers: WizardAnswers, current: StepId, scope?: StepScope): StepId | null {
  const list = visibleSteps(answers, scope);
  const i = list.findIndex((s) => s.id === current);
  return i >= 0 && i + 1 < list.length ? list[i + 1]!.id : null;
}

export function prevStep(answers: WizardAnswers, current: StepId, scope?: StepScope): StepId | null {
  const list = visibleSteps(answers, scope);
  const i = list.findIndex((s) => s.id === current);
  return i > 0 ? list[i - 1]!.id : null;
}

/** 진행 표시 (BR-U4-10): 1부터, 분모는 지금 답으로 보일 화면 수(확인 화면 포함) */
export function progress(answers: WizardAnswers, current: StepId, scope?: StepScope): { index: number; total: number } {
  const list = visibleSteps(answers, scope);
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
      return true; // 0개여도 다른 지역 화면으로 (BR-U4-C10)
    case "regions":
      return (a.districtIds?.length ?? 0) + (a.regions?.length ?? 0) > 0; // 둘 합쳐 1곳 이상 (BR-U4-C16)
    case "savingsPeriod":
      return a.savingsMonthsBand !== undefined && a.paymentCount !== undefined;
    case "spouseSavingsPeriod":
      return a.spouseSavingsMonthsBand !== undefined && a.spousePaymentCount !== undefined;
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

/** 필수 화면을 모두 채웠는지 (확인 화면의 [저장]). 가구 종류는 없으면 노부부로 본다(변경 3 전 답) */
export function isComplete(answers: WizardAnswers): boolean {
  const pruned = pruneHidden(answers);
  return STEPS.filter((s) => s.required && s.id !== "householdKind" && s.visible(pruned)).every((s) => canProceed(s.id, pruned));
}

// ---------- 생년월일 연도 범위 (BR-U4-20) ----------
export const SELF_BIRTH_YEARS = { from: 1930, to: 1975, initial: 1960 } as const;

export function spouseBirthYears(today: IsoDate): { from: number; to: number; initial: number } {
  return { from: 1930, to: Number(today.slice(0, 4)) - 19, initial: 1960 };
}

export type YearRange = { from: number; to: number; initial: number };

/** 지금 값이 범위 밖이면 그 해까지 넓힌다 (BR-U4-D12 — 가구 종류를 바꾼 경우) */
function widen(range: YearRange, current: IsoDate | undefined): YearRange {
  if (current === undefined) return range;
  const y = Number(current.slice(0, 4));
  return { ...range, from: Math.min(range.from, y), to: Math.max(range.to, y) };
}

/** 생년월일 연도 범위 — 가구 종류별 (BR-U4-20, 변경 3 BR-U4-D12). 노부부는 지금 그대로 */
export function birthYears(kind: HouseholdKind, who: "self" | "spouse", today: IsoDate, current?: IsoDate): YearRange {
  const base: YearRange = who === "self" ? { ...SELF_BIRTH_YEARS } : spouseBirthYears(today);
  if (kind === "senior") return widen(base, current);
  const range = who === "self" ? { from: 1960, to: Number(today.slice(0, 4)) - 19, initial: 1995 } : { ...base, initial: 1995 };
  return widen(range, current);
}

/** 혼인 날짜 연도 범위 (BR-U4-D13): 예비신혼 올해 ~ 올해 + 3, 신혼 1990 ~ 올해 */
export function marriageYears(status: "engaged" | "married", today: IsoDate, current?: IsoDate): YearRange {
  const y = Number(today.slice(0, 4));
  const range = status === "engaged" ? { from: y, to: y + 3, initial: y } : { from: 1990, to: y, initial: y };
  return widen(range, current);
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

/** 새로 입력을 시작할 때의 답: 관심 지구는 모두 선택(US-07), 선호는 둘 다·상관없음. 다른 지역은 화면에 처음 갈 때 정한다(BR-U4-C11) */
export function initialAnswers(allDistrictIds: readonly string[]): WizardAnswers {
  return { districtIds: [...allDistrictIds], tenure: "both", lowFloor: false };
}

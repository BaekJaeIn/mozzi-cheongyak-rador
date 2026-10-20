// 답 ↔ 프로필 (domain-entities §2.2·§7.2·§8.3, BR-U4-12·13·55·71, 변경 2 BR-U4-C34, 변경 3 BR-U4-D10·D20·D30·D32)
import { type HouseholdKind, type HouseholdProfile, type NewlywedInfo, normalizeRegionPicks, PROFILE_SCHEMA_VERSION, type SavingsInfo } from "@shared/domain/profile.ts";
import { type BandDef, bandOf, HOMELESS_BANDS, lowerOf, MONTHS_BANDS, RESIDENCE_BANDS } from "./bands";
import { needsSigungu } from "./regions";
import { type GroupId, hasSpouse, isComplete, pruneHidden, STEPS } from "./steps";
import { type ChildrenAnswer, isNewlywed, known, type Maybe, UNKNOWN, type WizardAnswers } from "./types";
import type { UpdateItem } from "./updates";

export class IncompleteAnswersError extends Error {
  constructor() {
    super("필수 항목이 비어 있어요");
    this.name = "IncompleteAnswersError";
  }
}

/** 구간 답 → 아래 값 (UNKNOWN·없음 → null) */
function lower<B extends string>(bands: readonly BandDef<B>[], value: Maybe<B> | undefined): number | null {
  const band = known(value);
  return band === null ? null : lowerOf(bands, band);
}

const NO_ACCOUNT: SavingsInfo = { has: false, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null };

/** 통장 한 개 (자세한 값은 답 그대로) */
function account(owner: "self" | "spouse", kind: WizardAnswers["savingsKind"], months: WizardAnswers["savingsMonthsBand"], count: Maybe<number> | undefined, deposit: Maybe<number> | undefined): SavingsInfo {
  return { has: true, owner, kind: known(kind), months: lower(MONTHS_BANDS, months), paymentCount: known(count), depositManwon: known(deposit) };
}

/** 필수가 채워진 답 → 프로필. 안 보이는 화면의 답은 무시한다 */
export function toProfile(answers: WizardAnswers): HouseholdProfile {
  if (!isComplete(answers)) throw new IncompleteAnswersError();
  const a = pruneHidden(answers);
  return isNewlywed(a) ? toNewlywedProfile(a) : toSeniorProfile(a);
}

/** 노부부 — 변경 3 전과 같은 값 + householdKind·newlywed (BR-U4-D60, P-U4-D1) */
function toSeniorProfile(a: WizardAnswers): HouseholdProfile {
  const spouse = hasSpouse(a);
  const householdSize = a.householdType === "couple" ? 2 : a.householdType === "single" ? 1 : a.householdSize!;
  const homeOwned = known(a.homeOwned);
  const owner = known(a.savingsOwner);

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    householdKind: "senior",
    self: { birthDate: a.selfBirth! },
    spouse: spouse ? { birthDate: known(a.spouseBirth) } : null,
    householdType: a.householdType!,
    householdSize,
    householdHead: known(a.head),
    residence: {
      sido: a.sido!,
      sigungu: needsSigungu(a.sido) ? (a.sigungu ?? null) : null,
      years: lower(RESIDENCE_BANDS, a.residenceYearsBand),
    },
    housing:
      homeOwned === true
        ? { homeless: false, homelessYears: null, ownedCount: known(a.homeCount) }
        : homeOwned === false
          ? { homeless: true, homelessYears: lower(HOMELESS_BANDS, a.homelessYearsBand), ownedCount: 0 }
          : { homeless: null, homelessYears: null, ownedCount: null },
    savings:
      owner !== null && owner !== "none"
        ? {
            has: true,
            owner,
            kind: known(a.savingsKind),
            months: lower(MONTHS_BANDS, a.savingsMonthsBand),
            paymentCount: known(a.paymentCount),
            depositManwon: known(a.depositManwon),
          }
        : { has: owner === "none" ? false : null, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null },
    money: {
      monthlyIncome: known(a.monthlyIncome),
      totalAsset: known(a.totalAsset),
      carValue: known(a.carValue),
      spouseEarns: spouse ? known(a.spouseEarns) : null,
    },
    welfare: known(a.welfare),
    newlywed: null,
    prefs: {
      districtIds: [...a.districtIds!],
      regions: normalizeRegionPicks(a.regions ?? []),
      areaBands: [...(a.areaBands ?? [])],
      tenure: a.tenure ?? "both",
      lowFloor: a.lowFloor ?? false,
    },
  };
}

/** 신혼 가구 (domain-entities §8.3) — 부부, 본인·배우자 통장, 소득 합계, 복지 없음 */
function toNewlywedProfile(a: WizardAnswers): HouseholdProfile {
  const homeOwned = known(a.homeOwned);
  const owner = known(a.savingsOwner);
  const children = known(a.children);
  const marriage = known(a.marriage);
  const selfIncome = known(a.monthlyIncome);
  const spouseIncome = known(a.spouseIncome);
  const own = account("self", a.savingsKind, a.savingsMonthsBand, a.paymentCount, a.depositManwon);
  const theirs = account("spouse", a.spouseSavingsKind, a.spouseSavingsMonthsBand, a.spousePaymentCount, a.spouseDepositManwon);
  // 명의 답 → 본인·배우자 통장 (BR-U4-D20). 모름이면 배우자 통장은 null(본인 통장만 보고 확인 필요)
  const [savings, spouseSavings]: [SavingsInfo, SavingsInfo | null] =
    owner === "self" ? [own, NO_ACCOUNT]
    : owner === "spouse" ? [NO_ACCOUNT, theirs]
    : owner === "both" ? [own, theirs]
    : owner === "none" ? [NO_ACCOUNT, NO_ACCOUNT]
    : [{ ...NO_ACCOUNT, has: null }, null];
  const newlywed: NewlywedInfo = {
    marriage,
    marriageDate: marriage === null ? null : known(a.marriageDate),
    children,
    neverOwnedHome: homeOwned === true ? false : known(a.neverOwned), // BR-U4-D17
    incomeTax5y: known(a.incomeTax5y),
    spouseSavings,
  };
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    householdKind: "newlywed",
    self: { birthDate: a.selfBirth! },
    spouse: { birthDate: known(a.spouseBirth) },
    householdType: "couple",
    householdSize: 2 + (children ?? 0), // BR-U4-D10
    householdHead: known(a.head),
    residence: {
      sido: a.sido!,
      sigungu: needsSigungu(a.sido) ? (a.sigungu ?? null) : null,
      years: lower(RESIDENCE_BANDS, a.residenceYearsBand),
    },
    housing:
      homeOwned === true
        ? { homeless: false, homelessYears: null, ownedCount: known(a.homeCount) }
        : homeOwned === false
          ? { homeless: true, homelessYears: lower(HOMELESS_BANDS, a.homelessYearsBand), ownedCount: 0 }
          : { homeless: null, homelessYears: null, ownedCount: null },
    savings,
    money: {
      // 합계는 둘 다 알 때만 (BR-U2-D23, BR-U4-D32)
      monthlyIncome: selfIncome !== null && spouseIncome !== null ? selfIncome + spouseIncome : null,
      spouseMonthlyIncome: spouseIncome,
      totalAsset: known(a.totalAsset),
      carValue: known(a.carValue),
      spouseEarns: spouseIncome === null ? null : spouseIncome > 0,
    },
    welfare: null, // BR-U4-D11
    newlywed,
    prefs: {
      districtIds: [...a.districtIds!],
      regions: normalizeRegionPicks(a.regions ?? []),
      areaBands: [...(a.areaBands ?? [])],
      tenure: a.tenure ?? "both",
      lowFloor: a.lowFloor ?? false,
    },
  };
}

const orUnknown = <T>(v: T | null): Maybe<T> => (v === null ? UNKNOWN : v);

/** 프로필 → 답 (고치기·처음부터 다시 입력, BR-U4-71·73). null → UNKNOWN */
export function fromProfile(p: HouseholdProfile): WizardAnswers {
  const a: WizardAnswers = {
    householdKind: p.householdKind,
    householdType: p.householdType,
    head: orUnknown(p.householdHead),
    residenceYearsBand: p.residence.years === null ? UNKNOWN : bandOf(RESIDENCE_BANDS, p.residence.years),
    homeOwned: p.housing.homeless === null ? UNKNOWN : !p.housing.homeless,
    savingsOwner: p.savings.has === true ? (p.savings.owner ?? "self") : p.savings.has === false ? "none" : UNKNOWN,
    monthlyIncome: orUnknown(p.money.monthlyIncome),
    totalAsset: orUnknown(p.money.totalAsset),
    carValue: orUnknown(p.money.carValue),
    welfare: orUnknown(p.welfare),
    districtIds: [...p.prefs.districtIds],
    regions: p.prefs.regions.map((r) => ({ ...r })),
    areaBands: [...p.prefs.areaBands],
    tenure: p.prefs.tenure,
    lowFloor: p.prefs.lowFloor,
  };
  if (p.self.birthDate !== null) a.selfBirth = p.self.birthDate;
  if (p.residence.sido !== null) {
    a.sido = p.residence.sido;
    a.sigungu = p.residence.sigungu;
  }
  if (p.householdType === "other") {
    a.householdSize = p.householdSize;
    a.hasSpouse = p.spouse !== null;
  }
  if (p.spouse) {
    a.spouseBirth = orUnknown(p.spouse.birthDate);
    a.spouseEarns = orUnknown(p.money.spouseEarns);
  }
  if (p.housing.homeless === false) a.homeCount = p.housing.ownedCount === null ? UNKNOWN : Math.min(5, Math.max(1, p.housing.ownedCount));
  if (p.housing.homeless === true) {
    a.homelessYearsBand = p.housing.homelessYears === null ? UNKNOWN : bandOf(HOMELESS_BANDS, p.housing.homelessYears);
  }
  if (p.savings.has === true) {
    a.savingsKind = orUnknown(p.savings.kind);
    a.savingsMonthsBand = p.savings.months === null ? UNKNOWN : bandOf(MONTHS_BANDS, p.savings.months);
    a.paymentCount = orUnknown(p.savings.paymentCount);
    a.depositManwon = orUnknown(p.savings.depositManwon);
  }
  if (p.householdKind === "newlywed" && p.newlywed) {
    Object.assign(a, newlywedAnswers(p, p.newlywed));
    delete a.spouseEarns; // 신혼 가구는 배우자 소득으로 정하고, 복지는 묻지 않는다 (BR-U4-D11·D30)
    delete a.welfare;
  }
  return a;
}

/** 신혼 프로필 → 답 (domain-entities §8.3 fromProfile) */
function newlywedAnswers(p: HouseholdProfile, n: NewlywedInfo): WizardAnswers {
  const self = p.savings.has;
  const spouse = n.spouseSavings?.has ?? null;
  const owner: WizardAnswers["savingsOwner"] =
    self === true && spouse === true ? "both"
    : self === true ? "self"
    : spouse === true ? "spouse"
    : self === false ? "none"
    : UNKNOWN;
  const spouseIncome = p.money.spouseMonthlyIncome ?? null;
  const total = p.money.monthlyIncome;
  const a: WizardAnswers = {
    householdKind: "newlywed",
    marriage: orUnknown(n.marriage),
    children: n.children === null ? UNKNOWN : (Math.min(3, n.children) as ChildrenAnswer),
    incomeTax5y: orUnknown(n.incomeTax5y),
    savingsOwner: owner,
    monthlyIncome: total !== null && spouseIncome !== null ? Math.max(0, total - spouseIncome) : UNKNOWN,
    spouseIncome: orUnknown(spouseIncome),
  };
  if (n.marriage !== null) a.marriageDate = orUnknown(n.marriageDate);
  if (p.housing.homeless !== false) a.neverOwned = orUnknown(n.neverOwnedHome);
  if (spouse === true && n.spouseSavings) {
    const s = n.spouseSavings;
    a.spouseSavingsKind = orUnknown(s.kind);
    a.spouseSavingsMonthsBand = s.months === null ? UNKNOWN : bandOf(MONTHS_BANDS, s.months);
    a.spousePaymentCount = orUnknown(s.paymentCount);
    a.spouseDepositManwon = orUnknown(s.depositManwon);
  }
  return a;
}

const SAVINGS_DETAIL = ["savingsKind", "savingsMonthsBand", "paymentCount", "depositManwon"] as const;
const SPOUSE_SAVINGS_DETAIL = ["spouseSavingsKind", "spouseSavingsMonthsBand", "spousePaymentCount", "spouseDepositManwon"] as const;
const NEWLYWED_ONLY = ["marriage", "marriageDate", "children", "neverOwned", "incomeTax5y", ...SPOUSE_SAVINGS_DETAIL, "spouseIncome"] as const;

/** 통장 자세한 값 옮기기 (본인 키 ↔ 배우자 키) */
function moveSavings(a: Record<string, unknown>, from: readonly string[], to: readonly string[]): void {
  from.forEach((k, i) => {
    if (a[k] !== undefined) a[to[i]!] = a[k];
    delete a[k];
  });
}

const monthsOf = (band: unknown) => (typeof band === "string" && band !== UNKNOWN ? lowerOf(MONTHS_BANDS, band as never) : -1);

/**
 * 가구 종류 바꾸기 (domain-entities §8.4, BR-U4-D42): 지금 답을 새 종류의 답으로 옮긴다.
 * 공통 답은 그대로, 뜻이 다른 답(소득·노부부 "두 분 다" 통장)은 지우거나 옮겨 다시 묻는다. 결과는 pruneHidden을 거친다
 */
export function switchKind(answers: WizardAnswers, kind: HouseholdKind): WizardAnswers {
  const a: Record<string, unknown> = { ...answers };
  const from = isNewlywed(answers) ? "newlywed" : "senior";
  if (from === kind) return pruneHidden({ ...answers, householdKind: kind });
  if (kind === "newlywed") {
    a.householdType = "couple";
    delete a.householdSize;
    delete a.hasSpouse;
    if (a.savingsOwner === "spouse") moveSavings(a, SAVINGS_DETAIL, SPOUSE_SAVINGS_DETAIL);
    else if (a.savingsOwner === "both") {
      delete a.savingsOwner; // 어느 통장 값인지 몰라 다시 묻는다
      for (const k of SAVINGS_DETAIL) delete a[k];
    }
    delete a.monthlyIncome; // 합계 → 본인 소득: 뜻이 달라 다시 묻는다
    delete a.spouseEarns;
    delete a.welfare;
  } else {
    const children = known(answers.children as Maybe<ChildrenAnswer> | undefined) ?? 0;
    if (children > 0) {
      a.householdType = "other";
      a.householdSize = Math.min(2 + children, 8);
      a.hasSpouse = true;
    } else a.householdType = "couple";
    if (a.savingsOwner === "spouse") moveSavings(a, SPOUSE_SAVINGS_DETAIL, SAVINGS_DETAIL);
    else if (a.savingsOwner === "both" && monthsOf(a.spouseSavingsMonthsBand) > monthsOf(a.savingsMonthsBand)) {
      moveSavings(a, SPOUSE_SAVINGS_DETAIL, SAVINGS_DETAIL); // 가입 기간이 긴 쪽 (같으면 본인)
    }
    const self = known(answers.monthlyIncome);
    const spouse = known(answers.spouseIncome);
    if (self !== null && spouse !== null) {
      a.monthlyIncome = self + spouse;
      a.spouseEarns = spouse > 0;
    } else {
      delete a.monthlyIncome;
      delete a.spouseEarns;
    }
    for (const k of NEWLYWED_ONLY) delete a[k];
  }
  a.householdKind = kind;
  return pruneHidden(a as WizardAnswers);
}

/** 그룹 고치기 결과 합치기: 그 그룹 답만 바꾸고, 그 때문에 안 보이게 된 다른 그룹 답은 지운다 (BR-U4-71) */
export function mergeGroupEdit(current: WizardAnswers, edited: WizardAnswers, group: GroupId): WizardAnswers {
  const out: Record<string, unknown> = { ...current };
  for (const step of STEPS.filter((s) => s.group === group)) {
    for (const f of step.fields) {
      if (edited[f] === undefined) delete out[f];
      else out[f] = edited[f];
    }
  }
  return pruneHidden(out as WizardAnswers);
}

/**
 * 짧은 입력 화면 결과 합치기 (BR-U4-C34, P-U4-C5): 새 항목(통장 그룹 답·다른 지역)만 바꾸고 나머지는 그대로.
 * 3기 신도시 지구는 건드리지 않는다 (C2-D6)
 */
export function mergeUpdate(current: WizardAnswers, edited: WizardAnswers, pending: readonly UpdateItem[]): WizardAnswers {
  let out = pending.includes("savings") ? mergeGroupEdit(current, edited, "savings") : { ...current };
  if (pending.includes("regions")) out = pruneHidden({ ...out, regions: [...(edited.regions ?? [])] });
  return out;
}

/** 비워 둔(null) 항목이 있는지 — 확인 화면 안내 (BR-U4-54) */
export function hasBlankFields(p: HouseholdProfile): boolean {
  const values: unknown[] = [
    p.spouse?.birthDate,
    p.householdHead,
    p.residence.years,
    p.housing.homeless,
    p.housing.homeless === false ? p.housing.ownedCount : p.housing.homelessYears,
    p.savings.has,
    ...(p.savings.has ? [p.savings.kind, p.savings.months, p.savings.paymentCount, p.savings.depositManwon] : []),
    p.money.monthlyIncome,
    p.money.totalAsset,
    p.money.carValue,
    ...(p.householdKind === "newlywed" && p.newlywed
      ? [
          p.money.spouseMonthlyIncome ?? null,
          p.newlywed.marriage,
          p.newlywed.marriage === null ? false : p.newlywed.marriageDate,
          p.newlywed.children,
          p.newlywed.neverOwnedHome,
          p.newlywed.incomeTax5y,
          ...(p.newlywed.spouseSavings?.has
            ? [p.newlywed.spouseSavings.kind, p.newlywed.spouseSavings.months, p.newlywed.spouseSavings.paymentCount, p.newlywed.spouseSavings.depositManwon]
            : []),
        ]
      : [p.spouse ? p.money.spouseEarns : false, p.welfare]),
  ];
  return values.some((v) => v === null);
}

// 답 ↔ 프로필 (domain-entities §2.2, BR-U4-12·13·55·71)
import { type HouseholdProfile, PROFILE_SCHEMA_VERSION } from "@shared/domain/profile.ts";
import { type BandDef, bandOf, HOMELESS_BANDS, lowerOf, MONTHS_BANDS, RESIDENCE_BANDS } from "./bands";
import { needsSigungu } from "./regions";
import { type GroupId, hasSpouse, isComplete, pruneHidden, STEPS } from "./steps";
import { known, type Maybe, UNKNOWN, type WizardAnswers } from "./types";

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

/** 필수가 채워진 답 → 프로필. 안 보이는 화면의 답은 무시한다 */
export function toProfile(answers: WizardAnswers): HouseholdProfile {
  if (!isComplete(answers)) throw new IncompleteAnswersError();
  const a = pruneHidden(answers);
  const spouse = hasSpouse(a);
  const householdSize = a.householdType === "couple" ? 2 : a.householdType === "single" ? 1 : a.householdSize!;
  const homeOwned = known(a.homeOwned);
  const savingsHas = known(a.savingsHas);

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
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
      savingsHas === true
        ? {
            has: true,
            owner: "self", // 명의 질문은 U4 변경 2에서 — 그 전까지는 지금처럼 이 휴대폰 주인
            kind: known(a.savingsKind),
            months: lower(MONTHS_BANDS, a.savingsMonthsBand),
            paymentCount: known(a.paymentCount),
            depositManwon: known(a.depositManwon),
          }
        : { has: savingsHas, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null },
    money: {
      monthlyIncome: known(a.monthlyIncome),
      totalAsset: known(a.totalAsset),
      carValue: known(a.carValue),
      spouseEarns: spouse ? known(a.spouseEarns) : null,
    },
    welfare: known(a.welfare),
    prefs: {
      districtIds: [...a.districtIds!],
      regions: [], // 관심 시군구 화면은 U4 변경 2에서
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
    householdType: p.householdType,
    head: orUnknown(p.householdHead),
    residenceYearsBand: p.residence.years === null ? UNKNOWN : bandOf(RESIDENCE_BANDS, p.residence.years),
    homeOwned: p.housing.homeless === null ? UNKNOWN : !p.housing.homeless,
    savingsHas: orUnknown(p.savings.has),
    monthlyIncome: orUnknown(p.money.monthlyIncome),
    totalAsset: orUnknown(p.money.totalAsset),
    carValue: orUnknown(p.money.carValue),
    welfare: orUnknown(p.welfare),
    districtIds: [...p.prefs.districtIds],
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
  return a;
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
    p.spouse ? p.money.spouseEarns : false,
    p.welfare,
  ];
  return values.some((v) => v === null);
}

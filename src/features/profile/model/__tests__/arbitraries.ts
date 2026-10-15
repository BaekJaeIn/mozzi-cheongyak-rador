// 생성기 — 마법사 답 (domain-entities §6). 필수는 항상 채우고, 숨은 화면의 답도 섞는다(P-U4-3).
import { fc } from "@fast-check/vitest";
import { AREA_BANDS, SAVINGS_KINDS, WELFARE_STATUSES } from "@shared/domain/profile.ts";
import { birthDateArb } from "@shared/__tests__/arbitraries/eligibility.ts";
import { HOMELESS_BANDS, MONTHS_BANDS, RESIDENCE_BANDS } from "../bands";
import { ALL_DISTRICT_IDS } from "../districts";
import { SIDO_OPTIONS, SIGUNGU_BY_SIDO } from "../regions";
import { UNKNOWN, type WizardAnswers } from "../types";

/** 값 / UNKNOWN / 안 답함(undefined) */
const opt = <T>(arb: fc.Arbitrary<T>) => fc.oneof(arb, fc.constant(UNKNOWN), fc.constant(undefined));
const bandArb = <B extends string>(bands: readonly { band: B }[]) => fc.constantFrom(...bands.map((b) => b.band));
const manwonArb = fc.integer({ min: 0, max: 1_000_000 });

const residenceArb = fc.constantFrom(...SIDO_OPTIONS.map((o) => o.value)).chain((sido) => {
  const list = SIGUNGU_BY_SIDO[sido];
  return (list ? fc.constantFrom(...list) : fc.constant(null)).map((sigungu) => ({ sido, sigungu }));
});

export const answersArb: fc.Arbitrary<WizardAnswers> = fc
  .record({
    selfBirth: birthDateArb,
    householdType: fc.constantFrom("couple" as const, "single" as const, "other" as const),
    householdSize: fc.integer({ min: 2, max: 8 }),
    hasSpouse: fc.boolean(),
    spouseBirth: opt(birthDateArb),
    head: opt(fc.constantFrom("self" as const, "spouse" as const, "other" as const)),
    residence: residenceArb,
    residenceYearsBand: opt(bandArb(RESIDENCE_BANDS)),
    homeOwned: opt(fc.boolean()),
    homeCount: opt(fc.integer({ min: 1, max: 5 })),
    homelessYearsBand: opt(bandArb(HOMELESS_BANDS)),
    savingsHas: opt(fc.boolean()),
    savingsKind: opt(fc.constantFrom(...SAVINGS_KINDS)),
    savingsMonthsBand: opt(bandArb(MONTHS_BANDS)),
    paymentCount: opt(fc.integer({ min: 0, max: 600 })),
    depositManwon: opt(manwonArb),
    monthlyIncome: opt(manwonArb),
    spouseEarns: opt(fc.boolean()),
    totalAsset: opt(manwonArb),
    carValue: opt(manwonArb),
    welfare: opt(fc.constantFrom(...WELFARE_STATUSES)),
    districtIds: fc.subarray([...ALL_DISTRICT_IDS], { minLength: 1 }),
    areaBands: fc.option(fc.subarray([...AREA_BANDS]), { nil: undefined }),
    tenure: fc.option(fc.constantFrom("sale" as const, "rent" as const, "both" as const), { nil: undefined }),
    lowFloor: fc.option(fc.boolean(), { nil: undefined }),
  })
  .map(({ residence, ...rest }) => {
    const a: Record<string, unknown> = { ...rest, sido: residence.sido, sigungu: residence.sigungu };
    for (const [k, v] of Object.entries(a)) if (v === undefined) delete a[k];
    return a as WizardAnswers;
  });

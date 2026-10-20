// 생성기 — 마법사 답 (domain-entities §6). 필수는 항상 채우고, 숨은 화면의 답도 섞는다(P-U4-3).
import { fc } from "@fast-check/vitest";
import { AREA_BANDS, SAVINGS_KINDS, WELFARE_STATUSES } from "@shared/domain/profile.ts";
import { birthDateArb, noticeDateArb } from "@shared/__tests__/arbitraries/eligibility.ts";
import { HOMELESS_BANDS, MONTHS_BANDS, RESIDENCE_BANDS } from "../bands";
import { ALL_DISTRICT_IDS } from "../districts";
import { SIDO_OPTIONS, SIGUNGU_BY_SIDO, toggleRegion } from "../regions";
import { CAPITAL_SIDO, CAPITAL_SIGUNGU } from "@shared/domain/regions.ts";
import type { RegionPick } from "@shared/domain/profile.ts";
import { UNKNOWN, type WizardAnswers } from "../types";

/** 값 / UNKNOWN / 안 답함(undefined) */
const opt = <T>(arb: fc.Arbitrary<T>) => fc.oneof(arb, fc.constant(UNKNOWN), fc.constant(undefined));
const bandArb = <B extends string>(bands: readonly { band: B }[]) => fc.constantFrom(...bands.map((b) => b.band));
const manwonArb = fc.integer({ min: 0, max: 1_000_000 });

const residenceArb = fc.constantFrom(...SIDO_OPTIONS.map((o) => o.value)).chain((sido) => {
  const list = SIGUNGU_BY_SIDO[sido];
  return (list ? fc.constantFrom(...list) : fc.constant(null)).map((sigungu) => ({ sido, sigungu }));
});

/** 다른 지역: 아무 누르기 순서의 결과 (toggleRegion은 항상 정리된 값을 낸다, P-U4-C6) */
export const regionTapArb = fc.constantFrom(...CAPITAL_SIDO).chain((sido) =>
  fc.option(fc.constantFrom(...CAPITAL_SIGUNGU[sido]), { nil: null }).map((sigungu) => ({ sido, sigungu })),
);
export const regionsArb: fc.Arbitrary<RegionPick[]> = fc
  .array(regionTapArb, { maxLength: 12 })
  .map((taps) => taps.reduce<RegionPick[]>((acc, t) => toggleRegion(acc, t.sido, t.sigungu), []));

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
    savingsOwner: opt(fc.constantFrom("self" as const, "spouse" as const, "both" as const, "none" as const)),
    savingsKind: opt(fc.constantFrom(...SAVINGS_KINDS)),
    savingsMonthsBand: opt(bandArb(MONTHS_BANDS)),
    paymentCount: opt(fc.integer({ min: 0, max: 600 })),
    depositManwon: opt(manwonArb),
    monthlyIncome: opt(manwonArb),
    spouseEarns: opt(fc.boolean()),
    totalAsset: opt(manwonArb),
    carValue: opt(manwonArb),
    welfare: opt(fc.constantFrom(...WELFARE_STATUSES)),
    districtIds: fc.subarray([...ALL_DISTRICT_IDS]),
    regions: fc.option(regionsArb, { nil: undefined }),
    areaBands: fc.option(fc.subarray([...AREA_BANDS]), { nil: undefined }),
    tenure: fc.option(fc.constantFrom("sale" as const, "rent" as const, "both" as const), { nil: undefined }),
    lowFloor: fc.option(fc.boolean(), { nil: undefined }),
  })
  .map(({ residence, ...rest }) => {
    const a: Record<string, unknown> = { ...rest, sido: residence.sido, sigungu: residence.sigungu };
    // 필수: 3기 신도시 + 다른 지역 1곳 이상 (BR-U4-C17)
    if (rest.districtIds.length === 0 && (rest.regions?.length ?? 0) === 0) a.districtIds = ["gyosan"];
    for (const [k, v] of Object.entries(a)) if (v === undefined) delete a[k];
    return a as WizardAnswers;
  });

/**
 * 신혼 가구 답 (변경 3, P-U4-D2~D6). 노부부 답 위에 신혼 키를 얹는다 — 숨은 답(가구 구성·복지 등)도 섞여 있어
 * pruneHidden이 지우는지까지 본다
 */
export const newlywedAnswersArb: fc.Arbitrary<WizardAnswers> = fc
  .record({
    base: answersArb,
    marriage: opt(fc.constantFrom("engaged" as const, "married" as const)),
    marriageDate: opt(noticeDateArb),
    children: opt(fc.constantFrom(0 as const, 1 as const, 2 as const, 3 as const)),
    neverOwned: opt(fc.boolean()),
    incomeTax5y: opt(fc.boolean()),
    spouseSavingsKind: opt(fc.constantFrom(...SAVINGS_KINDS)),
    spouseSavingsMonthsBand: opt(bandArb(MONTHS_BANDS)),
    spousePaymentCount: opt(fc.integer({ min: 0, max: 600 })),
    spouseDepositManwon: opt(manwonArb),
    spouseIncome: opt(fc.integer({ min: 0, max: 5_000 })),
    selfIncome: opt(fc.integer({ min: 0, max: 5_000 })),
  })
  .map(({ base, selfIncome, ...rest }) => {
    const a: Record<string, unknown> = { ...base, ...rest, monthlyIncome: selfIncome, householdKind: "newlywed" };
    for (const [k, v] of Object.entries(a)) if (v === undefined) delete a[k];
    return a as WizardAnswers;
  });

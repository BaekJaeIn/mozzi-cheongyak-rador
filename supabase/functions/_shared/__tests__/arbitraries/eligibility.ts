// U2 도메인 생성기 (PBT-07, NFR-U2-24). 도메인 제약(나이 범위, 금액 범위, 가구 구성)을 지킨다.
import fc from "fast-check";
import type { HouseholdProfile } from "../../domain/profile.ts";
import { AREA_BANDS, SAVINGS_KINDS, WELFARE_STATUSES } from "../../domain/profile.ts";
import type { IncomeRequirement, Requirements } from "../../domain/requirements.ts";
import { SUPPLY_TYPE_CODES } from "../../domain/supply-types.ts";
import type { IncomeThreshold } from "../../eligibility/income-table.ts";
import { DISTRICTS, INCOME_THRESHOLDS } from "../../eligibility/reference-data.ts";
import type { NoticeForJudgement, UnitForJudgement } from "../../eligibility/types.ts";
import type { IsoDate } from "../../domain/dates.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const dateBetween = (from: string, to: string): fc.Arbitrary<IsoDate> =>
  fc
    .integer({ min: Date.parse(`${from}T00:00:00Z`) / DAY_MS, max: Date.parse(`${to}T00:00:00Z`) / DAY_MS })
    .map((day) => new Date(day * DAY_MS).toISOString().slice(0, 10));

export const birthDateArb = dateBetween("1930-01-01", "1975-12-31");
export const noticeDateArb = dateBetween("2025-01-01", "2027-12-31");
export const DISTRICT_IDS = DISTRICTS.map((d) => d.id);

/** nullable=true면 값마다 null("모름")이 섞인다 */
function maybe<T>(arb: fc.Arbitrary<T>, nullable: boolean): fc.Arbitrary<T | null> {
  return nullable ? fc.option(arb, { nil: null, freq: 4 }) : arb;
}

export function profileArb(options: { nullable?: boolean; couple?: boolean } = {}): fc.Arbitrary<HouseholdProfile> {
  const n = options.nullable ?? true;
  const spouseArb = options.couple
    ? fc.record({ birthDate: maybe(birthDateArb, n) })
    : fc.option(fc.record({ birthDate: maybe(birthDateArb, n) }), { nil: null });

  return fc
    .record({
      selfBirth: maybe(birthDateArb, n),
      spouse: spouseArb,
      otherSize: fc.integer({ min: 1, max: 8 }),
      otherType: fc.boolean(),
      householdHead: maybe(fc.constantFrom("self" as const, "spouse" as const, "other" as const), n),
      residence: fc.record({
        sido: maybe(fc.constantFrom("서울", "서울특별시", "인천", "경기도", "경기", "부산", "대전", "강원"), n),
        sigungu: maybe(fc.constantFrom("하남시", "남양주시", "계양구", "중구"), n),
        years: maybe(fc.integer({ min: 0, max: 60 }), n),
      }),
      housing: fc.record({
        homeless: maybe(fc.boolean(), n),
        homelessYears: maybe(fc.integer({ min: 0, max: 40 }), n),
        ownedCount: maybe(fc.integer({ min: 0, max: 3 }), n),
      }),
      savings: fc.record({
        has: maybe(fc.boolean(), n),
        kind: maybe(fc.constantFrom(...SAVINGS_KINDS), n),
        months: maybe(fc.integer({ min: 0, max: 300 }), n),
        paymentCount: maybe(fc.integer({ min: 0, max: 300 }), n),
        depositManwon: maybe(fc.integer({ min: 0, max: 3000 }), n),
      }),
      money: fc.record({
        monthlyIncome: maybe(fc.integer({ min: 0, max: 2000 }), n),
        totalAsset: maybe(fc.integer({ min: 0, max: 100_000 }), n),
        carValue: maybe(fc.integer({ min: 0, max: 10_000 }), n),
        spouseEarns: maybe(fc.boolean(), n),
      }),
      welfare: maybe(fc.constantFrom(...WELFARE_STATUSES), n),
      prefs: fc.record({
        districtIds: fc.subarray(DISTRICT_IDS, { minLength: 1 }),
        areaBands: fc.subarray([...AREA_BANDS]),
        tenure: fc.constantFrom("sale" as const, "rent" as const, "both" as const),
        lowFloor: fc.boolean(),
      }),
    })
    .map((r): HouseholdProfile => {
      const couple = r.spouse !== null;
      const householdType = couple ? "couple" : r.otherType ? "other" : "single";
      return {
        schemaVersion: 1,
        self: { birthDate: r.selfBirth },
        spouse: r.spouse,
        householdType,
        householdSize: couple ? Math.max(2, r.otherSize) : householdType === "single" ? 1 : r.otherSize,
        householdHead: r.householdHead,
        residence: r.residence,
        housing: r.housing,
        savings: r.savings,
        money: r.money,
        welfare: r.welfare,
        prefs: r.prefs,
      };
    });
}

const sizeMap = (min: number, max: number) =>
  fc.dictionary(fc.constantFrom("1", "2", "3", "4"), fc.integer({ min, max }), { maxKeys: 3 }) as unknown as fc.Arbitrary<
    Record<number, number>
  >;

export const incomeRequirementArb: fc.Arbitrary<IncomeRequirement> = fc
  .record(
    {
      basis: fc.constantFrom("urban_worker" as const, "median" as const),
      percent: fc.integer({ min: 30, max: 200 }),
      percentBySize: sizeMap(30, 200),
      dualIncomePercent: fc.integer({ min: 100, max: 250 }),
      amountsWon: sizeMap(1_000_000, 15_000_000),
      appliesToAreaMaxM2: fc.integer({ min: 40, max: 85 }),
    },
    { requiredKeys: ["basis", "percent"] },
  );

/** 키 없음 / "unknown" / 값 */
const slot = <T>(arb: fc.Arbitrary<T>) =>
  fc.oneof(fc.constant(undefined), fc.constant("unknown" as const), arb, arb);

export const requirementsArb: fc.Arbitrary<Requirements> = fc.oneof(
  { weight: 1, arbitrary: fc.constant<Requirements>({ unclassified: true }) },
  {
    weight: 9,
    arbitrary: fc
      .record({
        age: slot(fc.record({ minAge: fc.integer({ min: 55, max: 70 }), who: fc.constantFrom("member" as const, "head" as const) })),
        homeless: slot(fc.record({ minYears: fc.option(fc.integer({ min: 1, max: 5 }), { nil: null }) })),
        income: slot(incomeRequirementArb),
        asset: slot(fc.record({ maxManwon: fc.integer({ min: 5000, max: 60_000 }) })),
        car: slot(fc.record({ maxManwon: fc.integer({ min: 500, max: 8000 }) })),
        savings: slot(
          fc.record(
            {
              minMonths: fc.integer({ min: 0, max: 24 }),
              minPayments: fc.integer({ min: 0, max: 24 }),
              depositRule: fc.constant("private_by_region_area" as const),
              minDepositManwon: fc.integer({ min: 0, max: 1500 }),
            },
            { requiredKeys: ["minMonths"] },
          ),
        ),
        residence: slot(fc.record({ sidoIn: fc.subarray(["서울", "인천", "경기", "부산"], { minLength: 1 }) })),
        household: slot(fc.record({ headRequired: fc.boolean() })),
        welfare: slot(
          fc.record(
            {
              anyOf: fc.subarray(["livelihood_or_medical" as const, "near_poverty" as const, "other_priority" as const]),
              orIncome: incomeRequirementArb,
            },
            { requiredKeys: ["anyOf"] },
          ),
        ),
      })
      .map((r) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(r)) if (v !== undefined) out[k] = v;
        return out as Requirements;
      }),
  },
);

export const unitArb: fc.Arbitrary<UnitForJudgement> = fc.record({
  id: fc.uuid({ version: 4 }),
  supplyType: fc.constantFrom(...SUPPLY_TYPE_CODES),
  exclusiveAreaM2: fc.option(fc.integer({ min: 20, max: 140 }), { nil: null }),
  requirements: requirementsArb,
});

export const noticeArb: fc.Arbitrary<NoticeForJudgement> = fc.record({
  id: fc.uuid({ version: 4 }),
  tenure: fc.constantFrom("sale" as const, "rent" as const),
  announcedAt: fc.option(noticeDateArb, { nil: null }),
  applyStart: fc.option(noticeDateArb, { nil: null }),
  applyEnd: fc.option(noticeDateArb, { nil: null }),
  districtIds: fc.subarray(DISTRICT_IDS),
  units: fc.array(unitArb, { maxLength: 4 }),
});

/** 실제 2026 표 + 임의로 일부를 뺀 표 (기준표 없음 경로 포함) */
export const incomeThresholdsArb: fc.Arbitrary<IncomeThreshold[]> = fc.oneof<fc.Arbitrary<IncomeThreshold[]>[]>(
  fc.constant([...INCOME_THRESHOLDS]),
  fc.subarray([...INCOME_THRESHOLDS]),
);

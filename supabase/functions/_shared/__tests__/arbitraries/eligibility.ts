// U2 도메인 생성기 (PBT-07, NFR-U2-24). 도메인 제약(나이 범위, 금액 범위, 가구 구성)을 지킨다.
import fc from "fast-check";
import type { HouseholdProfile, RegionPick } from "../../domain/profile.ts";
import { AREA_BANDS, normalizeRegionPicks, SAVINGS_KINDS, SAVINGS_OWNERS, WELFARE_STATUSES } from "../../domain/profile.ts";
import { CAPITAL_SIDO, CAPITAL_SIGUNGU } from "../../domain/regions.ts";
import type { IncomeRequirement, Requirements } from "../../domain/requirements.ts";
import { SUPPLY_TYPE_CODES } from "../../domain/supply-types.ts";
import type { IncomeThreshold } from "../../eligibility/income-table.ts";
import { DISTRICTS, INCOME_THRESHOLDS } from "../../eligibility/reference-data.ts";
import type { NoticeForJudgement, NoticeRegion, UnitForJudgement } from "../../eligibility/types.ts";
import type { IsoDate } from "../../domain/dates.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const dateBetween = (from: string, to: string): fc.Arbitrary<IsoDate> =>
  fc
    .integer({ min: Date.parse(`${from}T00:00:00Z`) / DAY_MS, max: Date.parse(`${to}T00:00:00Z`) / DAY_MS })
    .map((day) => new Date(day * DAY_MS).toISOString().slice(0, 10));

export const birthDateArb = dateBetween("1930-01-01", "1975-12-31");
export const noticeDateArb = dateBetween("2025-01-01", "2027-12-31");
export const DISTRICT_IDS = DISTRICTS.map((d) => d.id);

/** 수도권 시도 + (시군구 또는 null) — 관심 지역(null=시도 전체)·공고 지역(null=시도까지만 확인) 공용 */
const sidoSigunguArb = fc.constantFrom(...CAPITAL_SIDO).chain((sido) =>
  fc.record({ sido: fc.constant(sido), sigungu: fc.option(fc.constantFrom(...CAPITAL_SIGUNGU[sido]), { nil: null, freq: 5 }) }),
);
export const regionPickArb: fc.Arbitrary<RegionPick> = sidoSigunguArb;
export const noticeRegionArb: fc.Arbitrary<NoticeRegion> = sidoSigunguArb;
/** 검사 규칙에 맞게 정리된 관심 시군구 목록 */
export const regionPicksArb: fc.Arbitrary<RegionPick[]> = fc.array(regionPickArb, { maxLength: 6 }).map(normalizeRegionPicks);

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
        owner: fc.option(fc.constantFrom(...SAVINGS_OWNERS), { nil: null }),
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
        districtIds: fc.subarray(DISTRICT_IDS),
        regions: regionPicksArb,
        areaBands: fc.subarray([...AREA_BANDS]),
        tenure: fc.constantFrom("sale" as const, "rent" as const, "both" as const),
        lowFloor: fc.boolean(),
      }),
    })
    .map((r): HouseholdProfile => {
      const couple = r.spouse !== null;
      const householdType = couple ? "couple" : r.otherType ? "other" : "single";
      return {
        schemaVersion: 3,
        householdKind: "senior",
        self: { birthDate: r.selfBirth },
        spouse: r.spouse,
        householdType,
        householdSize: couple ? Math.max(2, r.otherSize) : householdType === "single" ? 1 : r.otherSize,
        householdHead: r.householdHead,
        residence: r.residence,
        housing: r.housing,
        // 명의는 통장이 있을 때만, 배우자가 없으면 "나"만 (validateProfile 규칙)
        savings: { ...r.savings, owner: r.savings.has !== true ? null : couple || r.savings.owner === null ? r.savings.owner : "self" },
        money: r.money,
        welfare: r.welfare,
        newlywed: null,
        // 관심 지역은 지구 + 시군구 1곳 이상
        prefs: r.prefs.districtIds.length + r.prefs.regions.length === 0 ? { ...r.prefs, districtIds: [DISTRICT_IDS[0]!] } : r.prefs,
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
  regions: fc.array(noticeRegionArb, { maxLength: 3 }),
  units: fc.array(unitArb, { maxLength: 4 }),
});

/** 실제 2026 표 + 임의로 일부를 뺀 표 (기준표 없음 경로 포함) */
export const incomeThresholdsArb: fc.Arbitrary<IncomeThreshold[]> = fc.oneof<fc.Arbitrary<IncomeThreshold[]>[]>(
  fc.constant([...INCOME_THRESHOLDS]),
  fc.subarray([...INCOME_THRESHOLDS]),
);

// ---------- 변경 3: 신혼 가구 ----------

const savingsInfoArb = (owner: "self" | "spouse") =>
  fc
    .record({
      has: fc.option(fc.boolean(), { nil: null }),
      kind: fc.option(fc.constantFrom(...SAVINGS_KINDS), { nil: null }),
      months: fc.option(fc.integer({ min: 0, max: 300 }), { nil: null }),
      paymentCount: fc.option(fc.integer({ min: 0, max: 300 }), { nil: null }),
      depositManwon: fc.option(fc.integer({ min: 0, max: 3000 }), { nil: null }),
    })
    .map((s) => ({ ...s, owner: s.has === true ? owner : null }));

export const newlywedInfoArb = fc.record({
  marriage: fc.constantFrom("engaged" as const, "married" as const, null),
  marriageDate: fc.option(dateBetween("2015-01-01", "2027-12-31"), { nil: null }),
  children: fc.option(fc.integer({ min: 0, max: 4 }), { nil: null }),
  neverOwnedHome: fc.option(fc.boolean(), { nil: null }),
  incomeTax5y: fc.option(fc.boolean(), { nil: null }),
  spouseSavings: fc.option(savingsInfoArb("spouse"), { nil: null }),
});

/** 신혼 가구 프로필: 배우자 있음, 본인 통장은 본인 명의, 월소득 = 본인 + 배우자 (BR-U2-D3·D23) */
export const newlywedProfileArb: fc.Arbitrary<HouseholdProfile> = fc
  .tuple(profileArb({ couple: true }), newlywedInfoArb, savingsInfoArb("self"), fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null }), fc.option(fc.integer({ min: 0, max: 1000 }), { nil: null }))
  .map(([p, newlywed, savings, selfIncome, spouseIncome]) => ({
    ...p,
    householdKind: "newlywed" as const,
    savings,
    newlywed,
    money: {
      ...p.money,
      monthlyIncome: selfIncome === null || spouseIncome === null ? null : selfIncome + spouseIncome,
      spouseMonthlyIncome: spouseIncome,
      spouseEarns: spouseIncome === null ? null : spouseIncome > 0,
    },
  }));

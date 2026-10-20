// U5 속성 기반 테스트 생성기 — 일정·판정 행·주택형 판정·관심 공고 (domain-entities §7)
import { fc } from "@fast-check/vitest";
import { addDays, type IsoDate } from "@shared/domain/dates.ts";
import { APPLY_ROUTES } from "@shared/eligibility/routes.ts";
import type { CriterionResult, RouteJudgement, UnitJudgement, Verdict } from "@shared/eligibility/types.ts";
import type { FeedItem } from "../api-types";
import type { FeedRow } from "@/server/feed/types";

export const BASE_DATE = "2026-01-01";

/** 2026-01-01 ± 약 1년 */
export const isoDateArb: fc.Arbitrary<IsoDate> = fc.integer({ min: -400, max: 400 }).map((d) => addDays(BASE_DATE, d));
export const nullableDateArb = fc.option(isoDateArb, { nil: null });
export const verdictArb: fc.Arbitrary<Verdict> = fc.constantFrom("eligible", "ineligible", "unknown");
export const supplyTypeArb = fc.constantFrom("senior", "newlywed", "general", "youth", "other");

/** 접수 시작 ≤ 마감인 일정(또는 한쪽·양쪽 없음) */
export const applyPeriodArb = fc
  .tuple(nullableDateArb, fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }))
  .map(([start, len]) => ({ applyStart: start, applyEnd: start !== null && len !== null ? addDays(start, len) : null }));

// 같은 조건 줄이 자주 나오도록 몇 가지 틀에서 고른다 (묶기 속성)
const CRITERIA: CriterionResult[] = [
  { key: "age", verdict: "eligible", code: "age_ok", reason: "만 65세 이상 → 만 66세예요" },
  { key: "age", verdict: "ineligible", code: "age_no", reason: "만 65세 이상 → 아직 만 63세예요" },
  { key: "income", verdict: "unknown", code: "income_unknown", reason: "월 645만원 이하", action: "설정에서 월 소득을(를) 입력하면 정확히 알려 드려요", userValue: "monthlyIncome" },
  { key: "income", verdict: "eligible", code: "income_ok", reason: "월 645만원 이하", userValue: "monthlyIncome" },
  { key: "type", verdict: "unknown", code: "unclassified", reason: "어떤 공급 유형인지 알 수 없어요" },
];
export const criteriaArb = fc.subarray(CRITERIA);

export const unitJudgementsArb: fc.Arbitrary<UnitJudgement[]> = fc
  .uniqueArray(fc.integer({ min: 1, max: 999 }), { maxLength: 8 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) => fc.record({ unitId: fc.constant(`u${id}`), supplyType: supplyTypeArb, verdict: verdictArb, criteria: criteriaArb }))),
  )
  .map((units) => units as UnitJudgement[]);

const DISTRICTS = [
  { id: "gyosan", name: "하남 교산", sortOrder: 2 },
  { id: "wangsuk", name: "남양주 왕숙", sortOrder: 1 },
  { id: "daejang", name: "부천 대장", sortOrder: 4 },
];

export const feedRowArb = (id: string): fc.Arbitrary<FeedRow> =>
  fc
    .record({
      verdict: verdictArb,
      inDistrict: fc.boolean(),
      score: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }),
      units: unitJudgementsArb,
      period: applyPeriodArb,
      tenure: fc.constantFrom("sale" as const, "rent" as const),
      firstSeenDay: fc.integer({ min: -30, max: 0 }),
      districts: fc.subarray(DISTRICTS, { minLength: 1 }),
    })
    .map((r) => ({
      verdict: r.verdict,
      inDistrict: r.inDistrict,
      score: r.score,
      detail: { baseDate: BASE_DATE, units: r.units },
      notice: {
        id,
        title: `${id} 공고`,
        complexName: null,
        tenure: r.tenure,
        applyStart: r.period.applyStart,
        applyEnd: r.period.applyEnd,
        firstSeenAt: `${addDays(BASE_DATE, r.firstSeenDay)}T00:00:00.000Z`,
      },
      districts: r.districts,
    }));

/** 공고 ID가 서로 다른 피드 행들 */
export const feedRowsArb: fc.Arbitrary<FeedRow[]> = fc
  .uniqueArray(fc.integer({ min: 1, max: 9999 }), { maxLength: 15 })
  .chain((ids) => fc.tuple(...ids.map((n) => feedRowArb(`n${String(n).padStart(4, "0")}`))))
  .map((rows) => rows as FeedRow[]);

export const feedItemArb = (id: string): fc.Arbitrary<FeedItem> =>
  applyPeriodArb.map((p) => ({
    id,
    title: id,
    complexName: null,
    districts: [],
    regions: [],
    tenure: "rent",
    applyStart: p.applyStart,
    applyEnd: p.applyEnd,
    status: "upcoming",
    verdict: "eligible",
    score: 0,
    supplyTypes: [],
    firstSeenAt: "2026-01-01T00:00:00.000Z",
  }));

export const feedItemsArb: fc.Arbitrary<FeedItem[]> = fc
  .uniqueArray(fc.integer({ min: 1, max: 999 }), { maxLength: 15 })
  .chain((ids) => fc.tuple(...ids.map((n) => feedItemArb(`f${n}`))))
  .map((items) => items as FeedItem[]);

// ---------- 변경 3: 신혼 가구 판정 (routes) ----------

const RANK: Readonly<Record<Verdict, number>> = { eligible: 2, unknown: 1, ineligible: 0 };
const NEWLYWED_ROUTES = APPLY_ROUTES.filter((r) => r !== "own_type");

/** 신혼 가구 주택형 판정: 방법 1~4개, 주택형 판정·조건 = 가장 좋은 방법 (U2 BR-U2-D11·D12와 같은 모양) */
export const routedUnitsArb: fc.Arbitrary<UnitJudgement[]> = unitJudgementsArb.chain((units) =>
  fc
    .tuple(
      ...units.map(() =>
        fc.uniqueArray(fc.constantFrom(...NEWLYWED_ROUTES), { minLength: 1, maxLength: 4 }).chain((routes) =>
          fc.tuple(...routes.map((route) => fc.record({ route: fc.constant(route), verdict: verdictArb, criteria: criteriaArb }))),
        ),
      ),
    )
    .map((all) =>
      units.map((u, i) => {
        const routes = all[i] as RouteJudgement[];
        const best = routes.reduce((a, b) => (RANK[b.verdict] > RANK[a.verdict] ? b : a));
        return { ...u, verdict: best.verdict, criteria: best.criteria, routes };
      }),
    ),
);

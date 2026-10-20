// 속성 기반 테스트 — 판정 엔진 (business-logic-model §5, BR-U2-33, NFR-U2-11, Q1 가구 대칭성)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import type { HouseholdProfile } from "../../domain/profile.ts";
import { combineNotice, combineUnit, judgeNotice } from "../engine.ts";
import { createIncomeTable } from "../income-table.ts";
import { isVisible } from "../visibility.ts";
import { ACTION } from "../messages.ts";
import type { NoticeJudgement, Verdict } from "../types.ts";
import {
  incomeThresholdsArb,
  noticeArb,
  noticeDateArb,
  profileArb,
} from "../../__tests__/arbitraries/eligibility.ts";

const RANK: Record<Verdict, number> = { ineligible: 0, unknown: 1, eligible: 2 };
const refArb = incomeThresholdsArb.map((rows) => ({ incomeTable: createIncomeTable(rows) }));
const judge = (p: HouseholdProfile, n: Parameters<typeof judgeNotice>[1], ref: Parameters<typeof judgeNotice>[2], asOf: string) =>
  judgeNotice(p, n, ref, asOf);

/** 모든 "모름" 가능한 값을 null로 */
function allUnknown(p: HouseholdProfile): HouseholdProfile {
  return {
    ...p,
    self: { birthDate: null },
    spouse: p.spouse ? { birthDate: null } : null,
    householdHead: null,
    residence: { sido: null, sigungu: null, years: null },
    housing: { homeless: null, homelessYears: null, ownedCount: null },
    savings: { has: null, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null },
    money: { monthlyIncome: null, totalAsset: null, carValue: null, spouseEarns: null },
    welfare: null,
  };
}

/** 프로필 필드 하나를 "모름"으로 바꾸는 방법들 */
const NULLIFIERS: ((p: HouseholdProfile) => HouseholdProfile)[] = [
  (p) => ({ ...p, self: { birthDate: null } }),
  (p) => ({ ...p, spouse: p.spouse ? { birthDate: null } : null }),
  (p) => ({ ...p, householdHead: null }),
  (p) => ({ ...p, residence: { ...p.residence, sido: null } }),
  (p) => ({ ...p, housing: { ...p.housing, homeless: null } }),
  (p) => ({ ...p, housing: { ...p.housing, homelessYears: null } }),
  (p) => ({ ...p, savings: { ...p.savings, has: null } }),
  (p) => ({ ...p, savings: { ...p.savings, months: null } }),
  (p) => ({ ...p, savings: { ...p.savings, paymentCount: null } }),
  (p) => ({ ...p, savings: { ...p.savings, depositManwon: null } }),
  (p) => ({ ...p, money: { ...p.money, monthlyIncome: null } }),
  (p) => ({ ...p, money: { ...p.money, totalAsset: null } }),
  (p) => ({ ...p, money: { ...p.money, carValue: null } }),
  (p) => ({ ...p, money: { ...p.money, spouseEarns: null } }),
  (p) => ({ ...p, welfare: null }),
];

/** 공고·주택형·조건별 판정을 모두 펼친다 (조건 목록은 프로필 값과 무관하게 같은 순서) */
function allVerdicts(j: NoticeJudgement): Verdict[] {
  return [j.verdict, ...j.units.flatMap((u) => [u.verdict, ...u.criteria.map((c) => c.verdict)])];
}

// ---------- 놓치지 않기 (BR-U2-33) ----------
test.prop([profileArb(), noticeArb, refArb, noticeDateArb])(
  "모든 값이 '모름'인 프로필은 어떤 조건에서도 미충족이 나오지 않는다",
  (p, notice, ref, asOf) => {
    const j = judge(allUnknown(p), notice, ref, asOf);
    for (const unit of j.units) {
      // 변경 3: 신혼·생애최초 전용 물량은 값과 상관없이 노부부 대상이 아니다 (BR-U2-D51) — 모르는 값 때문이 아니므로 뺀다
      if (unit.criteria.some((c) => c.code === "type_newlywed_only")) continue;
      for (const c of unit.criteria) expect(c.verdict).not.toBe("ineligible");
    }
  },
);

test.prop([profileArb(), noticeArb, refArb, noticeDateArb])(
  "조건이 'unknown'이면 그 조건 판정은 미충족이 아니다",
  (p, notice, ref, asOf) => {
    const j = judge(p, notice, ref, asOf);
    notice.units.forEach((unit, i) => {
      for (const c of j.units[i]!.criteria) {
        const req = (unit.requirements as Record<string, unknown>)[c.key];
        if (req === "unknown") expect(c.verdict).toBe("unknown");
      }
    });
  },
);

test.prop([profileArb(), noticeArb, refArb, noticeDateArb, fc.integer({ min: 0, max: NULLIFIERS.length - 1 })])(
  "정보를 하나 지우면 충족은 {충족, 확인 필요}로, 미충족은 {미충족, 확인 필요}로만 바뀐다",
  (p, notice, ref, asOf, which) => {
    const before = allVerdicts(judge(p, notice, ref, asOf));
    const after = allVerdicts(judge(NULLIFIERS[which]!(p), notice, ref, asOf));
    before.forEach((v, i) => {
      if (v === "eligible") expect(["eligible", "unknown"]).toContain(after[i]);
      if (v === "ineligible") expect(["ineligible", "unknown"]).toContain(after[i]);
    });
  },
);

// ---------- 단조성 ----------
test.prop([
  profileArb({ nullable: false }),
  noticeArb,
  refArb,
  noticeDateArb,
  fc.constantFrom("monthlyIncome" as const, "totalAsset" as const, "carValue" as const),
  fc.integer({ min: 1, max: 5000 }),
])("금액만 늘리면 판정이 좋아지지 않는다", (p, notice, ref, asOf, field, delta) => {
  const richer = { ...p, money: { ...p.money, [field]: (p.money[field] ?? 0) + delta } };
  const before = allVerdicts(judge(p, notice, ref, asOf));
  const after = allVerdicts(judge(richer, notice, ref, asOf));
  before.forEach((v, i) => expect(RANK[after[i]!]).toBeLessThanOrEqual(RANK[v]));
});

test.prop([profileArb({ nullable: false }), noticeArb, refArb, noticeDateArb, fc.integer({ min: 1, max: 20 })])(
  "두 분 모두 더 나이 들면(출생 연도를 앞당기면) 판정이 나빠지지 않는다",
  (p, notice, ref, asOf, years) => {
    // 2/29는 연도를 옮기면 없는 날짜가 될 수 있어 먼저 2/28로 맞춘다
    const noLeapDay = (d: string | null) => (d === null ? null : d.replace("-02-29", "-02-28"));
    const yearsEarlier = (d: string | null) => (d === null ? null : `${Number(d.slice(0, 4)) - years}${d.slice(4)}`);
    const withBirths = (f: (d: string | null) => string | null, q: HouseholdProfile): HouseholdProfile => ({
      ...q,
      self: { birthDate: f(q.self.birthDate) },
      spouse: q.spouse ? { birthDate: f(q.spouse.birthDate) } : null,
    });
    const base = withBirths(noLeapDay, p);
    const older = withBirths(yearsEarlier, base);
    const before = allVerdicts(judge(base, notice, ref, asOf));
    const after = allVerdicts(judge(older, notice, ref, asOf));
    before.forEach((v, i) => expect(RANK[after[i]!]).toBeGreaterThanOrEqual(RANK[v]));
  },
);

// ---------- 가구 대칭성 (Q1=A, 페르소나 P2) ----------
test.prop([profileArb({ couple: true }), noticeArb, refArb, noticeDateArb])(
  "본인·배우자와 세대주를 맞바꿔도 판정이 같다 (아버지·어머니 기기 같은 결과)",
  (p, notice, ref, asOf) => {
    const swapHead = { self: "spouse", spouse: "self", other: "other" } as const;
    const swapped: HouseholdProfile = {
      ...p,
      self: { birthDate: p.spouse!.birthDate },
      spouse: { birthDate: p.self.birthDate },
      householdHead: p.householdHead === null ? null : swapHead[p.householdHead],
    };
    expect(judge(swapped, notice, ref, asOf)).toEqual(judge(p, notice, ref, asOf));
  },
);

// ---------- 합성·노출 ----------
const verdictsArb = fc.array(fc.constantFrom<Verdict>("eligible", "unknown", "ineligible"), { maxLength: 8 });

test.prop([verdictsArb, fc.array(fc.nat(), { maxLength: 8 })])("합성은 입력 순서와 무관", (vs, keys) => {
  const shuffled = vs.map((v, i) => ({ v, k: keys[i] ?? i })).sort((a, b) => a.k - b.k).map((x) => x.v);
  expect(combineUnit(shuffled)).toBe(combineUnit(vs));
  expect(combineNotice(shuffled)).toBe(combineNotice(vs));
});

test.prop([verdictsArb])("합성 오라클: 공고 = 최고 순위, 주택형 = 최저 순위", (vs) => {
  const byRank = [...vs].sort((a, b) => RANK[a] - RANK[b]);
  expect(combineNotice(vs)).toBe(vs.length === 0 ? "unknown" : byRank[byRank.length - 1]);
  expect(combineUnit(vs)).toBe(vs.length === 0 ? "eligible" : byRank[0]);
});

test.prop([
  fc.constantFrom<Verdict>("eligible", "unknown", "ineligible"),
  fc.boolean(),
  fc.constantFrom("upcoming" as const, "open" as const, "closed" as const),
])("노출 오라클 (K5)", (verdict, inDistrict, status) => {
  expect(isVisible({ verdict, inDistrict, status })).toBe(verdict !== "ineligible" && inDistrict && status !== "closed");
});

// ---------- 사유에 내 금액 없음 (NFR-U2-11) ----------
const ALLOWED_ACTIONS = new Set<string>([
  ACTION.checkNotice,
  ACTION.tableMissing,
  ACTION.areaDependent,
  ACTION.otherPriority,
]);

test.prop([
  profileArb(),
  noticeArb,
  refArb,
  noticeDateArb,
  fc.record({
    monthlyIncome: fc.integer({ min: 0, max: 2000 }),
    totalAsset: fc.integer({ min: 0, max: 100_000 }),
    carValue: fc.integer({ min: 0, max: 10_000 }),
  }),
])("사유 문구는 내 금액에 따라 달라지지 않고, 행동 문구에 금액이 없다", (p, notice, ref, asOf, other) => {
  const a = judge(p, notice, ref, asOf);
  const b = judge({ ...p, money: { ...p.money, ...other } }, notice, ref, asOf);
  const reasons = (j: NoticeJudgement) => j.units.map((u) => u.criteria.map((c) => `${c.key}:${c.reason}`));
  // 금액이 null이 아니던 조건끼리 비교 (null → 값은 판정 가능 여부 자체가 바뀌므로 제외)
  if (p.money.monthlyIncome !== null && p.money.totalAsset !== null && p.money.carValue !== null) {
    expect(reasons(b)).toEqual(reasons(a));
  }
  for (const j of [a, b]) {
    for (const c of j.units.flatMap((u) => u.criteria)) {
      if (c.action !== undefined && !ALLOWED_ACTIONS.has(c.action)) expect(c.action).not.toMatch(/\d/);
    }
  }
});

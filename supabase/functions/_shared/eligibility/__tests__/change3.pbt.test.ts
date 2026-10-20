// 속성 기반 테스트 — 변경 요청 3 (business-logic-model §7.2, P-C3-1~6)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { noticeArb, noticeDateArb, newlywedProfileArb, profileArb } from "../../__tests__/arbitraries/eligibility.ts";
import { REFERENCE_2026 } from "../../__tests__/fixtures.ts";
import { validateProfile } from "../../domain/profile.ts";
import { migrateProfile } from "../../domain/profile-migrate.ts";
import { combineUnit, judgeNotice, judgeUnit } from "../engine.ts";
import { judgeNotice as legacyJudgeNotice } from "./legacy/engine.ts";
import type { UnitForJudgement, Verdict } from "../types.ts";

const NEW_IN_CHANGE_3 = new Set(["newlywed_hope_town", "newlywed_special_supply", "first_time_supply", "rental_newlywed_supply"]);
const RANK: Record<Verdict, number> = { ineligible: 0, unknown: 1, eligible: 2 };
const asOfArb = noticeDateArb;

test.prop([profileArb({ nullable: true }), noticeArb, asOfArb])(
  "P-C3-1 노부부 불변: 노부부 가구 판정 = 변경 3 전 엔진 판정 (주택형·조건·사유·점수·저장 형식)",
  (profile, raw, asOf) => {
    // BR-U2-D53: 변경 3 전에 있던 공급유형만 (새 신혼 물량 줄은 노부부에게 미충족이 바뀐 동작)
    const notice = { ...raw, units: raw.units.filter((u) => !NEW_IN_CHANGE_3.has(u.supplyType)) };
    expect(judgeNotice(profile, notice, REFERENCE_2026, asOf)).toEqual(legacyJudgeNotice(profile, notice, REFERENCE_2026, asOf));
  },
);

test.prop([profileArb({ nullable: true }), fc.constantFrom(1, 2)])("P-C3-2 v1·v2 → v3 옮기기 멱등, 결과는 v3 검증 통과·노부부", (p, version) => {
  const old: Record<string, unknown> = { ...p, schemaVersion: version };
  delete old.householdKind;
  delete old.newlywed;
  if (version === 1) {
    const prefs = { ...(old.prefs as Record<string, unknown>) };
    delete prefs.regions;
    old.prefs = prefs;
    old.savings = { ...(old.savings as Record<string, unknown>) };
    delete (old.savings as Record<string, unknown>).owner;
    if ((prefs.districtIds as unknown[]).length === 0) return; // v1은 지구 1곳 이상
  }
  const once = migrateProfile(old);
  expect(migrateProfile(once)).toEqual(once);
  const checked = validateProfile(once);
  expect(checked.ok).toBe(true);
  if (checked.ok) expect(checked.value).toMatchObject({ schemaVersion: 3, householdKind: "senior", newlywed: null });
});

test.prop([newlywedProfileArb, noticeArb, asOfArb])("P-C3-3 신혼 가구: 주택형 판정 = 신청 방법 판정 중 최선, 대표 조건 = 그 방법의 조건", (p, notice, asOf) => {
  for (const u of judgeNotice(p, notice, REFERENCE_2026, asOf).units) {
    expect(u.routes).toBeDefined();
    if (u.routes!.length === 0) {
      expect(u.verdict).toBe("ineligible");
      continue;
    }
    const best = Math.max(...u.routes!.map((r) => RANK[r.verdict]));
    expect(RANK[u.verdict]).toBe(best);
    const first = u.routes!.find((r) => RANK[r.verdict] === best)!;
    expect(u.criteria).toEqual(first.criteria);
    for (const r of u.routes!) expect(r.verdict).toBe(combineUnit(r.criteria.map((c) => c.verdict)));
  }
});

const unitOf = (notice: { units: UnitForJudgement[] }) => notice.units;

test.prop([newlywedProfileArb, noticeArb, asOfArb, fc.integer({ min: 1, max: 300 })])(
  "P-C3-4 소득을 낮추면 소득 조건이 나빠지지 않는다",
  (p, notice, asOf, drop) => {
    if (p.money.monthlyIncome === null) return;
    const lower = { ...p, money: { ...p.money, monthlyIncome: Math.max(0, p.money.monthlyIncome - drop) } };
    for (const unit of unitOf(notice)) {
      const a = judgeUnit(p, unit, REFERENCE_2026, asOf);
      const b = judgeUnit(lower, unit, REFERENCE_2026, asOf);
      a.routes!.forEach((ra, i) => {
        const ia = ra.criteria.find((c) => c.key === "income");
        const ib = b.routes![i]!.criteria.find((c) => c.key === "income");
        if (ia && ib) expect(RANK[ib.verdict]).toBeGreaterThanOrEqual(RANK[ia.verdict]);
      });
    }
  },
);

test.prop([newlywedProfileArb, noticeArb, asOfArb])("P-C3-5 배우자 통장을 더하면 통장 조건이 나빠지지 않는다", (p, notice, asOf) => {
  const without = { ...p, newlywed: { ...p.newlywed!, spouseSavings: null } };
  for (const unit of unitOf(notice)) {
    const a = judgeUnit(without, unit, REFERENCE_2026, asOf);
    const b = judgeUnit(p, unit, REFERENCE_2026, asOf);
    a.routes!.forEach((ra, i) => {
      const sa = ra.criteria.find((c) => c.key === "savings");
      const sb = b.routes![i]!.criteria.find((c) => c.key === "savings");
      if (sa && sb) expect(RANK[sb.verdict]).toBeGreaterThanOrEqual(RANK[sa.verdict]);
    });
  }
});

test.prop([newlywedProfileArb, noticeArb, asOfArb, fc.integer({ min: 1, max: 2000 })])(
  "P-C3-6 혼인신고일이 늦을수록(기간이 짧을수록) 혼인 조건이 나빠지지 않는다",
  (p, notice, asOf, days) => {
    const n = p.newlywed!;
    if (n.marriage !== "married" || n.marriageDate === null) return;
    const later = new Date(Date.parse(n.marriageDate) + days * 86_400_000).toISOString().slice(0, 10);
    const q = { ...p, newlywed: { ...n, marriageDate: later } };
    for (const unit of unitOf(notice)) {
      const a = judgeUnit(p, unit, REFERENCE_2026, asOf);
      const b = judgeUnit(q, unit, REFERENCE_2026, asOf);
      a.routes!.forEach((ra, i) => {
        const ma = ra.criteria.find((c) => c.key === "marriage");
        const mb = b.routes![i]!.criteria.find((c) => c.key === "marriage");
        if (ma && mb) expect(RANK[mb.verdict]).toBeGreaterThanOrEqual(RANK[ma.verdict]);
      });
    }
  },
);

test.prop([newlywedProfileArb])("생성기 점검: 신혼 가구 프로필은 v3 검증을 통과한다", (p) => {
  expect(validateProfile(p).ok).toBe(true);
});

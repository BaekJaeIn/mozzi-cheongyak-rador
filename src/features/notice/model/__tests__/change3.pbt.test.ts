// 속성 기반 테스트 — U5 변경 3 (domain-entities §9.3, P-U5-D1~D4)
import { fc, test } from "@fast-check/vitest";
import { APPLY_ROUTES } from "@shared/eligibility/routes.ts";
import { routeHintOf } from "@shared/feed/visible.ts";
import { expect } from "vitest";
import type { UnitInfo } from "../api-types";
import { groupJudgement, summarySection } from "../judgement";
import { groupJudgement as legacyGroupJudgement } from "./legacy/judgement";
import { routedUnitsArb, unitJudgementsArb } from "./arbitraries";

const RANK = { eligible: 0, unknown: 1, ineligible: 2 } as const;
const infoOf = (ids: string[]): UnitInfo[] =>
  ids.map((id, i) => ({ id, label: null, supplyType: "x", plain: "유형", formal: "유형", exclusiveAreaM2: 40 + i, supplyCount: null }));

test.prop([unitJudgementsArb])("P-U5-D1 노부부 불변: routes 없는 판정은 묶음·순서·조건이 변경 3 전과 같고, 카드 한 줄이 없다", (units) => {
  const info = infoOf(units.map((u) => u.unitId));
  const now = groupJudgement(units, info);
  for (const g of now) expect(g.routes).toEqual([]);
  expect(legacyGroupJudgement(units, info).map((g) => ({ ...g, routes: [] }))).toEqual(now);
  expect(routeHintOf(units)).toBeUndefined();
});

test.prop([routedUnitsArb])("P-U5-D2 카드 방법은 보이는 주택형의 그 판정 방법이고, 충족이 있으면 충족 방법만", (units) => {
  const hint = routeHintOf(units);
  const visible = units.filter((u) => u.verdict !== "ineligible").flatMap((u) => u.routes!);
  if (visible.every((r) => r.verdict === "ineligible")) {
    expect(hint).toBeUndefined();
    return;
  }
  const hasEligible = visible.some((r) => r.verdict === "eligible");
  expect(hint!.verdict).toBe(hasEligible ? "eligible" : "unknown");
  for (const r of hint!.routes) expect(visible.some((v) => v.route === r && v.verdict === hint!.verdict)).toBe(true);
  expect(hint!.routes).toEqual(APPLY_ROUTES.filter((r) => hint!.routes.includes(r))); // 표 순서, 중복 없음
});

test.prop([routedUnitsArb])("P-U5-D3 묶음의 첫 방법 판정 = 묶음 판정, 방법은 판정 순서", (units) => {
  for (const g of groupJudgement(units, infoOf(units.map((u) => u.unitId)))) {
    expect(g.routes[0]!.verdict).toBe(g.verdict);
    const ranks = g.routes.map((r) => RANK[r.verdict]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  }
});

test.prop([fc.string({ minLength: 1 }), fc.option(fc.string({ minLength: 1 }), { nil: undefined })])("P-U5-D4 볼 점 절은 가구 종류 것만", (senior, newlywed) => {
  const s = { forSeniorCouple: `노:${senior}`, ...(newlywed !== undefined ? { forNewlywed: `신:${newlywed}` } : {}) };
  expect(summarySection(s, "newlywed").text?.startsWith("노:") ?? false).toBe(false);
  expect(summarySection(s, "senior").text!.startsWith("신:")).toBe(false);
});

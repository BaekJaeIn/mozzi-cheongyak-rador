// 속성 기반 테스트 — U4 변경 2 (domain-entities §7.6, P-U4-C1~C7)
import { fc, test } from "@fast-check/vitest";
import { isValidRegionPicks, normalizeRegionPicks, validateProfile } from "@shared/domain/profile.ts";
import { parseProfile } from "@shared/domain/profile-migrate.ts";
import { expect } from "vitest";
import { fromProfile, mergeUpdate, toProfile } from "../convert";
import { toggleRegion } from "../regions";
import { canProceed, hasSpouse, isComplete, pruneHidden } from "../steps";
import { migrateDraft } from "../storage";
import type { WizardAnswers } from "../types";
import { initialUpdates, resolveItems, type StoredUpdates, UPDATE_ITEMS, type UpdateItem } from "../updates";
import { answersArb, regionsArb, regionTapArb } from "./arbitraries";

const itemsArb = fc.subarray([...UPDATE_ITEMS]);

test.prop([answersArb])("P-U4-C1 통장 명의·다른 지역이 든 모든 답에서 프로필 검증 통과 (변경 3부터 v3)", (a) => {
  const p = toProfile(a);
  expect(validateProfile(p).ok).toBe(true);
  expect(p.schemaVersion).toBe(3);
});

test.prop([answersArb])("P-U4-C2 프로필 → 답 → 프로필 왕복 (명의·다른 지역 포함)", (a) => {
  const p = toProfile(a);
  expect(toProfile(fromProfile(p))).toEqual(p);
});

test.prop([answersArb, fc.constantFrom(true, false, "unknown" as const), fc.oneof(fc.constantFrom("savingsHas", "income"), fc.string({ maxLength: 12 }))])(
  "P-U4-C3 버전 1 초안 옮기기는 멱등이고, 옮긴 초안은 버전 2 형식",
  (a, has, stepId) => {
    const rest: Record<string, unknown> = { ...a };
    delete rest.savingsOwner;
    delete rest.regions;
    const v1 = { version: 1, answers: { ...rest, savingsHas: has }, stepId, updatedAt: "2026-10-01T00:00:00Z" };
    const once = migrateDraft(v1);
    if (once === null) return; // 모르는 화면 ID는 버린다
    expect(once.version).toBe(2);
    expect("savingsHas" in once.answers).toBe(false);
    expect(migrateDraft(once)).toEqual(once);
  },
);

test.prop([answersArb, fc.integer({ min: 1, max: 2 }), fc.array(itemsArb, { maxLength: 5 })])(
  "P-U4-C4 처음 기록은 같은 입력에 같고, 입력할수록 pending은 줄기만 한다",
  (a, storedSchemaVersion, steps) => {
    const r = parseProfile(toProfile(a));
    if (!r.ok) throw new Error("검증 실패");
    const stored = { profile: r.value, storedSchemaVersion };
    expect(initialUpdates(stored)).toEqual(initialUpdates(stored));
    let u: StoredUpdates = initialUpdates(stored);
    for (const items of steps) {
      const next = resolveItems(u, items);
      expect(next.pending.every((i) => u.pending.includes(i))).toBe(true);
      expect(next.noticeSeen).toBe(u.noticeSeen);
      u = next;
    }
  },
);

test.prop([answersArb, answersArb, itemsArb])("P-U4-C5 짧은 입력 화면 저장은 새 항목 밖의 값을 바꾸지 않는다", (a, b, pending) => {
  const current = fromProfile(toProfile(a));
  const before = toProfile(current);
  const merged = mergeUpdate(current, fromProfile(toProfile(b)), pending as UpdateItem[]);
  if (!isComplete(merged)) {
    // 3기 신도시 0곳인데 다른 지역을 모두 뺀 경우: 화면이 [저장]을 막는다 (BR-U4-C16)
    expect(canProceed("regions", merged)).toBe(false);
    return;
  }
  const after = toProfile(merged);
  expect(after.prefs.districtIds).toEqual(before.prefs.districtIds); // 3기 신도시는 그대로 (C2-D6)
  expect({ ...after, savings: null, prefs: { ...after.prefs, regions: null } }).toEqual({ ...before, savings: null, prefs: { ...before.prefs, regions: null } });
  if (!pending.includes("savings")) expect(after.savings).toEqual(before.savings);
  if (!pending.includes("regions")) expect(after.prefs.regions).toEqual(before.prefs.regions);
});

test.prop([regionsArb, fc.array(regionTapArb, { maxLength: 20 })])("P-U4-C6 어떤 누름 순서 뒤에도 다른 지역은 검증을 통과하고 정리 함수의 고정점", (start, taps) => {
  let v = start;
  for (const t of taps) {
    v = toggleRegion(v, t.sido, t.sigungu);
    expect(isValidRegionPicks(v)).toBe(true);
    expect(normalizeRegionPicks(v)).toEqual(v);
  }
});

test.prop([answersArb])("P-U4-C7 배우자가 없는 답에는 배우자·두 분 다 명의가 남지 않는다", (a) => {
  const pruned: WizardAnswers = pruneHidden(a);
  if (!hasSpouse(pruned)) expect(["spouse", "both"]).not.toContain(pruned.savingsOwner);
  const p = toProfile(a);
  if (p.spouse === null) expect(["spouse", "both"]).not.toContain(p.savings.owner);
});

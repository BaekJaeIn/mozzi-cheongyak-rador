// 속성 기반 테스트 — U4 변경 3 (domain-entities §8.6, P-U4-D1~D6)
import { fc, test } from "@fast-check/vitest";
import { validateProfile } from "@shared/domain/profile.ts";
import { expect } from "vitest";
import { fromProfile, switchKind, toProfile } from "../convert";
import { GROUP_ORDER, pruneHidden, visibleSteps } from "../steps";
import { migrateDraft } from "../storage";
import type { AnswerKey, WizardAnswers } from "../types";
import { answersArb, newlywedAnswersArb } from "./arbitraries";
import { toProfile as legacyToProfile } from "./legacy/convert";
import { visibleSteps as legacyVisibleSteps } from "./legacy/steps";

const NEWLYWED_KEYS: readonly AnswerKey[] = [
  "marriage", "marriageDate", "children", "neverOwned", "incomeTax5y",
  "spouseSavingsKind", "spouseSavingsMonthsBand", "spousePaymentCount", "spouseDepositManwon", "spouseIncome",
];
/** 가구 종류를 오가도 남아야 하는 공통 답 (domain-entities §8.4) */
const COMMON_KEYS: readonly AnswerKey[] = [
  "selfBirth", "sido", "sigungu", "residenceYearsBand", "homeOwned", "homeCount", "homelessYearsBand",
  "totalAsset", "carValue", "districtIds", "regions", "areaBands", "tenure", "lowFloor",
];
const pick = (a: WizardAnswers, keys: readonly AnswerKey[]) => Object.fromEntries(keys.filter((k) => a[k] !== undefined).map((k) => [k, a[k]]));
const scopeArb = fc.constantFrom(undefined, ...GROUP_ORDER);

test.prop([answersArb, fc.boolean(), scopeArb])("P-U4-D1 노부부 불변: 화면은 가구 종류 하나만 늘고, 저장 값은 변경 3 전과 같다", (a, withKind, scope) => {
  const senior: WizardAnswers = withKind ? { ...a, householdKind: "senior" } : a;
  const now = visibleSteps(senior, scope).map((s) => s.id);
  const before = legacyVisibleSteps(a, scope as Parameters<typeof legacyVisibleSteps>[1]).map((s) => s.id); // 노부부 그룹만 고른다
  expect(now).toEqual(scope === undefined ? ["householdKind", ...before] : before);
  expect(visibleSteps(senior, "full").map((s) => s.id)).toEqual(legacyVisibleSteps(a).map((s) => s.id));
  expect(toProfile(senior)).toEqual({ ...legacyToProfile(a), householdKind: "senior", newlywed: null });
});

test.prop([newlywedAnswersArb])("P-U4-D2 신혼 답 → 프로필 v3 검증 통과 (부부, 복지 없음)", (a) => {
  const p = toProfile(a);
  expect(validateProfile(p).ok).toBe(true);
  expect(p).toMatchObject({ householdKind: "newlywed", householdType: "couple", welfare: null });
  expect(p.spouse).not.toBeNull();
});

test.prop([newlywedAnswersArb])("P-U4-D3 신혼 프로필 → 답 → 프로필 왕복", (a) => {
  const p = toProfile(a);
  expect(toProfile(fromProfile(p))).toEqual(p);
});

test.prop([answersArb, fc.constantFrom(1, 2), fc.constantFrom("selfBirth", "income", "regions")])("P-U4-D4 옛 초안(v1·v2) 옮기기는 멱등, 옮긴 초안은 노부부", (a, version, stepId) => {
  const once = migrateDraft({ version, answers: a, stepId, updatedAt: "2026-10-01T00:00:00Z" });
  expect(once).not.toBeNull();
  expect(once!.version).toBe(3);
  expect(once!.answers.householdKind).toBe("senior");
  expect(migrateDraft(once)).toEqual(once);
});

test.prop([answersArb])("P-U4-D5 가구 종류 바꾸기: 결과는 새 종류 화면에 맞고, 노부부 → 신혼 → 노부부로 와도 공통 답은 그대로", (a) => {
  const senior = pruneHidden({ ...a, householdKind: "senior" });
  const nw = switchKind(senior, "newlywed");
  expect(pruneHidden(nw)).toEqual(nw);
  expect(validateProfile(toProfile(nw)).ok).toBe(true);
  const back = switchKind(nw, "senior");
  expect(pruneHidden(back)).toEqual(back);
  expect(validateProfile(toProfile(back)).ok).toBe(true);
  expect(pick(back, COMMON_KEYS)).toEqual(pick(senior, COMMON_KEYS));
});

test.prop([newlywedAnswersArb])("P-U4-D5 신혼 → 노부부도 화면에 맞고 검증 통과", (a) => {
  const senior = switchKind(pruneHidden(a), "senior");
  expect(pruneHidden(senior)).toEqual(senior);
  expect(validateProfile(toProfile(senior)).ok).toBe(true);
});

test.prop([answersArb, newlywedAnswersArb])("P-U4-D6 노부부 답에는 신혼 키가, 신혼 답에는 가구 구성·맞벌이 여부·복지 키가 없다", (s, n) => {
  const senior = pruneHidden({ ...s, ...pick(n, NEWLYWED_KEYS), householdKind: "senior" });
  for (const k of NEWLYWED_KEYS) expect(senior[k]).toBeUndefined();
  const nw = pruneHidden(n);
  for (const k of ["householdSize", "hasSpouse", "spouseEarns", "welfare"] as const) expect(nw[k]).toBeUndefined();
  expect(nw.householdType).toBe("couple");
});

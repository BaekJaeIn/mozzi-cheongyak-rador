// 속성 기반 테스트 — 도메인 (business-logic-model §5: 만 나이, 면적 구간, 분류, 지구 매칭, 요건 확정)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { addDays } from "../dates.ts";
import { AREA_BANDS, ageAt, areaBandOf } from "../profile.ts";
import { classifySupplyType, SUPPLY_TYPE_CODES, SUPPLY_TYPES } from "../supply-types.ts";
import { matchDistricts } from "../district-matcher.ts";
import { resolveRequirements } from "../requirement-resolver.ts";
import { REQUIREMENT_KEYS } from "../requirements.ts";
import { DISTRICTS } from "../../eligibility/reference-data.ts";
import { birthDateArb, noticeDateArb, requirementsArb } from "../../__tests__/arbitraries/eligibility.ts";

// ---------- 만 나이 ----------
test.prop([birthDateArb, noticeDateArb, fc.integer({ min: 0, max: 3000 })])(
  "기준일이 늦어지면 만 나이는 줄지 않는다",
  (birth, base, days) => {
    expect(ageAt(birth, addDays(base, days))).toBeGreaterThanOrEqual(ageAt(birth, base));
  },
);

test.prop([birthDateArb])("출생일 당일 만 나이 = 0", (birth) => {
  expect(ageAt(birth, birth)).toBe(0);
});

test.prop([birthDateArb, fc.integer({ min: 1, max: 90 })])("n년 뒤 같은 날짜 = n세 (2/29 제외)", (birth, n) => {
  fc.pre(!birth.endsWith("-02-29"));
  const later = `${Number(birth.slice(0, 4)) + n}${birth.slice(4)}`;
  expect(ageAt(birth, later)).toBe(n);
});

// ---------- 면적 구간 ----------
test.prop([fc.double({ min: 0, max: 500, noNaN: true }), fc.double({ min: 0, max: 500, noNaN: true })])(
  "모든 면적은 정확히 한 구간, 면적이 커지면 구간 순서도 같거나 커진다",
  (a, b) => {
    const [small, large] = a <= b ? [a, b] : [b, a];
    expect(AREA_BANDS).toContain(areaBandOf(small));
    expect(AREA_BANDS.indexOf(areaBandOf(small))).toBeLessThanOrEqual(AREA_BANDS.indexOf(areaBandOf(large)));
  },
);

// ---------- 분류 ----------
test.prop([fc.string({ maxLength: 60 }), fc.constantFrom(undefined, "applyhome" as const, "lh_rental" as const)])(
  "분류는 모든 입력에 대해 라벨이 있는 코드 하나 (BR-U2-19)",
  (text, source) => {
    const code = classifySupplyType({ text, source });
    expect(SUPPLY_TYPE_CODES).toContain(code);
    expect(SUPPLY_TYPES[code].plain.length).toBeGreaterThan(0);
  },
);

// ---------- 지구 매칭 ----------
const districtWords = DISTRICTS.flatMap((d) => [...d.keywords, ...d.areaKeywords, ...d.sigungu]);
const titleArb = fc
  .array(fc.oneof(fc.constantFrom(...districtWords), fc.string({ maxLength: 6 }), fc.constantFrom("행복주택", "공공분양", " ")), {
    maxLength: 6,
  })
  .map((parts) => parts.join(" "));

test.prop([titleArb, fc.string({ maxLength: 20 })])("관계없는 문장을 덧붙여도 매칭 결과가 줄지 않는다", (title, extra) => {
  const before = matchDistricts({ title }, DISTRICTS);
  const after = matchDistricts({ title: `${title}${extra}` }, DISTRICTS);
  expect(after).toEqual(expect.arrayContaining(before));
});

test.prop([titleArb, fc.array(fc.nat(), { maxLength: 5 })])("공백을 넣어도 매칭 결과가 같다", (title, positions) => {
  let spaced = title;
  for (const p of positions) {
    const i = spaced.length === 0 ? 0 : p % spaced.length;
    spaced = `${spaced.slice(0, i)} ${spaced.slice(i)}`;
  }
  expect(matchDistricts({ title: spaced }, DISTRICTS)).toEqual(matchDistricts({ title }, DISTRICTS));
});

test.prop([titleArb])("결과는 활성 지구의 부분집합, 중복 없음, sortOrder 순", (title) => {
  const ids = matchDistricts({ title }, DISTRICTS);
  const order = DISTRICTS.map((d) => d.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => order.includes(id))).toBe(true);
  expect([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(ids);
});

// ---------- 요건 확정 ----------
test.prop([requirementsArb])("resolve(S, null) = S, resolve(S, S) = S", (s) => {
  expect(resolveRequirements(s, null)).toEqual(s);
  if (!s.unclassified) expect(resolveRequirements(s, s)).toEqual(s);
});

test.prop([requirementsArb, requirementsArb])("추출이 표준 조건을 지우지 못한다 (키 보존)", (s, e) => {
  fc.pre(!s.unclassified);
  const resolved = resolveRequirements(s, e.unclassified ? null : e);
  for (const key of REQUIREMENT_KEYS) {
    if (s[key] !== undefined) expect(resolved[key]).toBeDefined();
  }
});

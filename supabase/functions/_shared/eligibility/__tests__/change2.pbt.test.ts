// 속성 기반 테스트 — 변경 요청 2 (U2 business-logic-model §6.3, P-C2-1~7)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { type HouseholdProfile, normalizeRegionPicks, validateProfile } from "../../domain/profile.ts";
import { migrateProfile, parseProfile } from "../../domain/profile-migrate.ts";
import { CAPITAL_SIGUNGU } from "../../domain/regions.ts";
import { decodeProfile, encodeProfile } from "../../security/profile-codec.ts";
import { createKeyring } from "../../security/amount-cipher.ts";
import { inInterestArea } from "../area.ts";
import { judgeNotice } from "../engine.ts";
import { createIncomeTable } from "../income-table.ts";
import { isVisible } from "../visibility.ts";
import { noticeStatus } from "../../domain/retention.ts";
import {
  DISTRICT_IDS,
  incomeThresholdsArb,
  noticeArb,
  noticeDateArb,
  noticeRegionArb,
  profileArb,
  regionPicksArb,
} from "../../__tests__/arbitraries/eligibility.ts";
import { testKey } from "../../__tests__/fixtures.ts";

const refArb = incomeThresholdsArb.map((rows) => ({ incomeTable: createIncomeTable(rows) }));

/** 버전 2 프로필 → 변경 2 전 모양(버전 1) */
function toV1(p: HouseholdProfile): unknown {
  const savings: Record<string, unknown> = { ...p.savings };
  delete savings.owner;
  const prefs: Record<string, unknown> & { districtIds: string[] } = { ...p.prefs };
  delete prefs.regions;
  return { ...p, schemaVersion: 1, savings, prefs: prefs.districtIds.length > 0 ? prefs : { ...prefs, districtIds: [DISTRICT_IDS[0]] } };
}

test.prop([profileArb()])("P-C2-1 옮기기는 멱등이고 버전 2는 그대로", (p) => {
  const once = migrateProfile(toV1(p));
  expect(migrateProfile(once)).toEqual(once);
  expect(migrateProfile(p)).toBe(p);
  expect(validateProfile(once).ok).toBe(true);
});

test.prop([profileArb(), noticeArb, refArb, noticeDateArb])("P-C2-2 옮기기 전에 보이던 공고는 옮긴 뒤에도 보인다", (p, n, ref, asOf) => {
  const v1 = toV1(p) as HouseholdProfile; // 판정 함수는 버전 칸을 보지 않는다 — 옛 값(통장 없음 포함)으로 판정
  const before = judgeNotice({ ...v1, savings: { ...v1.savings, owner: null }, prefs: { ...v1.prefs, regions: [] } } as HouseholdProfile, n, ref, asOf);
  const migrated = parseProfile(v1);
  if (!migrated.ok) throw new Error(migrated.errors.join());
  const after = judgeNotice(migrated.value, n, ref, asOf);
  const status = noticeStatus({ applyStart: n.applyStart, applyEnd: n.applyEnd }, asOf);
  if (isVisible({ verdict: before.verdict, inDistrict: before.inDistrict, status })) {
    expect(isVisible({ verdict: after.verdict, inDistrict: after.inDistrict, status })).toBe(true);
  }
});

test.prop([profileArb({ couple: true }), noticeArb, refArb, noticeDateArb, fc.constantFrom("self" as const, "spouse" as const, "both" as const)])(
  "P-C2-3 통장 값이 같으면 명의만 달라도 모든 조건 판정이 같다",
  (p, n, ref, asOf, owner) => {
    const withHas = { ...p, savings: { ...p.savings, has: true, owner: "self" as const } };
    const a = judgeNotice(withHas, n, ref, asOf);
    const b = judgeNotice({ ...withHas, savings: { ...withHas.savings, owner } }, n, ref, asOf);
    expect(b.verdict).toBe(a.verdict);
    expect(b.units.map((u) => u.criteria.map((c) => c.verdict))).toEqual(a.units.map((u) => u.criteria.map((c) => c.verdict)));
  },
);

const areaNoticeArb = fc.record({ districtIds: fc.subarray(DISTRICT_IDS), regions: fc.array(noticeRegionArb, { maxLength: 3 }) });
const areaPrefsArb = fc.record({ districtIds: fc.subarray(DISTRICT_IDS), regions: regionPicksArb });

test.prop([areaNoticeArb, areaPrefsArb, areaPrefsArb])("P-C2-4 관심 지역을 더 고르면 안이던 공고는 계속 안", (n, small, extra) => {
  const bigger = {
    districtIds: [...new Set([...small.districtIds, ...extra.districtIds])],
    regions: normalizeRegionPicks([...small.regions, ...extra.regions]),
  };
  if (inInterestArea(n, small)) expect(inInterestArea(n, bigger)).toBe(true);
});

test.prop([fc.constantFrom("서울" as const, "경기" as const, "인천" as const).chain((sido) =>
  fc.tuple(fc.constant(sido), fc.option(fc.constantFrom(...CAPITAL_SIGUNGU[sido]), { nil: null })),
)])("P-C2-5 시도 전체를 고르면 그 시도의 모든 공고 지역이 안", ([sido, sigungu]) => {
  expect(inInterestArea({ districtIds: [], regions: [{ sido, sigungu }] }, { districtIds: [], regions: [{ sido, sigungu: null }] })).toBe(true);
});

test.prop([areaNoticeArb, fc.subarray(DISTRICT_IDS)])("P-C2-6 관심 시군구가 없으면 옛 규칙(지구 교집합)과 같다", (n, districtIds) => {
  const old = n.districtIds.some((id) => districtIds.includes(id));
  expect(inInterestArea(n, { districtIds, regions: [] })).toBe(old);
});

test.prop([profileArb()], { numRuns: 30 })("P-C2-7 버전 2 프로필 저장 → 읽기 왕복", async (p) => {
  const ring = await createKeyring({ 1: testKey(7) }, 1);
  expect(await decodeProfile(await encodeProfile(p, ring), ring)).toEqual(p);
});

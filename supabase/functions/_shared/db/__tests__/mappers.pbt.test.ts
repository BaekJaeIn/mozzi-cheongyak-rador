// 속성 기반 테스트 — 도메인 ↔ 행 변환 왕복 (PBT-02)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import {
  deviceMapper,
  districtMapper,
  housingUnitMapper,
  judgementMapper,
  noticeMapper,
  pushSubscriptionMapper,
  storedProfileMapper,
} from "../mappers.ts";
import type { JsonObject } from "../types.ts";
import { deviceIdArb, instantArb, isoDateArb } from "../../__tests__/arbitraries/index.ts";

const uuidArb = fc.uuid({ version: 4 });
const textArb = fc.string({ maxLength: 30 });
const nullable = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: null });
const jsonObjectArb = fc.dictionary(fc.string({ maxLength: 8 }), fc.jsonValue({ maxDepth: 2 })) as fc.Arbitrary<JsonObject>;
const encArb = fc.stringMatching(/^v[1-9]\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{8,40}$/);

const districtArb = fc.record({
  id: fc.stringMatching(/^[a-z_]{3,12}$/),
  name: textArb,
  sido: textArb,
  sigungu: fc.array(textArb, { minLength: 1, maxLength: 3 }),
  keywords: fc.array(textArb, { minLength: 1, maxLength: 4 }),
  areaKeywords: fc.array(textArb, { maxLength: 6 }),
  active: fc.boolean(),
  sortOrder: fc.integer({ min: 0, max: 100 }),
});

const deviceArb = fc.record({
  id: deviceIdArb,
  tokenHash: fc.stringMatching(/^[0-9a-f]{64}$/),
  notifyHour: fc.integer({ min: 0, max: 23 }),
  notifyEnabled: fc.boolean(),
  createdAt: instantArb,
  lastSeenAt: instantArb,
});

const storedProfileArb = fc.record({
  deviceId: deviceIdArb,
  schemaVersion: fc.integer({ min: 1, max: 10 }),
  data: jsonObjectArb,
  encMonthlyIncome: nullable(encArb),
  encTotalAsset: nullable(encArb),
  encCarValue: nullable(encArb),
  profileVersion: fc.integer({ min: 1, max: 10_000 }),
  updatedAt: instantArb,
});

const noticeArb = fc.record({
  id: uuidArb,
  dedupKey: textArb,
  title: textArb,
  complexName: nullable(textArb),
  location: nullable(textArb),
  sido: nullable(textArb),
  sigungu: nullable(textArb),
  provider: textArb,
  primarySource: fc.constantFrom("applyhome", "lh_rental", "myhome_complex", "sh", "gh" as const),
  tenure: fc.constantFrom("sale", "rent" as const),
  announcedAt: nullable(isoDateArb),
  applyStart: nullable(isoDateArb),
  applyEnd: nullable(isoDateArb),
  resultAt: nullable(isoDateArb),
  contractStart: nullable(isoDateArb),
  contractEnd: nullable(isoDateArb),
  summary: nullable(jsonObjectArb),
  summaryStatus: fc.constantFrom("pending", "done", "failed" as const),
  firstSeenAt: instantArb,
  updatedAt: instantArb,
});

const housingUnitArb = fc.record({
  id: uuidArb,
  noticeId: uuidArb,
  label: nullable(textArb),
  supplyType: fc.stringMatching(/^[a-z_]{3,20}$/),
  exclusiveAreaM2: nullable(fc.double({ min: 0, max: 300, noNaN: true, noDefaultInfinity: true })),
  supplyCount: nullable(fc.integer({ min: 0, max: 5000 })),
  standardRequirements: nullable(jsonObjectArb),
  extractedRequirements: nullable(jsonObjectArb),
  requirements: jsonObjectArb,
});

const pushSubscriptionArb = fc.record({
  endpoint: fc.webUrl(),
  deviceId: deviceIdArb,
  p256dh: fc.stringMatching(/^[A-Za-z0-9_-]{20,90}$/),
  auth: fc.stringMatching(/^[A-Za-z0-9_-]{16,24}$/),
  createdAt: instantArb,
  lastSuccessAt: nullable(instantArb),
});

const judgementArb = fc.record({
  deviceId: deviceIdArb,
  noticeId: uuidArb,
  verdict: fc.constantFrom("eligible", "ineligible", "unknown" as const),
  inDistrict: fc.boolean(),
  score: nullable(fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true })),
  detail: jsonObjectArb,
  profileVersion: fc.integer({ min: 1, max: 10_000 }),
  computedAt: instantArb,
});

test.prop([districtArb])("District 왕복", (x) => {
  expect(districtMapper.fromRow(districtMapper.toRow(x))).toEqual(x);
});
test.prop([deviceArb])("Device 왕복", (x) => {
  expect(deviceMapper.fromRow(deviceMapper.toRow(x))).toEqual(x);
});
test.prop([storedProfileArb])("StoredProfile 왕복", (x) => {
  expect(storedProfileMapper.fromRow(storedProfileMapper.toRow(x))).toEqual(x);
});
test.prop([noticeArb])("Notice 왕복", (x) => {
  expect(noticeMapper.fromRow(noticeMapper.toRow(x))).toEqual(x);
});
test.prop([housingUnitArb])("HousingUnit 왕복", (x) => {
  expect(housingUnitMapper.fromRow(housingUnitMapper.toRow(x))).toEqual(x);
});
test.prop([pushSubscriptionArb])("PushSubscription 왕복", (x) => {
  expect(pushSubscriptionMapper.fromRow(pushSubscriptionMapper.toRow(x))).toEqual(x);
});
test.prop([judgementArb])("Judgement 왕복", (x) => {
  expect(judgementMapper.fromRow(judgementMapper.toRow(x))).toEqual(x);
});

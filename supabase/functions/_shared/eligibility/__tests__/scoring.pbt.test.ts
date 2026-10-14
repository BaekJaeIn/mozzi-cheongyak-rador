// 속성 기반 테스트 — 점수 범위, 정렬 전순서 (BR-U2-64·65)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { compareFeedItems, type FeedSortItem, score } from "../scoring.ts";
import { noticeArb, noticeDateArb, profileArb } from "../../__tests__/arbitraries/eligibility.ts";

test.prop([noticeArb, profileArb()])("0 ≤ score ≤ 2, 정수", (notice, p) => {
  const s = score(notice, p.prefs);
  expect(Number.isInteger(s)).toBe(true);
  expect(s).toBeGreaterThanOrEqual(0);
  expect(s).toBeLessThanOrEqual(2);
});

const feedItemArb: fc.Arbitrary<FeedSortItem> = fc.record({
  noticeId: fc.uuid({ version: 4 }),
  status: fc.constantFrom("open" as const, "upcoming" as const),
  score: fc.integer({ min: 0, max: 2 }),
  applyEnd: fc.option(noticeDateArb, { nil: null }),
  verdict: fc.constantFrom("eligible" as const, "unknown" as const),
  firstSeenAt: fc.date({ min: new Date("2025-01-01"), max: new Date("2027-12-31"), noInvalidDate: true }).map((d) => d.toISOString()),
});

test.prop([fc.uniqueArray(feedItemArb, { selector: (i) => i.noticeId, maxLength: 20 }), fc.array(fc.nat(), { maxLength: 20 })])(
  "입력 순서와 상관없이 정렬 결과가 같다 (전순서)",
  (items, keys) => {
    const shuffled = items.map((item, i) => ({ item, k: keys[i] ?? i })).sort((a, b) => a.k - b.k).map((x) => x.item);
    expect([...shuffled].sort(compareFeedItems)).toEqual([...items].sort(compareFeedItems));
  },
);

test.prop([feedItemArb, feedItemArb])("비교는 반대칭: compare(a,b)와 compare(b,a)는 부호가 반대", (a, b) => {
  fc.pre(a.noticeId !== b.noticeId);
  expect(Math.sign(compareFeedItems(a, b))).toBe(-Math.sign(compareFeedItems(b, a)));
});

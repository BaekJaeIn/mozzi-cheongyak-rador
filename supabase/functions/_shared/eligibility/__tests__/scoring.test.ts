// 예시 기반 테스트 — 금액 표기, 점수, 정렬, 노출, 합성
import { describe, expect, it } from "vitest";
import { combineNotice, combineUnit } from "../engine.ts";
import { formatManwon, formatWon } from "../messages.ts";
import { compareFeedItems, type FeedSortItem, score } from "../scoring.ts";
import { isVisible } from "../visibility.ts";
import { makeUnit } from "../../__tests__/fixtures.ts";

describe("금액 표기", () => {
  it("원", () => {
    expect(formatWon(6_452_897)).toBe("645만 2,897원");
    expect(formatWon(3_000_000)).toBe("300만원");
    expect(formatWon(9_500)).toBe("9,500원");
  });
  it("만원", () => {
    expect(formatManwon(34_500)).toBe("3억 4,500만원");
    expect(formatManwon(40_000)).toBe("4억원");
    expect(formatManwon(4_542)).toBe("4,542만원");
  });
});

describe("score (BR-U2-61~64)", () => {
  const prefs = { districtIds: ["gyosan"], regions: [], areaBands: ["s" as const], tenure: "rent" as const, lowFloor: true };
  it("면적·분양/임대 모두 맞으면 2", () => {
    expect(score({ tenure: "rent", units: [makeUnit("happy_senior", 55)] }, prefs)).toBe(2);
  });
  it("면적을 모르는 주택형은 면적 일치로 치지 않는다", () => {
    expect(score({ tenure: "sale", units: [makeUnit("happy_senior", null)] }, prefs)).toBe(0);
  });
  it("관심 면적이 없으면 면적은 항상 일치", () => {
    expect(score({ tenure: "sale", units: [] }, { ...prefs, areaBands: [] })).toBe(1);
  });
});

describe("compareFeedItems (BR-U2-65, Q6=B)", () => {
  const item = (o: Partial<FeedSortItem>): FeedSortItem => ({
    noticeId: "a",
    status: "open",
    score: 1,
    applyEnd: "2026-10-30",
    verdict: "eligible",
    firstSeenAt: "2026-10-01T00:00:00.000Z",
    ...o,
  });
  it("접수 중 → 점수 → 마감 임박 → 충족 → 최근 순", () => {
    const items = [
      item({ noticeId: "upcoming", status: "upcoming", score: 2 }),
      item({ noticeId: "low-score", score: 0, applyEnd: "2026-10-15" }),
      item({ noticeId: "late", applyEnd: "2026-11-30" }),
      item({ noticeId: "no-end", applyEnd: null }),
      item({ noticeId: "unknown", verdict: "unknown" }),
      item({ noticeId: "best", score: 2 }),
    ];
    // 접수 중 그룹: 점수 2(best) → 점수 1은 마감일 순(10-30 unknown, 11-30 late, 없음 no-end) → 점수 0 → 접수 예정
    expect(items.sort(compareFeedItems).map((i) => i.noticeId)).toEqual([
      "best",
      "unknown",
      "late",
      "no-end",
      "low-score",
      "upcoming",
    ]);
  });
});

describe("합성·노출", () => {
  it("combineUnit / combineNotice", () => {
    expect(combineUnit([])).toBe("eligible");
    expect(combineUnit(["eligible", "unknown"])).toBe("unknown");
    expect(combineUnit(["unknown", "ineligible"])).toBe("ineligible");
    expect(combineNotice([])).toBe("unknown");
    expect(combineNotice(["ineligible", "eligible"])).toBe("eligible");
    expect(combineNotice(["ineligible", "unknown"])).toBe("unknown");
  });
  it("isVisible (K5)", () => {
    expect(isVisible({ verdict: "unknown", inDistrict: true, status: "upcoming" })).toBe(true);
    expect(isVisible({ verdict: "ineligible", inDistrict: true, status: "open" })).toBe(false);
    expect(isVisible({ verdict: "eligible", inDistrict: false, status: "open" })).toBe(false);
    expect(isVisible({ verdict: "eligible", inDistrict: true, status: "closed" })).toBe(false);
  });
});

// 공고 위치 표시 예시 (U5 변경 2, business-logic-model §11.1, BR-U5-C1~C8)
import { describe, expect, it } from "vitest";
import { buildFeed, type FeedRow } from "../visible.ts";
import { orderRegions, placeNames, placeNeedsCheck, regionName, summaryView } from "../place.ts";

const GANGSEO = { sido: "서울" as const, sigungu: "강서구" };
const MAPO = { sido: "서울" as const, sigungu: "마포구" };
const GOYANG = { sido: "경기" as const, sigungu: "고양시" };
const SEOUL = { sido: "서울" as const, sigungu: null };

describe("위치 이름 (BR-U5-C1~C4)", () => {
  it("지구 공고는 지구 이름, 지구가 없으면 '서울 강서구', 시도까지만이면 '서울'", () => {
    expect(placeNames(["하남 교산"], [{ sido: "경기", sigungu: "하남시" }])).toEqual(["하남 교산"]);
    expect(placeNames([], [GANGSEO])).toEqual(["서울 강서구"]);
    expect(placeNames([], [SEOUL])).toEqual(["서울"]);
    expect(placeNames([], [])).toEqual([]);
    expect(regionName(GOYANG)).toBe("경기 고양시");
  });

  it("상세 확인 안내는 지구가 없고 시도까지만인 지역이 있을 때만", () => {
    expect(placeNeedsCheck([], [SEOUL])).toBe(true);
    expect(placeNeedsCheck([], [GANGSEO])).toBe(false);
    expect(placeNeedsCheck(["하남 교산"], [SEOUL])).toBe(false);
  });

  it("통합 공고: 관심 지역(강서구) 먼저, 그다음 공용 목록 순서", () => {
    expect(orderRegions([GOYANG, MAPO, GANGSEO], [GANGSEO])).toEqual([GANGSEO, MAPO, GOYANG]);
    expect(orderRegions([GOYANG, GANGSEO, MAPO], [])).toEqual([GANGSEO, MAPO, GOYANG]); // 강서구가 마포구보다 목록 앞
    expect(orderRegions([GOYANG, SEOUL], [{ sido: "서울", sigungu: "마포구" }])).toEqual([SEOUL, GOYANG]); // 시도까지만도 관심 지역 안
  });
});

describe("요약 자리 (BR-U5-C7·C8)", () => {
  const summary = { eligibilityPlain: "a", forSeniorCouple: "b" };
  it("요약 있음 / 관심 지역 밖 / 준비 중", () => {
    expect(summaryView(summary, { inDistrict: false })).toBe("summary"); // 다른 가족이 고른 지역이라 요약이 있으면 그대로
    expect(summaryView(null, { inDistrict: false })).toBe("outOfArea");
    expect(summaryView(null, { inDistrict: true })).toBe("preparing");
    expect(summaryView(null, null)).toBe("preparing"); // 프로필·판정 없음
  });
});

describe("피드 카드의 지역 (BR-U5-C2)", () => {
  const row = (regions?: FeedRow["notice"]["regions"]): FeedRow => ({
    verdict: "eligible",
    inDistrict: true,
    score: 1,
    detail: { units: [] },
    notice: { id: "n1", title: "통합 공고", complexName: null, tenure: "rent", applyStart: "2026-10-20", applyEnd: "2026-10-30", firstSeenAt: "2026-10-18T00:00:00.000Z", ...(regions ? { regions } : {}) },
    districts: [],
  });
  it("관심 지역 먼저, 지역을 안 넘긴 행(알림 발송)은 빈 목록", () => {
    expect(buildFeed([row([GOYANG, MAPO, GANGSEO])], "2026-10-21", new Map(), [], [GANGSEO])[0]!.regions).toEqual([GANGSEO, MAPO, GOYANG]);
    expect(buildFeed([row()], "2026-10-21", new Map(), [])[0]!.regions).toEqual([]);
  });
});

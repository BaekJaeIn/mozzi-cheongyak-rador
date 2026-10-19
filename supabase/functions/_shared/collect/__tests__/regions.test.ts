// 공고 지역 판별 — 예시 + PBT (U3 변경 2 BR-U3-C4~C9, P-U3-C1~C4·C7)
import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { CAPITAL_SIDO, CAPITAL_SIGUNGU } from "../../domain/regions.ts";
import { DISTRICTS } from "../../eligibility/reference-data.ts";
import type { NoticeRegion } from "../../eligibility/types.ts";
import { noticeRegionArb } from "../../__tests__/arbitraries/eligibility.ts";
import { applyAiRegions, districtRegions, incheonNewGu, matchCapitalSigungu, mergeRegions, resolveRegions } from "../regions.ts";

const resolve = (sido: string | null, sigungu: string | null, text = "", districtIds: string[] = []) =>
  resolveRegions({ sido, sigungu, text, districtIds, districts: DISTRICTS });

describe("지역 판별 (BR-U3-C4)", () => {
  it("서울 구, 경기 시+구 → 시, 수도권 밖·시도 모름 → 빈 목록", () => {
    expect(resolve("서울", "강서구")).toEqual([{ sido: "서울", sigungu: "강서구" }]);
    expect(resolve("경기", "고양시 덕양구")).toEqual([{ sido: "경기", sigungu: "고양시" }]);
    expect(resolve("경기도", "수원시 영통구")).toEqual([{ sido: "경기", sigungu: "수원시" }]);
    expect(resolve("부산", "해운대구")).toEqual([]);
    expect(resolve(null, "강서구")).toEqual([]);
  });

  it("시군구를 못 맞추면 시도까지만", () => {
    expect(resolve("서울", null)).toEqual([{ sido: "서울", sigungu: null }]);
    expect(resolve("경기", "없는시")).toEqual([{ sido: "경기", sigungu: null }]);
  });

  it("지구 공고는 지구의 시군구도 지역에 (BR-U3-C8) — GH '경기도'만 있어도", () => {
    expect(resolve("경기", null, "남양주왕숙 행복주택", ["wangsuk"])).toEqual([{ sido: "경기", sigungu: "남양주시" }]);
    expect(districtRegions(["gwangmyeong_siheung"], DISTRICTS)).toEqual([
      { sido: "경기", sigungu: "광명시" },
      { sido: "경기", sigungu: "시흥시" },
    ]);
    expect(districtRegions(["changneung"], DISTRICTS)).toEqual([{ sido: "경기", sigungu: "고양시" }]);
  });
});

describe("인천 옛 구 → 새 구 (BR-U3-C5)", () => {
  it("동구 → 제물포구, 중구 운서동 → 영종구, 중구 신포동 → 제물포구, 서구 마전동 → 검단구, 서구 가정동 → 서해구", () => {
    expect(matchCapitalSigungu("인천", "동구", "인천광역시 동구 송림동")).toBe("제물포구");
    expect(matchCapitalSigungu("인천", "중구", "인천광역시 중구 운서동 2850")).toBe("영종구");
    expect(matchCapitalSigungu("인천", "중구", "인천광역시 중구 신포동")).toBe("제물포구");
    expect(matchCapitalSigungu("인천", "서구", "인천광역시 서구 마전동")).toBe("검단구");
    expect(matchCapitalSigungu("인천", "서구", "인천광역시 서구 가정동")).toBe("서해구");
  });

  it("영종하늘도시·검단신도시처럼 동 대신 지구 이름이 있어도 가른다", () => {
    expect(matchCapitalSigungu("인천", "중구", "인천 중구 영종하늘도시 A23블록")).toBe("영종구");
    expect(matchCapitalSigungu("인천", "서구", "인천검단신도시 AA30블록")).toBe("검단구");
  });

  it("동을 가를 수 없으면 시도까지만 (null)", () => {
    expect(matchCapitalSigungu("인천", "중구", "인천광역시 중구")).toBeNull();
    expect(matchCapitalSigungu("인천", "서구", "")).toBeNull();
    expect(incheonNewGu("남구", "x")).toBeNull();
  });

  it("새 구 이름은 그대로", () => {
    expect(matchCapitalSigungu("인천", "서해구", "")).toBe("서해구");
  });
});

describe("AI 공급 위치로 고치기 (BR-U3-C9)", () => {
  it("시도까지만 항목을 공고문 시군구로 바꾼다", () => {
    expect(applyAiRegions([{ sido: "서울", sigungu: null }], ["서울특별시 강동구"])).toEqual([{ sido: "서울", sigungu: "강동구" }]);
    expect(applyAiRegions([{ sido: "서울", sigungu: null }], ["강동구", "송파구"])).toEqual([
      { sido: "서울", sigungu: "강동구" },
      { sido: "서울", sigungu: "송파구" },
    ]);
  });

  it("고칠 것이 없으면 null — 이미 정해진 시군구, 다른 시도 표기, 빈 응답", () => {
    expect(applyAiRegions([{ sido: "서울", sigungu: "강서구" }], ["서울특별시 마포구"])).toBeNull();
    expect(applyAiRegions([{ sido: "서울", sigungu: null }], ["경기도 하남시"])).toBeNull();
    expect(applyAiRegions([{ sido: "서울", sigungu: null }], null)).toBeNull();
    expect(applyAiRegions([{ sido: "서울", sigungu: null }], ["알 수 없음"])).toBeNull();
  });
});

const isClean = (list: readonly NoticeRegion[]) => {
  const keys = list.map((r) => `${r.sido}|${r.sigungu ?? "*"}`);
  const noDup = new Set(keys).size === keys.length;
  const noNullBesideNamed = list.every((r) => r.sigungu !== null || !list.some((x) => x.sido === r.sido && x.sigungu !== null));
  return noDup && noNullBesideNamed;
};
const regionListArb = fc.array(noticeRegionArb, { maxLength: 6 });

test.prop([fc.option(fc.constantFrom("서울", "서울특별시", "경기도", "인천광역시", "부산", "강원"), { nil: null }), fc.option(fc.string({ maxLength: 12 }), { nil: null }), fc.string({ maxLength: 30 })])(
  "P-U3-C1 판별 결과는 수도권 시도 + 공용 목록 시군구 또는 null",
  (sido, sigungu, text) => {
    for (const r of resolve(sido, sigungu, text)) {
      expect(CAPITAL_SIDO).toContain(r.sido);
      if (r.sigungu !== null) expect(CAPITAL_SIGUNGU[r.sido]).toContain(r.sigungu);
    }
  },
);

test.prop([regionListArb, regionListArb])("P-U3-C2 정리 규칙: 중복 없음, 이름 있는 시군구 옆에 같은 시도 null 없음, 시도 집합 유지", (a, b) => {
  const merged = mergeRegions(a, b);
  expect(isClean(merged)).toBe(true);
  expect(new Set(merged.map((r) => r.sido))).toEqual(new Set([...a, ...b].map((r) => r.sido)));
});

test.prop([fc.array(regionListArb, { minLength: 1, maxLength: 4 })])("P-U3-C3 묶음 지역은 순서와 무관하고 모든 원천의 이름 있는 시군구를 담는다", (lists) => {
  const merged = mergeRegions(...lists);
  expect(mergeRegions(...[...lists].reverse())).toEqual(merged);
  for (const r of lists.flat()) if (r.sigungu !== null) expect(merged).toContainEqual(r);
});

test.prop([regionListArb.map((l) => mergeRegions(l)), fc.array(fc.constantFrom("서울특별시 강동구", "강서구", "경기도 성남시 분당구", "수원시", "인천광역시 중구 운서동", "모름"), { maxLength: 3 })])(
  "P-U3-C4 AI 고치기: 시도 집합 그대로, 이미 정해진 시군구 그대로",
  (regions, ai) => {
    const fixed = applyAiRegions(regions, ai);
    if (fixed === null) return;
    expect(new Set(fixed.map((r) => r.sido))).toEqual(new Set(regions.map((r) => r.sido)));
    for (const r of regions) if (r.sigungu !== null) expect(fixed).toContainEqual(r);
    expect(isClean(fixed)).toBe(true);
  },
);

test.prop([fc.constantFrom("운서", "운남", "중산", "을왕", "무의", "용유"), fc.string({ maxLength: 10 })])(
  "P-U3-C7 영종 쪽 동이 든 옛 중구 주소는 항상 영종구, 동구는 항상 제물포구",
  (dong, tail) => {
    expect(matchCapitalSigungu("인천", "중구", `인천광역시 중구 ${dong}동 ${tail}`)).toBe("영종구");
    expect(matchCapitalSigungu("인천", "동구", `인천광역시 동구 ${tail}`)).toBe("제물포구");
  },
);

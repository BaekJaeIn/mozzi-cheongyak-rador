// 예시 기반 테스트 — 수집 순수 함수 (날짜·블록·묶기·범위·해시·정규화·PDF·추출·번들)
import { describe, expect, it } from "vitest";
import { parseDateRange, parseSourceDate } from "../dates.ts";
import { extractBlockKey } from "../block-key.ts";
import { dedupKeyOf, groupNotices, mergedSchedule } from "../grouping.ts";
import { inScope } from "../scope.ts";
import { contentHash } from "../content-hash.ts";
import { extractSigungu, isDistrictCandidate, normalizeNotice } from "../normalize.ts";
import { pickNoticePdf } from "../pdf-locator.ts";
import { flatToRequirements, parseExtraction } from "../extraction.ts";
import { baseFromGroup, buildUnits } from "../bundle.ts";
import { redactUrls } from "../ports.ts";
import { mockExtractionFor, mockRawNotices } from "../mock-data.ts";
import { DISTRICTS, STANDARD_REQUIREMENTS } from "../../eligibility/reference-data.ts";
import type { NormalizedNotice } from "../types.ts";

const TODAY = "2026-10-15";
const norm = async (source: "lh_rental" | "applyhome" | "gh", i: number) =>
  (await normalizeNotice(mockRawNotices(TODAY)[source][i]!, DISTRICTS))!;

describe("parseSourceDate (BR-U3-10)", () => {
  it.each([
    ["20260819", "2026-08-19"],
    ["2026.07.14", "2026-07-14"],
    ["2026-07-14(월)", "2026-07-14"],
    ["2026/7/4", "2026-07-04"],
    ["2026. 10. 6.", "2026-10-06"],
    ["2026.07.20 10:00", "2026-07-20"],
    [20260819, "2026-08-19"],
  ])("%s → %s", (input, expected) => expect(parseSourceDate(input)).toBe(expected));

  it.each(["", "미정", "2026-02-30", "2026-13-01", null, undefined, "202608"])("해석 불가 %s → null", (input) => {
    expect(parseSourceDate(input)).toBeNull();
  });

  it("범위", () => {
    expect(parseDateRange("2026.07.20 10:00 ~ 2026.07.21 17:00")).toEqual(["2026-07-20", "2026-07-21"]);
  });
});

describe("extractBlockKey (BR-U3-30)", () => {
  it.each([
    ["하남교산 A2블록 공공분양", "A2"],
    ["[하남교산] A-2BL 뉴:홈", "A2"],
    ["교산 a2 bl", "A2"],
    ["교산 A02블록", "A2"],
    ["고양창릉 S-3블록", "S3"],
    ["왕숙 A1-1블록", "A1-1"],
    ["왕숙 A1·A2블록 / A1블록", "A1+A2"],
    ["행복주택 입주자 모집", null],
    ["LH 2026년 1차", null],
  ])("%s → %s", (text, expected) => expect(extractBlockKey(text)).toBe(expected));
});

describe("묶기 (기능 설계 §3 예시)", () => {
  it("청약홈·LH 교산 A2는 하나로, 대표는 LH", async () => {
    const lh = await norm("lh_rental", 0);
    const aph = await norm("applyhome", 0);
    const gh = await norm("gh", 0);
    const groups = groupNotices([aph, gh, lh]);
    const gyosan = groups.find((g) => g.dedupKey.startsWith("gyosan|A2|"))!;
    expect(gyosan.members.map((m) => m.source)).toEqual(["lh_rental", "applyhome"]);
    expect(groups.find((g) => g.members[0]!.source === "gh")!.dedupKey).toBe("gh:MOCK-GH-1");
  });

  // 회귀 테스트 (PBT 발견): 같은 (소스, 번호)·같은 해시인데 해시 밖 필드가 다르면 순서에 따라 결과가 달랐다
  it("같은 원천이 두 번 들어와도 순서와 무관하게 같은 하나를 남긴다", async () => {
    const a = await norm("gh", 0);
    const b: NormalizedNotice = { ...a, supplyType: "integrated_rental" };
    expect(groupNotices([a, b])).toEqual(groupNotices([b, a]));
    expect(groupNotices([a, b])[0]!.members).toHaveLength(1);
  });

  it("블록·지구·공고일 중 하나라도 없으면 단독 키", () => {
    const n = { source: "gh" as const, sourceNoticeNo: "9", districtIds: ["gyosan"], blockKey: null, schedule: { announcedAt: "2026-10-01" } };
    expect(dedupKeyOf(n as never)).toBe("gh:9");
  });

  it("대표에 없는 일정은 다른 원천에서 채운다", async () => {
    const lh = await norm("lh_rental", 0);
    const aph: NormalizedNotice = { ...(await norm("applyhome", 0)), schedule: { ...lh.schedule, resultAt: "2026-11-01" } };
    const [g] = groupNotices([lh, aph]);
    expect(mergedSchedule(g!).resultAt).toBe("2026-11-01");
  });
});

describe("범위·해시", () => {
  it("마감 당일까지 포함, 마감일 모르면 포함 (BR-U3-40)", () => {
    expect(inScope({ applyEnd: "2026-10-15" }, TODAY)).toBe(true);
    expect(inScope({ applyEnd: "2026-10-14" }, TODAY)).toBe(false);
    expect(inScope({ applyEnd: null }, TODAY)).toBe(true);
  });

  it("raw만 다르면 같은 해시, 제목이 바뀌면 다른 해시 (BR-U3-50)", async () => {
    const n = await norm("lh_rental", 0);
    expect(await contentHash({ ...n, raw: { other: 1 } } as never)).toBe(n.contentHash);
    expect(await contentHash({ ...n, title: `${n.title} (정정)` })).not.toBe(n.contentHash);
  });
});

describe("정규화·지구", () => {
  it("시군구 추출", () => {
    expect(extractSigungu("경기도 고양시 덕양구 화전동")).toBe("고양시 덕양구");
    expect(extractSigungu("인천광역시 계양구 박촌동")).toBe("계양구");
    expect(extractSigungu("경기도 하남시 천현동")).toBe("하남시");
  });

  it("성남 대장동은 지구 없음, 하남 미사는 지구 후보", async () => {
    const seongnam = await norm("applyhome", 1);
    expect(seongnam.districtIds).toEqual([]);
    expect(isDistrictCandidate(seongnam, DISTRICTS)).toBe(false);
    const misa = await norm("lh_rental", 2);
    expect(misa.districtIds).toEqual([]);
    expect(isDistrictCandidate(misa, DISTRICTS)).toBe(true);
  });

  it("번호나 제목이 비면 버린다", async () => {
    const raw = { ...mockRawNotices(TODAY).gh[0]!, sourceNoticeNo: "  " };
    expect(await normalizeNotice(raw, DISTRICTS)).toBeNull();
  });
});

describe("PDF 고르기 (BR-U3-60)", () => {
  it("공고·모집 이름의 PDF 우선", () => {
    expect(
      pickNoticePdf([
        { name: "평면도.pdf", url: "https://x/1.pdf" },
        { name: "입주자모집공고문.pdf", url: "https://x/2.pdf" },
        { name: "공고문.hwp", url: "https://x/3.hwp" },
      ])?.url,
    ).toBe("https://x/2.pdf");
    expect(pickNoticePdf([{ name: "공고문.hwp", url: "https://x/3.hwp" }])).toBeNull();
  });
  it("공고문 > 공고 > 모집, 포스터·팸플릿·주택내역 같은 부속 자료는 뒤로 (실제 GH 첨부 이름)", () => {
    const pick = (names: string[]) => pickNoticePdf(names.map((name, i) => ({ name, url: `https://x/${i}` })))?.name;
    expect(pick(["2. 26년 매입임대주택 입주자 모집(자격완화) 포스터(260615).pdf", "1. 26년 매입임대주택 입주자 모집(자격완화) 공고문(수정260617).pdf"])).toBe(
      "1. 26년 매입임대주택 입주자 모집(자격완화) 공고문(수정260617).pdf",
    );
    expect(pick(["다산지금A3 통합공공임대주택_팸플릿.pdf", "[공고]다산지금A3 통합공공임대주택 입주자 모집공고_28.05.28 공고.pdf"])).toBe(
      "[공고]다산지금A3 통합공공임대주택 입주자 모집공고_28.05.28 공고.pdf",
    );
    expect(pick(["3. 입주자 모집 주택내역.pdf", "단지 안내.pdf"])).toBe("3. 입주자 모집 주택내역.pdf"); // 모두 0점이면 첫 PDF
  });
});

describe("추출 검증 (BR-U3-63·64)", () => {
  it("목업 응답 → 주택형 2개, 고령자 요건 변환", () => {
    const e = parseExtraction(mockExtractionFor("mock://pdf/wangsuk-happy.pdf"))!;
    expect(e.units).toHaveLength(2);
    expect(e.units[0]!.requirements).toEqual({
      age: { minAge: 65, who: "member" },
      homeless: { minYears: null },
      income: { basis: "urban_worker", percent: 100, percentBySize: { "1": 120, "2": 110 } },
      asset: { maxManwon: 34500 },
      car: { maxManwon: 4542 },
    });
  });

  it("최상위 형식이 틀리거나 잘린 응답은 null", () => {
    expect(parseExtraction(null)).toBeNull();
    expect(parseExtraction({ units: [] })).toBeNull();
    expect(parseExtraction("{\"isNotice\": tr")).toBeNull();
  });

  it("isNotice=false면 주택형·요약을 버린다", () => {
    expect(parseExtraction({ isNotice: false, units: [{ supplyTypeText: "x" }], summary: { eligibilityPlain: "a", forSeniorCouple: "b" } })).toEqual({
      isNotice: false,
      schedule: { announcedAt: null, applyStart: null, applyEnd: null, resultAt: null, contractStart: null, contractEnd: null },
      units: [],
      summary: null,
    });
  });

  it("범위 밖 값은 버리고 나머지는 쓴다", () => {
    expect(flatToRequirements({ minAge: 500, assetMaxManwon: -1, carMaxManwon: 3000, welfareAnyOf: ["livelihood_or_medical", "hack"] })).toEqual({
      car: { maxManwon: 3000 },
      welfare: { anyOf: ["livelihood_or_medical"] },
    });
  });

  it("요약은 600자로 자른다", () => {
    const e = parseExtraction({ isNotice: true, units: [], summary: { eligibilityPlain: "가".repeat(700), forSeniorCouple: "나" } })!;
    expect(e.summary!.eligibilityPlain).toHaveLength(600);
  });
});

describe("번들 (BR-U3-65)", () => {
  it("추출 없으면 공고 유형 표준 요건 1개", async () => {
    const [g] = groupNotices([await norm("gh", 0)]);
    const units = buildUnits(baseFromGroup(g!), null, STANDARD_REQUIREMENTS);
    expect(units).toHaveLength(1);
    expect(units[0]!.supply_type).toBe("happy_unknown"); // 제목에 계층이 없다 (변경 4 BR-U2-E20)
    expect(units[0]!.requirements).toEqual(STANDARD_REQUIREMENTS.happy_unknown);
  });

  it("추출 주택형마다 유형·요건 확정", async () => {
    const [g] = groupNotices([await norm("gh", 0)]);
    const units = buildUnits(baseFromGroup(g!), parseExtraction(mockExtractionFor("x/wangsuk-happy.pdf")), STANDARD_REQUIREMENTS);
    expect(units.map((u) => [u.label, u.supply_type])).toEqual([
      ["26㎡", "happy_senior"],
      ["36㎡", "happy_unknown"], // "행복주택 청년" — 고령자 말이 없으면 계층 모름 (변경 4 BR-U2-E20)
    ]);
    // 청년 주택형: 추출 나이 19 ≠ 표준 65 → 구조 조건 불일치 → unknown (BR-U2-24)
    expect((units[1]!.requirements as { age: unknown }).age).toBe("unknown");
  });
});

describe("URL 가리기 (BR-U3-72)", () => {
  it("쿼리 문자열(API 키)을 지운다", () => {
    expect(redactUrls("HTTP 500 https://apis.data.go.kr/B552555/x?serviceKey=SECRET&PAGE=1 실패")).toBe(
      "HTTP 500 https://apis.data.go.kr/B552555/x?[redacted] 실패",
    );
  });
});

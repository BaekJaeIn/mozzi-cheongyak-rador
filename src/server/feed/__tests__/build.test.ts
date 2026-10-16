// 피드·상세 응답 만들기 예시 테스트 — business-logic-model §8 (BR-U5-01·04·22·25·95·100~102)
import { describe, expect, it } from "vitest";
import type { UnitJudgement } from "@shared/eligibility/types.ts";
import {
  buildFeed,
  isNoticeId,
  needsRecompute,
  parseJudgementDetail,
  pickSources,
  readSummary,
  toJudgementView,
  toNoticeDetail,
  toNoticeSummary,
  type TypeLabels,
} from "../build";
import type { FeedRow, NoticeBundle } from "../types";

const TODAY = "2026-10-20";
const LABELS: TypeLabels = new Map([
  ["senior", { plain: "고령자", formal: "고령자 우선공급" }],
  ["newlywed", { plain: "신혼부부", formal: "신혼부부 특별공급" }],
  ["youth", { plain: "청년", formal: "청년 매입임대" }],
]);
const GYOSAN = { id: "gyosan", name: "하남 교산", sortOrder: 2 };
const WANGSUK = { id: "wangsuk", name: "남양주 왕숙", sortOrder: 1 };

const unit = (unitId: string, supplyType: string, verdict: UnitJudgement["verdict"]): UnitJudgement => ({ unitId, supplyType, verdict, criteria: [] });

function row(id: string, over: Partial<FeedRow> & { start?: string | null; end?: string | null; units?: UnitJudgement[] } = {}): FeedRow {
  const { start = null, end = null, units = [unit(`${id}-1`, "senior", over.verdict ?? "eligible")], ...rest } = over;
  return {
    verdict: "eligible",
    inDistrict: true,
    score: 1,
    detail: { baseDate: TODAY, units },
    notice: { id, title: `${id} 공고`, complexName: `${id} 단지`, tenure: "rent", applyStart: start, applyEnd: end, firstSeenAt: "2026-10-18T00:00:00Z" },
    districts: [GYOSAN],
    ...rest,
  };
}

describe("buildFeed — 어머니 기기 예시 (business-logic-model §8)", () => {
  const rows = [
    row("wangsuk-sale", { start: "2026-10-21", end: "2026-10-24", inDistrict: false, districts: [WANGSUK] }),
    row("youth", { start: "2026-10-15", end: "2026-10-17", verdict: "ineligible", units: [unit("y1", "youth", "ineligible")] }),
    row("newlywed", { start: "2026-10-27", end: "2026-10-29", verdict: "unknown", units: [unit("n1", "newlywed", "unknown")] }),
    row("a2", { start: "2026-10-20", end: "2026-10-23" }),
  ];

  it("관심 지구 밖·미충족·마감은 빠지고 접수 중 → 접수 예정 순", () => {
    const feed = buildFeed(rows, TODAY, LABELS, ["gyosan"]);
    expect(feed.map((i) => [i.id, i.status, i.verdict])).toEqual([
      ["a2", "open", "eligible"],
      ["newlywed", "upcoming", "unknown"],
    ]);
  });
});

describe("buildFeed 세부", () => {
  it("카드 공급유형: 충족·확인 필요만, 중복 없이 쉬운 말 (BR-U5-22)", () => {
    const r = row("x", {
      verdict: "unknown",
      units: [unit("1", "senior", "eligible"), unit("2", "senior", "unknown"), unit("3", "youth", "ineligible"), unit("4", "newlywed", "unknown"), unit("5", "mystery", "unknown")],
    });
    expect(buildFeed([r], TODAY, LABELS, [])[0]!.supplyTypes).toEqual([
      { code: "senior", plain: "고령자" },
      { code: "newlywed", plain: "신혼부부" },
      { code: "mystery", plain: "mystery" },
    ]);
  });

  it("지구: 관심 지구 먼저, 이름 순 (BR-U5-25)", () => {
    const r = row("x", { districts: [GYOSAN, WANGSUK, { id: "daejang", name: "부천 대장", sortOrder: 3 }] });
    expect(buildFeed([r], TODAY, LABELS, ["wangsuk"])[0]!.districts.map((d) => d.id)).toEqual(["wangsuk", "daejang", "gyosan"]);
  });

  it("판정 상세가 깨져도 공고는 보이고 공급유형만 비운다, 점수 없음은 0", () => {
    const feed = buildFeed([row("x", { detail: "broken", score: null })], TODAY, LABELS, []);
    expect(feed[0]).toMatchObject({ supplyTypes: [], score: 0 });
  });

  it("마감일이 없으면 마감으로 보지 않는다 (BR-U5-02)", () => {
    expect(buildFeed([row("x", { start: "2026-01-01", end: null })], TODAY, LABELS, [])).toHaveLength(1);
  });
});

describe("needsRecompute (BR-U5-04)", () => {
  it.each([
    [{ count: 0, minProfileVersion: null }, 3, 10, true],
    [{ count: 0, minProfileVersion: null }, 3, 0, false],
    [{ count: 5, minProfileVersion: 2 }, 3, 10, true],
    [{ count: 5, minProfileVersion: 3 }, 3, 10, false],
  ] as const)("%o, 프로필 v%i, 공고 %i건 → %s", (stats, version, notices, expected) => {
    expect(needsRecompute(stats, version, notices)).toBe(expected);
  });
});

describe("parseJudgementDetail", () => {
  it("형식이 틀린 주택형·조건은 버린다", () => {
    const parsed = parseJudgementDetail({
      baseDate: TODAY,
      units: [
        { unitId: "u1", supplyType: "senior", verdict: "eligible", criteria: [{ key: "age", verdict: "eligible", code: "c", reason: "r", userValue: "x" }, { key: "nope" }] },
        { unitId: 1, supplyType: "senior", verdict: "eligible" },
        { unitId: "u2", supplyType: "senior", verdict: "maybe" },
      ],
    });
    expect(parsed.units).toEqual([{ unitId: "u1", supplyType: "senior", verdict: "eligible", criteria: [{ key: "age", verdict: "eligible", code: "c", reason: "r" }] }]);
  });
});

describe("pickSources (BR-U5-100~102)", () => {
  const s = (source: "applyhome" | "lh_rental" | "gh", url: string, at = "2026-10-18T00:00:00Z") => ({ source, originalUrl: url, lastSeenAt: at });

  it("대표 출처 먼저, 같은 출처는 마지막으로 확인된 주소", () => {
    const links = pickSources(
      [s("applyhome", "https://www.applyhome.co.kr/a"), s("lh_rental", "https://apply.lh.or.kr/old", "2026-10-01T00:00:00Z"), s("lh_rental", "https://apply.lh.or.kr/new")],
      "lh_rental",
    );
    expect(links).toEqual([
      { source: "lh_rental", label: "LH 청약플러스", url: "https://apply.lh.or.kr/new", primary: true },
      { source: "applyhome", label: "청약홈", url: "https://www.applyhome.co.kr/a", primary: false },
    ]);
  });

  it("http(s)가 아니면 버리고 대표가 없으면 다른 출처를 올린다", () => {
    const links = pickSources([s("gh", "javascript:alert(1)"), s("applyhome", "https://www.applyhome.co.kr/a")], "gh");
    expect(links).toEqual([{ source: "applyhome", label: "청약홈", url: "https://www.applyhome.co.kr/a", primary: true }]);
    expect(pickSources([s("gh", "not a url")], "gh")).toEqual([]);
  });
});

describe("상세·요약 응답 (BR-U5-95·131·134)", () => {
  const bundle: NoticeBundle = {
    notice: {
      id: "3f2c1a9e-0000-4000-8000-000000000001",
      title: "하남교산 A2 공고",
      complexName: "하남교산 A2",
      location: "경기도 하남시",
      provider: "LH",
      primarySource: "lh_rental",
      tenure: "rent",
      announcedAt: "2026-10-01",
      applyStart: "2026-10-20",
      applyEnd: "2026-10-23",
      resultAt: null,
      contractStart: null,
      contractEnd: null,
      summary: { eligibilityPlain: " 쉬운 말 ", forSeniorCouple: "노부부", generatedAt: "x" },
      summaryStatus: "done",
      firstSeenAt: "2026-10-18T00:00:00Z",
    },
    units: [
      { id: "u1", label: "46A", supplyType: "senior", exclusiveAreaM2: 46, supplyCount: 100 },
      { id: "u2", label: "59A", supplyType: "newlywed", exclusiveAreaM2: 59, supplyCount: 50 },
      { id: "u3", label: "59B", supplyType: "senior", exclusiveAreaM2: 59, supplyCount: 20 },
    ],
    districts: [GYOSAN],
    sources: [{ source: "lh_rental", originalUrl: "https://apply.lh.or.kr/x", lastSeenAt: "2026-10-18T00:00:00Z" }],
  };

  it("상세: 상태·쉬운 말·요약·원문", () => {
    const d = toNoticeDetail(bundle, TODAY, LABELS, ["gyosan"]);
    expect(d.status).toBe("open");
    expect(d.units[0]).toMatchObject({ plain: "고령자", formal: "고령자 우선공급" });
    expect(d.summary).toEqual({ eligibilityPlain: "쉬운 말", forSeniorCouple: "노부부" });
    expect(d.sources).toHaveLength(1);
    const json = JSON.stringify(d);
    for (const banned of ["raw", "requirements", "attachments", "ai_", "generatedAt"]) expect(json).not.toContain(banned);
  });

  it("요약은 done이고 두 글이 모두 있을 때만", () => {
    expect(readSummary("pending", { eligibilityPlain: "a", forSeniorCouple: "b" })).toBeNull();
    expect(readSummary("done", { eligibilityPlain: "a", forSeniorCouple: "  " })).toBeNull();
    expect(readSummary("done", null)).toBeNull();
  });

  it("판정 보기: 노출 여부와 오래됨", () => {
    const v = toJudgementView({ verdict: "eligible", inDistrict: false, detail: { baseDate: TODAY, units: [] }, profileVersion: 2 }, "open", 3);
    expect(v).toMatchObject({ visible: false, outdated: true, baseDate: TODAY });
  });

  it("요약: 공급유형 쉬운 말 중복 없이, 지구 이름", () => {
    expect(toNoticeSummary(bundle, TODAY, LABELS)).toMatchObject({ supplyTypes: ["고령자", "신혼부부"], districts: ["하남 교산"], status: "open" });
  });

  it("공고 ID는 UUID만", () => {
    expect(isNoticeId(bundle.notice.id)).toBe(true);
    expect(isNoticeId("../etc")).toBe(false);
    expect(isNoticeId("1")).toBe(false);
  });
});

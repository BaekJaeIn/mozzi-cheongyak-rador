// 예시 기반 테스트 — U5 FeedQueryRepository (조회 형태·행 변환·페이지 나눔)
import { describe, expect, it } from "vitest";
import { createFeedRepository } from "../feed-repository";
import { createFakeDb } from "./fake-db";

const DEVICE = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";
const NOTICE = "3f2c1a9e-0000-4000-8000-000000000001";

const noticeJoin = {
  id: NOTICE,
  title: "공고",
  complex_name: "단지",
  tenure: "rent",
  apply_start: "2026-10-20",
  apply_end: null,
  first_seen_at: "2026-10-18 09:00:00+09",
  notice_districts: [{ districts: { id: "gyosan", name: "하남 교산", sort_order: 2 } }, { districts: null }],
};

describe("FeedQueryRepository", () => {
  it("listFeedRows: 미충족·지구 밖·마감을 DB에서 먼저 거르고 행을 바꾼다", async () => {
    const { db, calls } = createFakeDb(() => ({
      data: [{ verdict: "eligible", in_district: true, score: "2", detail: { units: [] }, notices: noticeJoin }, { verdict: "unknown", in_district: true, score: null, detail: {}, notices: null }],
      error: null,
    }));
    const rows = await createFeedRepository(db).listFeedRows(DEVICE, "2026-10-20");
    expect(rows).toEqual([
      {
        verdict: "eligible",
        inDistrict: true,
        score: 2,
        detail: { units: [] },
        notice: { id: NOTICE, title: "공고", complexName: "단지", tenure: "rent", applyStart: "2026-10-20", applyEnd: null, firstSeenAt: "2026-10-18T00:00:00.000Z" },
        districts: [{ id: "gyosan", name: "하남 교산", sortOrder: 2 }],
      },
    ]);
    const chain = calls[0]!.chain;
    expect(calls[0]!.name).toBe("judgements");
    expect(chain).toContainEqual({ method: "eq", args: ["device_id", DEVICE] });
    expect(chain).toContainEqual({ method: "neq", args: ["verdict", "ineligible"] });
    expect(chain).toContainEqual({ method: "eq", args: ["in_district", true] });
    expect(chain).toContainEqual({ method: "or", args: ["apply_end.gte.2026-10-20,apply_end.is.null", { referencedTable: "notices" }] });
  });

  it("listFeedRows는 1,000행씩 끝까지 읽는다", async () => {
    let page = 0;
    const { db, calls } = createFakeDb(() => {
      page += 1;
      const n = page === 1 ? 1000 : 1;
      return { data: Array.from({ length: n }, () => ({ verdict: "eligible", in_district: true, score: 1, detail: {}, notices: noticeJoin })), error: null };
    });
    expect(await createFeedRepository(db).listFeedRows(DEVICE, "2026-10-20")).toHaveLength(1001);
    expect(calls.map((c) => c.chain.find((x) => x.method === "range")?.args)).toEqual([[0, 999], [1000, 1999]]);
  });

  it("judgementStats: 개수와 가장 낮은 프로필 버전", async () => {
    const { db } = createFakeDb(() => ({ data: [{ profile_version: 2 }], error: null, count: 7 }));
    expect(await createFeedRepository(db).judgementStats(DEVICE)).toEqual({ count: 7, minProfileVersion: 2 });
    const empty = createFakeDb(() => ({ data: [], error: null, count: 0 }));
    expect(await createFeedRepository(empty.db).judgementStats(DEVICE)).toEqual({ count: 0, minProfileVersion: null });
  });

  it("getNoticeBundle: 원천 응답·요건 원본·AI 처리 정보는 고르지 않는다", async () => {
    const { db, calls } = createFakeDb(() => ({
      data: {
        id: NOTICE,
        title: "공고",
        complex_name: null,
        location: null,
        provider: "LH",
        primary_source: "lh_rental",
        tenure: "rent",
        announced_at: null,
        apply_start: null,
        apply_end: null,
        result_at: null,
        contract_start: null,
        contract_end: null,
        summary: null,
        summary_status: "pending",
        first_seen_at: "2026-10-18T00:00:00Z",
        housing_units: [{ id: "u1", label: "46A", supply_type: "senior", exclusive_area_m2: "46.00", supply_count: 10 }],
        notice_districts: [{ districts: { id: "gyosan", name: "하남 교산", sort_order: 2 } }],
        source_notices: [{ source: "lh_rental", original_url: "https://apply.lh.or.kr/x", last_seen_at: "2026-10-18T00:00:00Z" }],
      },
      error: null,
    }));
    const bundle = await createFeedRepository(db).getNoticeBundle(NOTICE);
    expect(bundle?.units[0]).toEqual({ id: "u1", label: "46A", supplyType: "senior", exclusiveAreaM2: 46, supplyCount: 10 });
    expect(bundle?.sources[0]).toMatchObject({ source: "lh_rental", originalUrl: "https://apply.lh.or.kr/x" });
    const select = String(calls[0]!.chain.find((c) => c.method === "select")!.args[0]);
    for (const banned of ["raw", "requirements", "ai_", "attachments", "*"]) expect(select).not.toContain(banned);
  });

  it("listNoticeBundles: 빈 목록이면 DB를 부르지 않는다", async () => {
    const { db, calls } = createFakeDb(() => ({ data: [], error: null }));
    expect(await createFeedRepository(db).listNoticeBundles([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("DB 오류는 DbError", async () => {
    const { db } = createFakeDb(() => ({ data: null, error: { message: "x", code: "42P01" } }));
    await expect(createFeedRepository(db).getJudgement(DEVICE, NOTICE)).rejects.toThrow("judgements.get");
  });
});

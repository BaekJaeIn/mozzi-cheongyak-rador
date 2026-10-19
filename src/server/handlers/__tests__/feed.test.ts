// 예시 기반 테스트 — U5 API (BR-U5-01~05·130~134)
import type { ProfileRepository } from "@shared/db/repositories.ts";
import type { StoredProfile } from "@shared/db/types.ts";
import { buildAuthHeaders } from "@shared/security/auth-headers.ts";
import { unfoldIcs } from "@/features/notice/model/calendar";
import { describe, expect, it } from "vitest";
import { createRouteGuard } from "../../auth/route-guard";
import { createMemoryDevices, seedDevice } from "../../__tests__/helpers";
import type { FeedQueryRepository, FeedRow, JudgementRecord, JudgementStats, NoticeBundle } from "../../feed/types";
import { interestRegions } from "../feed";
import { createCalendarHandler, createFeedHandler, createNoticeDetailHandler, createNoticeSummariesHandler, type FeedDeps, parseIds } from "../feed";

const NOW = new Date("2026-10-20T03:00:00Z"); // KST 2026-10-20 12:00
const A2 = "3f2c1a9e-0000-4000-8000-000000000001";
const OTHER = "3f2c1a9e-0000-4000-8000-000000000002";
const MISSING = "3f2c1a9e-0000-4000-8000-0000000000ff";

const bundle = (id: string, over: Partial<NoticeBundle["notice"]> = {}): NoticeBundle => ({
  notice: {
    id,
    title: `${id} 공고`,
    complexName: "하남교산 A2",
    location: null,
    provider: "LH",
    primarySource: "lh_rental",
    tenure: "rent",
    announcedAt: "2026-10-01",
    applyStart: "2026-10-20",
    applyEnd: "2026-10-23",
    resultAt: null,
    contractStart: null,
    contractEnd: null,
    summary: { eligibilityPlain: "쉬운 말", forSeniorCouple: "노부부" },
    summaryStatus: "done",
    regions: [],
    firstSeenAt: "2026-10-18T00:00:00.000Z",
    ...over,
  },
  units: [{ id: "u1", label: "46A", supplyType: "senior", exclusiveAreaM2: 46, supplyCount: 100 }],
  districts: [{ id: "gyosan", name: "하남 교산", sortOrder: 2 }],
  sources: [{ source: "lh_rental", originalUrl: "https://apply.lh.or.kr/x", lastSeenAt: "2026-10-18T00:00:00.000Z" }],
});

const feedRow = (id: string, verdict: FeedRow["verdict"] = "eligible"): FeedRow => ({
  verdict,
  inDistrict: true,
  score: 1,
  detail: { baseDate: "2026-10-20", units: [{ unitId: "u1", supplyType: "senior", verdict, criteria: [] }] },
  notice: { id, title: id, complexName: null, tenure: "rent", applyStart: "2026-10-20", applyEnd: "2026-10-23", firstSeenAt: "2026-10-18T00:00:00.000Z" },
  districts: [{ id: "gyosan", name: "하남 교산", sortOrder: 2 }],
});

interface Options {
  profile?: { version: number } | null;
  stats?: JudgementStats;
  notices?: number;
  rows?: FeedRow[];
  recompute?: "saved" | "stale" | "no_profile" | "throw";
  judgement?: JudgementRecord | null;
}

async function setup(o: Options = {}) {
  const devices = createMemoryDevices();
  const credentials = await seedDevice(devices, NOW);
  const logs: string[] = [];
  const withDevice = createRouteGuard(() => ({ devices, now: () => NOW }), (l) => void logs.push(l));
  const calls = { recompute: 0, listFeedRows: 0 };
  const stored: StoredProfile | null =
    o.profile === null
      ? null
      : {
          deviceId: credentials.deviceId,
          schemaVersion: 1,
          data: { prefs: { districtIds: ["gyosan"] } },
          encMonthlyIncome: "v1.secret",
          encTotalAsset: null,
          encCarValue: null,
          profileVersion: o.profile?.version ?? 3,
          updatedAt: NOW,
        };
  const profiles: ProfileRepository = { save: async () => 1, get: async () => stored, listDeviceIdsWithProfile: async () => [] };
  const bundles = new Map([A2, OTHER].map((id) => [id, bundle(id)]));
  const feed: FeedQueryRepository = {
    listFeedRows: async () => {
      calls.listFeedRows += 1;
      return o.rows ?? [feedRow(A2)];
    },
    judgementStats: async () => o.stats ?? { count: 5, minProfileVersion: 3 },
    countNotices: async () => o.notices ?? 10,
    getJudgement: async () =>
      o.judgement === undefined ? { verdict: "eligible", inDistrict: true, detail: { baseDate: "2026-10-20", units: [] }, profileVersion: 3 } : o.judgement,
    getNoticeBundle: async (id) => bundles.get(id) ?? null,
    listNoticeBundles: async (ids) => ids.flatMap((id) => (bundles.has(id) ? [bundles.get(id)!] : [])),
  };
  const deps: FeedDeps = {
    feed: () => feed,
    profiles: () => profiles,
    labels: async () => new Map([["senior", { plain: "고령자", formal: "고령자 우선공급" }]]),
    recompute: async () => {
      calls.recompute += 1;
      if (o.recompute === "throw") throw new Error("db down 450만원");
      return { status: o.recompute ?? "saved" };
    },
    now: () => NOW,
  };
  const get = (url: string, auth = true) =>
    new Request(`http://localhost${url}`, { method: "GET", headers: auth ? buildAuthHeaders(credentials) : {} });
  return {
    logs,
    calls,
    feed: (auth = true) => withDevice(createFeedHandler(deps), { route: "GET /api/feed" })(get("/api/feed", auth)),
    detail: (id: string) => withDevice(createNoticeDetailHandler(deps), { route: "GET /api/notices/[id]" })(get(`/api/notices/${id}`)),
    summaries: (query: string) => withDevice(createNoticeSummariesHandler(deps), { route: "GET /api/notices" })(get(`/api/notices${query}`)),
    calendar: (id: string) => createCalendarHandler(deps, () => undefined)(get(`/api/notices/${id}/calendar`, false)),
  };
}

describe("GET /api/feed", () => {
  it("401: 인증 없음", async () => {
    const t = await setup();
    expect((await t.feed(false)).status).toBe(401);
  });

  it("프로필이 없으면 no_profile + 빈 목록 (BR-U5-03)", async () => {
    const t = await setup({ profile: null });
    const res = await t.feed();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ state: "no_profile", today: "2026-10-20", items: [] });
    expect(t.calls.listFeedRows).toBe(0);
  });

  it("ready: 노출 조건대로, 캐시 금지 헤더", async () => {
    const t = await setup({ rows: [feedRow(A2), feedRow(OTHER, "ineligible")] });
    const res = await t.feed();
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.state).toBe("ready");
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([A2]);
    expect(body.items[0]).toMatchObject({ supplyTypes: [{ code: "senior", plain: "고령자" }], districts: [{ id: "gyosan" }] });
    expect(t.calls.recompute).toBe(0);
  });

  it("판정이 오래됐으면 한 번 다시 계산하고 ready (BR-U5-04)", async () => {
    const t = await setup({ stats: { count: 5, minProfileVersion: 2 } });
    expect((await (await t.feed()).json()).state).toBe("ready");
    expect(t.calls.recompute).toBe(1);
  });

  it("판정이 하나도 없고 공고가 있으면 다시 계산, 공고도 없으면 하지 않는다", async () => {
    const a = await setup({ stats: { count: 0, minProfileVersion: null }, notices: 3 });
    await a.feed();
    expect(a.calls.recompute).toBe(1);
    const b = await setup({ stats: { count: 0, minProfileVersion: null }, notices: 0, rows: [] });
    expect((await (await b.feed()).json()).state).toBe("ready");
    expect(b.calls.recompute).toBe(0);
  });

  it("다시 계산 실패 → outdated, 로그에는 오류 종류만", async () => {
    const t = await setup({ stats: { count: 5, minProfileVersion: 2 }, recompute: "throw" });
    const body = await (await t.feed()).json();
    expect(body.state).toBe("outdated");
    expect(body.items).toHaveLength(1);
    const log = t.logs.join("\n");
    expect(log).toContain("feed.recompute.failed");
    expect(log).not.toContain("450");
  });

  it("다시 계산이 stale이면 outdated, 그 사이 프로필이 지워졌으면 no_profile", async () => {
    const a = await setup({ stats: { count: 5, minProfileVersion: 2 }, recompute: "stale" });
    expect((await (await a.feed()).json()).state).toBe("outdated");
    const b = await setup({ stats: { count: 5, minProfileVersion: 2 }, recompute: "no_profile" });
    expect((await (await b.feed()).json()).state).toBe("no_profile");
  });

  it("응답·로그에 프로필·판정 사유·암호문이 없다", async () => {
    const t = await setup();
    const text = await (await t.feed()).text();
    for (const banned of ["v1.secret", "criteria", "detail", "districtIds"]) expect(text).not.toContain(banned);
    expect(t.logs.join("\n")).not.toContain("v1.secret");
  });
});

describe("GET /api/notices/[id]", () => {
  it("형식이 틀린 ID·없는 공고는 404 NOT_FOUND", async () => {
    const t = await setup();
    const bad = await t.detail("not-a-uuid");
    expect(bad.status).toBe(404);
    expect(await bad.json()).toEqual({ code: "NOT_FOUND", message: "공고를 찾을 수 없어요." });
    expect((await t.detail(MISSING)).status).toBe(404);
  });

  it("상세 + 판정 (노출 여부·오래됨)", async () => {
    const t = await setup({ judgement: { verdict: "unknown", inDistrict: false, detail: { baseDate: "2026-10-20", units: [] }, profileVersion: 2 } });
    const body = await (await t.detail(A2)).json();
    expect(body).toMatchObject({ today: "2026-10-20", profile: "present", notice: { id: A2, status: "open", summary: { eligibilityPlain: "쉬운 말" } } });
    expect(body.judgement).toMatchObject({ verdict: "unknown", visible: false, outdated: true });
    expect(body.notice.sources[0]).toMatchObject({ url: "https://apply.lh.or.kr/x", primary: true });
  });

  it("프로필이 없으면 profile none, 판정 null — 공고는 그대로 (BR-U5-74)", async () => {
    const t = await setup({ profile: null });
    const body = await (await t.detail(A2)).json();
    expect(body).toMatchObject({ profile: "none", judgement: null, notice: { id: A2 } });
  });

  it("판정이 없으면 null", async () => {
    const t = await setup({ judgement: null });
    expect((await (await t.detail(A2)).json()).judgement).toBeNull();
  });
});

describe("GET /api/notices?ids=", () => {
  it("요약 + 없는 ID, 입력 순서대로 (BR-U5-132)", async () => {
    const t = await setup();
    const body = await (await t.summaries(`?ids=${OTHER},${MISSING},${A2},${A2}`)).json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([OTHER, A2]);
    expect(body.missing).toEqual([MISSING]);
    expect(body.items[0]).toMatchObject({ supplyTypes: ["고령자"], districts: ["하남 교산"], status: "open" });
  });

  it("형식이 틀리거나 비었거나 100개를 넘으면 400", async () => {
    const t = await setup();
    expect((await t.summaries("?ids=abc")).status).toBe(400);
    expect((await t.summaries("")).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => `3f2c1a9e-0000-4000-8000-${String(i).padStart(12, "0")}`).join(",");
    expect((await t.summaries(`?ids=${many}`)).status).toBe(400);
    expect(parseIds(` ${A2} , ,${A2}`)).toEqual([A2]);
  });
});

describe("GET /api/notices/[id]/calendar", () => {
  it("인증 없이 .ics를 준다", async () => {
    const t = await setup();
    const res = await t.calendar(A2);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="cheongyak-3f2c1a9e.ics"');
    const lines = unfoldIcs(await res.text());
    expect(lines).toContain("DTSTART;VALUE=DATE:20261020");
    expect(lines).toContain("URL:https://apply.lh.or.kr/x");
  });

  it("없는 공고·형식이 틀린 ID는 404", async () => {
    const t = await setup();
    expect((await t.calendar(MISSING)).status).toBe(404);
    expect((await t.calendar("x")).status).toBe(404);
  });
});

describe("서버 프로필의 관심 지역 (변경 2)", () => {
  it("평문 prefs.regions를 읽고, 형식이 틀리면 빈 목록", () => {
    const stored = (regions: unknown) => ({ data: { prefs: { districtIds: [], regions } } }) as unknown as Parameters<typeof interestRegions>[0];
    expect(interestRegions(stored([{ sido: "서울", sigungu: "강서구" }]))).toEqual([{ sido: "서울", sigungu: "강서구" }]);
    expect(interestRegions(stored([{ sido: "부산", sigungu: null }]))).toEqual([]);
    expect(interestRegions(null)).toEqual([]);
  });
});

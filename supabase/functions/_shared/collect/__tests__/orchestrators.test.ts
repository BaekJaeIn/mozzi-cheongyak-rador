// 예시 기반 통합 테스트 — collect·analyze 오케스트레이터 (가짜 의존성, NFR-U3-24)
import { describe, expect, it } from "vitest";
import { parseCollectGroup, runCollect } from "../collect-orchestrator.ts";
import { runAnalyze } from "../analyze-orchestrator.ts";
import {
  CLAIM_EXPIRE_MS,
  createMemoryCollectRepo,
  fakeClock,
  fakeExtractor,
  fakePdf,
  fakeRecomputer,
  mockCollectors,
  TODAY,
} from "../../__tests__/collect-fakes.ts";
import { STANDARD_REQUIREMENTS } from "../../eligibility/reference-data.ts";

async function collectOnce(repoBox = createMemoryCollectRepo(), collectors = mockCollectors()) {
  const recomputer = fakeRecomputer();
  const summary = await runCollect({ collectors, repo: repoBox.repo, recomputer, clock: fakeClock() }, { runId: "r1", today: TODAY });
  return { ...repoBox, summary, recomputer };
}

function analyzeOnce(box: ReturnType<typeof createMemoryCollectRepo>, opts: { extractor?: ReturnType<typeof fakeExtractor>; pdf?: ReturnType<typeof fakePdf>; clock?: ReturnType<typeof fakeClock>; cutoffMs?: number } = {}) {
  const clock = opts.clock ?? fakeClock();
  const extractor = opts.extractor ?? fakeExtractor();
  const recomputer = fakeRecomputer();
  return runAnalyze(
    { repo: box.repo, pdf: opts.pdf ?? fakePdf(), extractor, recomputer, clock },
    { runId: "a1", today: TODAY, startedAtMs: clock.nowMs(), ...(opts.cutoffMs !== undefined ? { cutoffMs: opts.cutoffMs } : {}) },
  ).then((summary) => ({ summary, extractor, recomputer }));
}

const titles = (box: ReturnType<typeof createMemoryCollectRepo>) => [...box.notices.values()].map((n) => n.bundle.notice.title).sort();

describe("runCollect", () => {
  it("목업 전체 흐름: 수도권 범위(지구 밖 포함, 변경 2), 교산 A2 묶기, 표준 요건·pending 저장, 재계산", async () => {
    const box = await collectOnce();
    expect(titles(box)).toEqual([
      "[하남교산] A-2BL 뉴:홈 공공분양 입주자모집", // LH 대표, 청약홈과 묶임
      "고양창릉 S-3블록 국민임대 예비입주자 모집",
      "남양주왕숙 행복주택 입주자 모집",
      "인천계양 A10블록 민간 아파트",
      "판교 대장지구 민간분양", // 지구 밖이어도 수도권이면 저장 (BR-U3-C2)
      "하남미사 행복주택 추가모집",
      "강서구 고령자복지주택 입주자 모집공고", // SH (변경 2)
    ].sort());
    const regionsOf = (title: string) => [...box.notices.values()].find((n) => n.bundle.notice.title === title)!.bundle.notice.regions;
    expect(regionsOf("판교 대장지구 민간분양")).toEqual([{ sido: "경기", sigungu: "성남시" }]); // "성남시 분당구" → 성남시
    expect(regionsOf("고양창릉 S-3블록 국민임대 예비입주자 모집")).toEqual([{ sido: "경기", sigungu: "고양시" }]);
    expect(regionsOf("인천계양 A10블록 민간 아파트")).toEqual([{ sido: "인천", sigungu: "계양구" }]);
    expect(regionsOf("남양주왕숙 행복주택 입주자 모집")).toEqual([{ sido: "경기", sigungu: "남양주시" }]); // GH "경기도"뿐이지만 지구 지역(BR-U3-C8)
    expect(regionsOf("강서구 고령자복지주택 입주자 모집공고")).toEqual([{ sido: "서울", sigungu: "강서구" }]);
    const gyosan = [...box.notices.values()].find((n) => n.bundle.notice.dedup_key.startsWith("gyosan|A2|"))!;
    expect(gyosan.bundle.sources.map((s) => s.source).sort()).toEqual(["applyhome", "lh_rental"]);
    expect(gyosan.summaryStatus).toBe("pending");
    expect(gyosan.bundle.units[0]!.requirements).toEqual(STANDARD_REQUIREMENTS.public_sale_general);
    expect(box.summary).toMatchObject({ saved: 7, changed: 7, saveErrors: 0 });
    expect(box.recomputer.calls).toBe(1);
  });

  it("지구 후보 경고(하남 미사)와 소스별·전체 기록", async () => {
    const box = await collectOnce();
    const lh = box.runs.find((r) => r.source === "lh_rental")!;
    expect(lh.warning).toContain("하남미사 행복주택 추가모집");
    expect(box.runs.map((r) => r.source)).toEqual(["applyhome", "lh_rental", "gh", "sh", "all"]);
  });

  it("같은 데이터로 다시 실행하면 저장하지 않는다 (멱등, BR-U3-51)", async () => {
    const box = await collectOnce();
    const again = await collectOnce(box);
    expect(again.summary).toMatchObject({ changed: 0, saved: 0 });
  });

  it("소스 하나가 실패해도 나머지는 저장, 오류에 API 키 없음 (BR-U3-01·72)", async () => {
    const box = await collectOnce(createMemoryCollectRepo(), mockCollectors({ fail: ["lh_rental"] }));
    expect(titles(box)).toContain("남양주왕숙 행복주택 입주자 모집");
    const lh = box.runs.find((r) => r.source === "lh_rental")!;
    expect(lh.ok).toBe(false);
    expect(lh.error).not.toContain("SECRET");
  });

  it("GH 0건이면 경고 (BR-U3-71)", async () => {
    const box = await collectOnce(createMemoryCollectRepo(), mockCollectors({ empty: ["gh"] }));
    expect(box.runs.find((r) => r.source === "gh")!.warning).toContain("GH 0건");
  });

  it("소스가 시간 상한을 넘으면 그 소스만 실패", async () => {
    const box = createMemoryCollectRepo();
    const summary = await runCollect(
      { collectors: mockCollectors({ hang: ["gh"] }), repo: box.repo, recomputer: fakeRecomputer(), clock: fakeClock() },
      { runId: "r", today: TODAY, budgets: { gh: 10 } },
    );
    expect(summary.sources.find((s) => s.source === "gh")).toMatchObject({ ok: false });
    expect(summary.saved).toBe(6);
  }, 15_000);
});

describe("runCollect — 두 묶음 (변경 2 P-U3-C1·C2)", () => {
  const run = (box: ReturnType<typeof createMemoryCollectRepo>, group: "api" | "crawl" | null) => {
    const recomputer = fakeRecomputer();
    return runCollect({ collectors: mockCollectors(), repo: box.repo, recomputer, clock: fakeClock() }, { runId: "g", today: TODAY, group }).then((summary) => ({ summary, recomputer }));
  };

  it("api 묶음은 청약홈·LH만, crawl 묶음은 GH·SH만 돈다", async () => {
    const box = createMemoryCollectRepo();
    const api = await run(box, "api");
    expect(api.summary.sources.map((s) => s.source)).toEqual(["applyhome", "lh_rental"]);
    const crawl = await run(box, "crawl");
    expect(crawl.summary.sources.map((s) => s.source)).toEqual(["gh", "sh"]);
    expect(JSON.parse(box.runs.at(-1)!.warning!).group).toBe("crawl");
  });

  it("api 묶음은 저장한 공고가 있을 때만 재계산, crawl 묶음·전체는 항상", async () => {
    const box = createMemoryCollectRepo();
    expect((await run(box, "api")).recomputer.calls).toBe(1); // 새 공고 저장
    expect((await run(box, "api")).recomputer.calls).toBe(0); // 바뀐 것 없음
    expect((await run(box, "crawl")).recomputer.calls).toBe(1);
    expect((await run(box, "crawl")).recomputer.calls).toBe(1);
    expect((await run(box, null)).recomputer.calls).toBe(1);
  });

  it("묶음 이름 읽기: 모르는 값은 전체", () => {
    expect(parseCollectGroup("api")).toBe("api");
    expect(parseCollectGroup("crawl")).toBe("crawl");
    expect(parseCollectGroup("x")).toBeNull();
    expect(parseCollectGroup(undefined)).toBeNull();
  });
});

describe("runAnalyze", () => {
  it("마감이 가까운 공고부터 2건 처리, 요약·추출 요건 저장, 재계산", async () => {
    const box = await collectOnce();
    const { summary, recomputer } = await analyzeOnce(box);
    expect(summary.claimed).toBe(2);
    // 마감 임박 순: 왕숙 행복(+6) → 교산 A2(+7)
    const done = summary.outcomes.filter((o) => o.status === "done").map((o) => box.notices.get(o.noticeId)!.bundle.notice.title);
    expect(done).toEqual(["남양주왕숙 행복주택 입주자 모집", "[하남교산] A-2BL 뉴:홈 공공분양 입주자모집"]);
    const wangsuk = [...box.notices.values()].find((n) => n.bundle.notice.title.startsWith("남양주왕숙"))!;
    expect(wangsuk).toMatchObject({ summaryStatus: "done", aiAttempts: 1, claimedAt: null, aiSourceUrl: "mock://pdf/wangsuk-happy.pdf" });
    expect(wangsuk.bundle.units).toHaveLength(2);
    expect(wangsuk.summary?.eligibilityPlain).toContain("만 65세");
    expect(recomputer.calls).toBe(1);
  });

  it("PDF가 없으면 실패로 세고, 3번 실패하면 더 고르지 않는다 (BR-U3-55)", async () => {
    const box = await collectOnce();
    const clock = fakeClock();
    for (let i = 0; i < 6; i++) await analyzeOnce(box, { clock });
    const gyeyang = [...box.notices.values()].find((n) => n.bundle.notice.title.startsWith("인천계양"))!;
    expect(gyeyang).toMatchObject({ summaryStatus: "failed", aiAttempts: 3 });
    const before = gyeyang.aiAttempts;
    await analyzeOnce(box, { clock });
    expect(gyeyang.aiAttempts).toBe(before);
  });

  it("처리할 공고가 없으면 Gemini·재계산을 부르지 않는다", async () => {
    const { summary, extractor, recomputer } = await analyzeOnce(createMemoryCollectRepo());
    expect(summary.claimed).toBe(0);
    expect(extractor.calls).toBe(0);
    expect(recomputer.calls).toBe(0);
  });

  it("잘린 JSON·공고문 아님은 실패 코드로 기록", async () => {
    const box = await collectOnce();
    const { summary } = await analyzeOnce(box, { extractor: fakeExtractor((url) => (url.includes("wangsuk") ? "{\"isNot" : { isNotice: false })) });
    expect(summary.outcomes.map((o) => (o.status === "failed" ? o.code : o.status)).sort()).toEqual(["invalid_json", "not_notice"]);
  });

  it("시간 예산을 넘기면 두 번째 공고는 미루고(실패 아님) 예약을 푼다", async () => {
    const box = await collectOnce();
    const clock = fakeClock();
    const extractor = fakeExtractor();
    const slow = { ...extractor, extract: async (input: Parameters<typeof extractor.extract>[0]) => (clock.advance(80_000), extractor.extract(input)) };
    const { summary } = await analyzeOnce(box, { clock, extractor: slow as typeof extractor });
    expect(summary.outcomes.map((o) => o.status)).toEqual(["done", "deferred"]);
    const deferred = box.notices.get(summary.outcomes[1]!.noticeId)!;
    expect(deferred).toMatchObject({ claimedAt: null, aiAttempts: 0, summaryStatus: "pending" });
  });

  it("예약은 10분 동안 다른 실행이 가져가지 않는다 (P-U3-R3)", async () => {
    const box = await collectOnce();
    const now = new Date("2026-10-15T00:00:00Z");
    const first = await box.repo.claimForAnalysis(2, now);
    const second = await box.repo.claimForAnalysis(2, new Date(now.getTime() + 60_000));
    expect(second.filter((id) => first.includes(id))).toEqual([]);
    const later = await box.repo.claimForAnalysis(10, new Date(now.getTime() + CLAIM_EXPIRE_MS + 1));
    expect(later).toEqual(expect.arrayContaining(first));
  });

  it("분석이 끝난 공고가 바뀌면 표준 요건으로 되돌리고 요약은 남긴다 (P-U3-R4)", async () => {
    const box = await collectOnce();
    await analyzeOnce(box);
    const wangsuk = () => [...box.notices.values()].find((n) => n.bundle.notice.title.startsWith("남양주왕숙"))!;
    expect(wangsuk().bundle.units).toHaveLength(2);
    const summaryBefore = wangsuk().summary;

    // 원천 일정이 바뀜 (정정 공고)
    const changed = mockCollectors().map((c) =>
      c.source !== "gh"
        ? c
        : { source: c.source, collect: async (ctx: Parameters<typeof c.collect>[0]) => {
            const r = await c.collect(ctx);
            return { ...r, notices: r.notices.map((n) => ({ ...n, dates: { ...n.dates, applyEnd: "2026-10-30" } })) };
          } },
    );
    await collectOnce(box, changed);
    expect(wangsuk()).toMatchObject({ summaryStatus: "pending", aiAttempts: 0 });
    expect(wangsuk().bundle.units).toHaveLength(1);
    expect(wangsuk().summary).toEqual(summaryBefore);
  });
});

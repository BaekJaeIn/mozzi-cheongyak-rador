// 통합 테스트 — Collector 흐름 (쪽 넘김, 첫 쪽 실패 = 소스 실패, 상세 실패 격리, 시간 상한, GH 대기열, API 키 비노출)
import { describe, expect, it } from "vitest";
import { applyhomeCollector, ghCollector, lhCollector, mockCollectorSet, mockExtractor, mockPdfFetcher, serviceKeyParam, type HttpGet } from "../collectors.ts";
import { parseExtraction } from "../extraction.ts";
import {
  SYNTHETIC_APPLYHOME,
  SYNTHETIC_GH_DETAIL,
  SYNTHETIC_GH_MAIN,
  SYNTHETIC_GH_QUEUE,
  SYNTHETIC_LH_DETAIL,
  SYNTHETIC_LH_LIST,
} from "../../__tests__/fixtures/collect/synthetic.ts";

const TODAY = "2026-10-15";
const KEY = "ab+c/d==";

type Route = (url: string) => string | Error;

function fakeHttp(route: Route): HttpGet & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async getText(url) {
      urls.push(url);
      const out = route(url);
      if (out instanceof Error) throw out;
      return out;
    },
  };
}

const ctx = (deadline = Number.MAX_SAFE_INTEGER) => ({ today: TODAY, deadline });
const clock = (ms = 0) => () => ms;

describe("청약홈 collector", () => {
  it("행이 perPage보다 적으면 한 쪽만, 키는 인코딩", async () => {
    const http = fakeHttp(() => JSON.stringify(SYNTHETIC_APPLYHOME));
    const res = await applyhomeCollector(KEY, { http, nowMs: clock() }).collect(ctx());
    expect(res.notices.map((n) => n.sourceNoticeNo)).toEqual(["2026000101", "2026000103"]);
    expect(http.urls).toHaveLength(1);
    expect(http.urls[0]).toContain(`serviceKey=${encodeURIComponent(KEY)}&page=1&perPage=100`);
  });

  it("첫 쪽 실패는 소스 실패", async () => {
    const http = fakeHttp(() => new Error("HTTP 500"));
    await expect(applyhomeCollector(KEY, { http, nowMs: clock() }).collect(ctx())).rejects.toThrow("HTTP 500");
  });

  it("시간이 없으면 요청하지 않고 경고", async () => {
    const http = fakeHttp(() => "{}");
    const res = await applyhomeCollector(KEY, { http, nowMs: clock(10_000) }).collect(ctx(10_500));
    expect(http.urls).toHaveLength(0);
    expect(res.warnings[0]).toContain("시간 상한");
  });

  it("이미 인코딩된 키는 그대로", () => {
    expect(serviceKeyParam("ab%2Bc")).toBe("ab%2Bc");
    expect(serviceKeyParam("ab+c")).toBe("ab%2Bc");
  });
});

describe("LH collector", () => {
  it("목록 + 상세로 접수 시작·발표일·첨부 채움, 조회 기간은 오늘 기준", async () => {
    const http = fakeHttp((url) => JSON.stringify(url.includes("Dtl") ? SYNTHETIC_LH_DETAIL : SYNTHETIC_LH_LIST));
    const res = await lhCollector(KEY, { http, nowMs: clock() }).collect(ctx());
    expect(res.notices).toHaveLength(1);
    expect(res.notices[0]!.dates).toMatchObject({ applyStart: "2026-10-20", resultAt: "2026-11-05" });
    expect(res.notices[0]!.attachments).toHaveLength(2);
    expect(http.urls[0]).toContain("PAN_NT_ST_DT=20260418&CLSG_DT=20271015");
    expect(res.warnings).toEqual([]);
  });

  it("상세 실패는 경고만, 목록 정보로 계속", async () => {
    const http = fakeHttp((url) => (url.includes("Dtl") ? "<returnReasonCode>30</returnReasonCode>" : JSON.stringify(SYNTHETIC_LH_LIST)));
    const res = await lhCollector(KEY, { http, nowMs: clock() }).collect(ctx());
    expect(res.notices).toHaveLength(1);
    expect(res.notices[0]!.attachments).toEqual([]);
    expect(res.warnings).toEqual(["상세 실패 1건"]);
  });

  it("첫 쪽이 오류 봉투면 소스 실패, 오류 문구에 키 없음", async () => {
    const http = fakeHttp(() => "<OpenAPI_ServiceResponse><returnReasonCode>30</returnReasonCode>");
    const error = await lhCollector(KEY, { http, nowMs: clock() }).collect(ctx()).catch((e: Error) => e);
    expect(String(error)).toContain("오류 봉투");
    expect(String(error)).not.toContain(KEY);
  });
});

describe("GH collector", () => {
  it("카드 + 상세 첨부", async () => {
    const http = fakeHttp((url) => (url.includes("selectMainView") ? SYNTHETIC_GH_MAIN : SYNTHETIC_GH_DETAIL));
    const res = await ghCollector({ http, nowMs: clock() }).collect(ctx());
    expect(res.notices).toHaveLength(1);
    expect(res.notices[0]!.attachments[0]!.name).toContain("입주자모집공고문");
  });

  it("대기열이면 빈 결과 + 경고 (소스 실패 아님)", async () => {
    const http = fakeHttp(() => SYNTHETIC_GH_QUEUE);
    const res = await ghCollector({ http, nowMs: clock() }).collect(ctx());
    expect(res).toEqual({ notices: [], warnings: ["대기열(NetFunnel) 활성 — 이번 실행 건너뜀"] });
  });

  it("상세 실패는 경고만", async () => {
    const http = fakeHttp((url) => (url.includes("selectMainView") ? SYNTHETIC_GH_MAIN : new Error("timeout")));
    const res = await ghCollector({ http, nowMs: clock() }).collect(ctx());
    expect(res.notices).toHaveLength(1);
    expect(res.warnings).toEqual(["상세(첨부) 실패 1건"]);
  });
});

describe("목업", () => {
  it("목업 collector·PDF·추출이 이어진다", async () => {
    const [, , gh] = mockCollectorSet();
    const { notices } = await gh!.collect(ctx());
    const pdf = await mockPdfFetcher.fetchPdf(notices[0]!.attachments[0]!.url);
    const raw = await mockExtractor.extract({ pdf, title: "", supplyTypeHint: "" });
    expect(parseExtraction(raw)?.units.length).toBeGreaterThan(0);
    await expect(mockPdfFetcher.fetchPdf("https://real.example/a.pdf")).rejects.toThrow();
  });
});

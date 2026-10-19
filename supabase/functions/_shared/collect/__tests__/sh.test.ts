// 예시 기반 테스트 — SH 실제 화면 사본 real-sh-* (변경 2, 2026-10-19) + 수집기 흐름 (가짜 HTTP)
// SH 화면이 바뀌어 실제 수집이 깨지면: 다시 받아 사본을 고치고(전화번호·이메일 가림) 기대값을 맞춘다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shCollector, SH_DETAIL_MAX } from "../collectors.ts";
import { pickNoticePdf } from "../pdf-locator.ts";
import {
  isShExcluded,
  isShListPage,
  parseShAttachments,
  parseShDetail,
  parseShList,
  SH_BOARDS,
  shCardToRaw,
  shSigunguFromTitle,
} from "../parsers/sh.ts";

const real = (name: string) => readFileSync(new URL(`../../__tests__/fixtures/collect/${name}`, import.meta.url), "utf8");

describe("SH 실제 화면", () => {
  it("임대 목록: 모집공고 10건, 글번호·제목·등록일", () => {
    const cards = parseShList(real("real-sh-rent-list.html"));
    expect(cards).toHaveLength(10);
    expect(new Set(cards.map((c) => c.seq)).size).toBe(10);
    expect(cards[2]).toEqual({ seq: "311349", title: "은평구 홀몸어르신 은빛주택(수요자맞춤형) 잔여세대 모집 공고", registeredAt: "2026-10-12" });
    expect(isShListPage(real("real-sh-rent-list.html"))).toBe(true);
  });

  it("제외어: 결과·안내 글은 빼고, [정정]도 뺀다 (BR-U3-C11)", () => {
    const rent = parseShList(real("real-sh-rent-list.html")).filter((c) => isShExcluded(c.title)).map((c) => c.seq);
    expect(rent).toEqual(["311200"]); // "…1순위 청약접수 결과 및 2순위 청약접수 안내"
    const sale = parseShList(real("real-sh-sale-list.html"));
    expect(sale.find((c) => c.seq === "301479")!.title).toContain("[정정]");
    expect(isShExcluded(sale.find((c) => c.seq === "301479")!.title)).toBe(true);
    expect(isShExcluded("고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고")).toBe(false);
  });

  it("임대 상세: 본문의 모집공고일·접수기간·당첨자 발표, 첨부는 hwpx라 PDF 없음", () => {
    expect(parseShDetail(real("real-sh-rent-detail.html"))).toEqual({
      announcedAt: "2026-10-12",
      applyStart: "2026-10-26",
      applyEnd: "2026-11-06",
      resultAt: "2026-11-19",
      attachments: [],
    });
  });

  it("분양 상세: PDF 첨부 4개 → 공고문을 고른다, 다운로드 주소 형식", () => {
    const attachments = parseShAttachments(real("real-sh-sale-detail.html"));
    expect(attachments).toHaveLength(4);
    expect(attachments[0]).toEqual({
      name: "고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고문.pdf",
      url: "https://www.i-sh.co.kr/main/com/file/innoFD.do?brdId=GS0401&seq=311656&fileTp=A&fileSeq=1",
    });
    expect(pickNoticePdf(attachments)?.name).toContain("입주자모집공고문");
  });

  it("제목의 서울 구 이름 → 시군구, 지구 이름만 있으면 null (AI가 고침)", () => {
    expect(shSigunguFromTitle("은평구 홀몸어르신 은빛주택(수요자맞춤형) 잔여세대 모집 공고")).toBe("은평구");
    expect(shSigunguFromTitle("고덕강일지구 3단지 토지임대부 분양주택 입주자모집공고")).toBeNull();
    expect(shSigunguFromTitle("2026년 하반기 신혼·신생아 매입임대주택Ⅰ 입주자 모집공고")).toBeNull();
  });

  it("원천 공고: 서울·임대, 원문은 GET 상세 주소, 일정이 없으면 공고일 = 등록일", () => {
    const [board] = SH_BOARDS;
    const raw = shCardToRaw(board!, { seq: "1", title: "강동구 행복주택 입주자 모집공고", registeredAt: "2026-10-01" }, null);
    expect(raw).toMatchObject({
      source: "sh",
      location: "서울특별시",
      sigungu: "강동구",
      tenureHint: "rent",
      originalUrl: "https://www.i-sh.co.kr/main/lay2/program/S1T297C4476/www/brd/m_247/view.do?seq=1",
    });
    expect(raw.dates.announcedAt).toBe("2026-10-01");
  });

  it("대기열·오류 화면은 목록으로 보지 않는다", () => {
    expect(isShListPage("<html><body>잠시 후 다시 시도해 주세요</body></html>")).toBe(false);
  });
});

/** 가짜 HTTP: 주소별 응답, 요청 순서 기록 */
function fakeHttp(routes: (url: string) => string) {
  const calls: string[] = [];
  return { calls, http: { getText: async (url: string) => (calls.push(url), routes(url)) } };
}

const LIST_ROW = (seq: string, title: string, date = "2026-10-10") =>
  `<tr><td>1</td><td class="txtL"><a href="#" class="ellipsis " onclick="javascript:getDetailView('${seq}');return false;"> ${title} </a></td><td>부서</td><td class="num"> ${date} </td><td class="num">1</td></tr>`;
const list = (...rows: string[]) => `<table><tbody>${rows.join("")}</tbody></table>`;

describe("SH 수집기 흐름 (NFR-U3-C5~C8)", () => {
  const ctx = (known?: Map<string, string>) => ({ today: "2026-10-19", deadline: Date.now() + 35_000, ...(known ? { knownTitles: known } : {}) });

  it("새 글만 상세를 읽고, 저장된 같은 제목 글은 건너뛰며, 오래된 글·제외어 글은 뺀다", async () => {
    const { calls, http } = fakeHttp((url) => {
      if (url.includes("list.do") && url.includes("multi_itm_seq=2") && url.includes("page=1"))
        return list(LIST_ROW("10", "강서구 행복주택 입주자 모집공고"), LIST_ROW("11", "마포구 매입임대 모집공고"), LIST_ROW("12", "재개발임대 청약접수 결과"), LIST_ROW("13", "아주 오래된 모집공고", "2026-01-02"));
      if (url.includes("list.do")) return list();
      return "<p>■ 접수기간 : 2026.10.20 ~ 2026.10.25</p>";
    });
    const r = await shCollector({ http, nowMs: Date.now, sleep: async () => {} }).collect(ctx(new Map([["11", "마포구 매입임대 모집공고"]])));
    expect(r.notices.map((n) => n.sourceNoticeNo)).toEqual(["10"]);
    expect(r.notices[0]!.dates).toMatchObject({ applyStart: "2026-10-20", applyEnd: "2026-10-25" });
    expect(calls.filter((u) => u.includes("view.do"))).toHaveLength(1);
    expect(r.warnings.join()).toContain("모집공고 아닌 글 1건 제외, 저장된 글 1건 건너뜀");
  });

  it("상세는 한 번에 최대 15건, 넘치면 다음 실행으로 — 요청 사이 1초 쉼", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => LIST_ROW(String(100 + i), `강서구 모집공고 ${i}`));
    const { calls, http } = fakeHttp((url) => (url.includes("list.do") ? (url.includes("multi_itm_seq=2&itm_seq_1=1&page=1") ? list(...rows) : list()) : "<p>본문</p>"));
    const gaps: number[] = [];
    const r = await shCollector({ http, nowMs: Date.now, sleep: async (ms) => void gaps.push(ms) }).collect(ctx());
    expect(r.notices).toHaveLength(SH_DETAIL_MAX);
    expect(r.warnings.join()).toContain("상세 5건은 다음 실행에");
    expect(gaps.length).toBe(calls.length - 1);
    expect(gaps.every((ms) => ms === 1_000)).toBe(true);
  });

  it("두 게시판 목록을 먼저 다 읽고, 상세는 최근 등록 순 — 임대 글이 많아도 분양 새 글을 놓치지 않는다", async () => {
    const rent = Array.from({ length: 20 }, (_, i) => LIST_ROW(String(200 + i), `강서구 임대 모집공고 ${i}`, "2026-10-01"));
    const { calls, http } = fakeHttp((url) => {
      if (url.includes("m_247/list.do") && url.includes("page=1")) return list(...rent);
      if (url.includes("m_244/list.do") && url.includes("page=1")) return list(LIST_ROW("900", "고덕강일지구 3단지 분양주택 입주자모집공고", "2026-10-16"));
      if (url.includes("list.do")) return list();
      return "<p>본문</p>";
    });
    const r = await shCollector({ http, nowMs: Date.now, sleep: async () => {} }).collect(ctx());
    expect(calls.findIndex((u) => u.includes("view.do"))).toBeGreaterThan(calls.findIndex((u) => u.includes("m_244/list.do")));
    expect(r.notices[0]!.sourceNoticeNo).toBe("900");
    expect(r.notices[0]!.tenureHint).toBe("sale");
  });

  it("목록이 대기열·차단 화면이면 그 게시판을 건너뛰고 경고", async () => {
    const { http } = fakeHttp(() => "<html>대기 중입니다</html>");
    const r = await shCollector({ http, nowMs: Date.now, sleep: async () => {} }).collect(ctx());
    expect(r.notices).toEqual([]);
    expect(r.warnings.join()).toContain("정상 화면이 아님");
  });

  it("정상 목록인데 0건이면 구조 변경 의심 경고 (BR-U3-C16)", async () => {
    const { http } = fakeHttp(() => "<table><tbody></tbody></table> 게시물이 없습니다");
    const r = await shCollector({ http, nowMs: Date.now, sleep: async () => {} }).collect(ctx());
    expect(r.warnings.join()).toContain("SH 0건");
  });
});

// 예시 기반 테스트 — 실제 응답 픽스처 real-* (Step 12, scripts/capture-fixtures.mjs로 2026-10-15 캡처)
// 원천이 바뀌어 실제 수집이 깨지면: 다시 캡처 → 이 테스트의 기대값을 새 응답에 맞춰 고친다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchDistricts } from "../../domain/district-matcher.ts";
import { DISTRICTS } from "../../eligibility/reference-data.ts";
import { parseApplyhomePage } from "../parsers/applyhome.ts";
import { ghCardToRaw, ghNetFunnelActive, parseGhAttachments, parseGhCards } from "../parsers/gh.ts";
import { isLhErrorBody, parseLhDetail, parseLhListPage } from "../parsers/lh.ts";
import { htmlToText } from "../parsers/html.ts";
import { pickNoticePdf } from "../pdf-locator.ts";

const real = (name: string) => readFileSync(new URL(`../../__tests__/fixtures/collect/${name}`, import.meta.url), "utf8");
const GH_FILES = ["real-gh-main.html", "real-gh-detail-sr7150.html", "real-gh-detail-sr7155.html"];

describe("GH 실제 응답", () => {
  const main = real("real-gh-main.html");
  const cards = parseGhCards(main);
  const card = (no: string) => cards.find((c) => c.pbancNo === no)!;

  it("메인: 카드 12건, 번호 중복 없음, 제목에 문자 참조가 남지 않는다", () => {
    expect(cards).toHaveLength(12);
    expect(new Set(cards.map((c) => c.pbancNo)).size).toBe(12);
    expect(cards.every((c) => c.title.length > 0 && !/&#?\w+;/.test(c.title))).toBe(true);
    expect(card("823").title).toBe("'26년 경기도형 창업특화주택 입주자 모집 공고(운영기관 : 나눔과미래)");
  });

  it("메인: 신청기간 — 정상·끝 없음·빈 값", () => {
    expect(card("793")).toMatchObject({ bizTyCd: "08", applyStart: "2026-06-16", applyEnd: "2026-06-19" });
    expect(card("811")).toMatchObject({ applyStart: "2026-09-01", applyEnd: null });
    expect(card("792")).toMatchObject({ applyStart: null, applyEnd: null });
  });

  it("메인: 상세 주소는 사업 유형별 경로 (매입임대 06 → sr7155, 그 밖 → sr7150)", () => {
    expect(ghCardToRaw(card("792")).originalUrl).toBe("https://apply.gh.or.kr/sb/sr/sr7155/selectPbancDetailView.do?pbancNo=792");
    expect(ghCardToRaw(card("793")).originalUrl).toBe("https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=793");
  });

  it("메인: 지금 GH 공고 중 3기 신도시 공고는 없다 — 제목만으로 잘못 매칭되지 않는다 (OI-U2-1)", () => {
    for (const c of cards) {
      const raw = ghCardToRaw(c);
      expect(matchDistricts({ title: raw.title, location: raw.location }, DISTRICTS), raw.title).toEqual([]);
    }
  });

  it("메인: 대기열 비활성", () => {
    expect(ghNetFunnelActive(main)).toBe(false);
  });

  it("상세(sr7150): 공고문 PDF 하나 — 크기 표기는 이름에서 뺀다", () => {
    const page = "https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=811";
    const attachments = parseGhAttachments(real("real-gh-detail-sr7150.html"), page);
    expect(attachments).toEqual([
      {
        name: "연천BIX 경기행복주택 기업체 기숙사 추가모집 공고(안)_최종_1.pdf",
        url: "https://apply-cdn.gh.or.kr/sr/sr7150/selectFileDown.do?pbancNo=811&atchFileSn=1723006&atchFileDtlSn=3&mode=1&v=20260821095133",
      },
    ]);
    expect(pickNoticePdf(attachments)).toEqual(attachments[0]);
  });

  it("상세(sr7155): PDF 첨부만 (hwp 제외), 공고문을 고른다", () => {
    const page = "https://apply.gh.or.kr/sb/sr/sr7155/selectPbancDetailView.do?pbancNo=792";
    const attachments = parseGhAttachments(real("real-gh-detail-sr7155.html"), page);
    expect(attachments.length).toBeGreaterThanOrEqual(2);
    for (const a of attachments) {
      expect(a.name).toMatch(/\.pdf$/);
      expect(a.url.startsWith("https://apply-cdn.gh.or.kr/sr/sr7155/selectFileDown.do?pbancNo=792&")).toBe(true);
    }
    expect(pickNoticePdf(attachments)?.name).toBe("2026년 GH Care Hub 특화형 매입임대주택(일반) 부천. 김포 입주자 모집 공고문_수정게시.pdf");
  });

  it("픽스처에 전화번호·이메일·스크립트가 남아 있지 않다", () => {
    for (const f of GH_FILES) {
      const text = real(f);
      expect(text).not.toMatch(/\b0(?!00-0000-0000)\d{1,3}-\d{3,4}-\d{4}\b/);
      expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@(?!example\.invalid)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      expect(text).not.toMatch(/<script/i);
    }
  });
});

describe("청약홈 실제 응답", () => {
  const json = JSON.parse(real("real-applyhome.json")) as { data: Record<string, unknown>[] };
  const page = parseApplyhomePage(json);
  const notice = (no: string) => page.notices.find((n) => n.sourceNoticeNo === no)!;

  it("행 40건 모두 경기·인천 (캡처 때 경기·인천을 앞에 둠), 첨부 없음", () => {
    expect(page.rowCount).toBe(40);
    expect(page.notices).toHaveLength(40);
    expect(page.notices.every((n) => n.attachments.length === 0 && n.originalUrl.startsWith("https://www.applyhome.co.kr/"))).toBe(true);
  });

  it("필드 매핑: 신혼희망타운 공공분양 (특별공급 시작이 접수 시작)", () => {
    const row = json.data.find((r) => r.PBLANC_NO === "2026820010")!;
    expect(notice("2026820010")).toMatchObject({
      title: "인천계양 A17블록 신혼희망타운(공공분양)(본청약)",
      supplyTypeText: "분양주택 국민 신혼희망타운",
      tenureHint: "sale",
      dates: { applyStart: row.SPSPLY_RCEPT_BGNDE ?? row.RCEPT_BGNDE, applyEnd: "2026-10-27" },
    });
  });

  it("지구 매칭: 인천계양 2건만 계양 — 경계의 '부천시 대장동'·진접2지구는 매칭하지 않는다 (BR-U2-07)", () => {
    const matched = page.notices
      .map((n) => [n.sourceNoticeNo, matchDistricts({ title: n.title, complexName: n.complexName, location: n.location }, DISTRICTS)] as const)
      .filter(([, ids]) => ids.length > 0);
    expect(matched).toEqual([
      ["2026820010", ["gyeyang"]],
      ["2026000414", ["gyeyang"]],
    ]);
  });
});

describe("LH 실제 응답", () => {
  const list = JSON.parse(real("real-lh-list.json"));
  const detail = JSON.parse(real("real-lh-detail-1.json"));

  it("목록: 100행 중 경기·인천 주택 공고만 (토지·상가·다른 시도 제외)", () => {
    const { rowCount, candidates } = parseLhListPage(list);
    expect(rowCount).toBe(100);
    expect(candidates.map((c) => c.notice.sourceNoticeNo)).toEqual(["2015122300020880"]);
    expect(candidates[0]!.detailParams).toEqual({
      PAN_ID: "2015122300020880",
      CCR_CNNT_SYS_DS_CD: "03",
      SPL_INF_TP_CD: "135",
      UPP_AIS_TP_CD: "13",
      AIS_TP_CD: "26",
    });
    expect(candidates[0]!.notice).toMatchObject({ supplyTypeText: "주거복지 매입임대", dates: { applyEnd: "2026.10.23" } }); // 원천 형식 그대로, normalize의 parseSchedule이 바꾼다
  });

  it("상세: 접수 시작은 ACP_DTTM이 비면 SBSC_ACP_ST_DT, 열 이름 행은 첨부에서 빠진다", () => {
    const d = parseLhDetail(detail);
    expect(d.applyStart).toBe("2026-10-20");
    expect(d.resultAt).toBeNull();
    expect(d.attachments).toHaveLength(4);
    expect(d.attachments.every((a) => a.url.startsWith("https://apply.lh.or.kr/lhapply/lhFile.do?fileid="))).toBe(true);
  });

  it("상세: hwp는 건너뛰고 첫 공고문(PDF)을 고른다", () => {
    expect(pickNoticePdf(parseLhDetail(detail).attachments)).toEqual({
      name: "공고문(PDF) 여기가_입주자모집공고문_5차_프리웰.pdf",
      url: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=68871365",
    });
  });

  it("오류 봉투로 오인하지 않는다", () => {
    expect(isLhErrorBody(real("real-lh-list.json"))).toBe(false);
    expect(isLhErrorBody(real("real-lh-detail-1.json"))).toBe(false);
  });
});

describe("JSON 픽스처 개인정보·키", () => {
  it("전화번호 필드는 가려져 있고, 키·serviceKey가 없다", () => {
    for (const f of ["real-applyhome.json", "real-lh-list.json", "real-lh-detail-1.json"]) {
      const text = real(f);
      expect(text).not.toMatch(/serviceKey/i);
      for (const m of text.matchAll(/"[A-Z_]*(?:TELNO|TLNO)":\s*"([^"]*)"/g)) expect(m[1]).toMatch(/^(0000000000|[^\d]*)$/);
      expect(text).not.toMatch(/\b0(?!00-0000-0000)\d{1,3}-\d{3,4}-\d{4}\b/);
    }
  });
});

describe("HTML 문자 참조", () => {
  it("숫자 참조(10진·16진)를 풀고, 범위 밖은 그대로 둔다", () => {
    expect(htmlToText("&#039;26년 &#x27;A&#39; &#99999999;")).toBe("'26년 'A' &#99999999;");
  });
});

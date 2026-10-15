// 예시 기반 테스트 — 소스 파서 (합성 샘플, Step 12 실제 응답으로 보강)
import { describe, expect, it } from "vitest";
import { parseApplyhomePage } from "../parsers/applyhome.ts";
import { isLhErrorBody, lhDetailQuery, parseLhDetail, parseLhListPage } from "../parsers/lh.ts";
import { ghCardToRaw, ghNetFunnelActive, parseGhAttachments, parseGhCards } from "../parsers/gh.ts";
import {
  SYNTHETIC_APPLYHOME,
  SYNTHETIC_GH_DETAIL,
  SYNTHETIC_GH_MAIN,
  SYNTHETIC_GH_QUEUE,
  SYNTHETIC_LH_DETAIL,
  SYNTHETIC_LH_LIST,
} from "../../__tests__/fixtures/collect/synthetic.ts";

describe("청약홈", () => {
  const page = parseApplyhomePage(SYNTHETIC_APPLYHOME);
  it("경기·인천만 남기고 행 수는 그대로 센다", () => {
    expect(page.rowCount).toBe(3);
    expect(page.notices.map((n) => n.sourceNoticeNo)).toEqual(["2026000101", "2026000103"]);
  });
  it("필드 매핑: 접수 시작은 특별공급 시작 우선, 분양 구분", () => {
    expect(page.notices[0]).toMatchObject({
      source: "applyhome",
      title: "하남교산 A2블록 공공분양",
      location: "경기도 하남시 교산동 일원",
      provider: "한국토지주택공사",
      supplyTypeText: "분양주택 국민 APT",
      tenureHint: "sale",
      dates: { announcedAt: "2026-10-13", applyStart: "2026-10-20", applyEnd: "2026-10-22", resultAt: "2026-10-30" },
      attachments: [],
    });
  });
  it("형식이 틀린 응답은 빈 결과", () => {
    expect(parseApplyhomePage({ error: "x" })).toEqual({ rowCount: 0, notices: [] });
  });
});

describe("LH", () => {
  it("목록: 주택이 아닌 공고·경기·인천 밖 제외, 상세 파라미터 보존", () => {
    const { rowCount, candidates } = parseLhListPage(SYNTHETIC_LH_LIST);
    expect(rowCount).toBe(3);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.notice).toMatchObject({
      source: "lh_rental",
      sourceNoticeNo: "2015122300012345",
      supplyTypeText: "임대주택 국민임대",
      tenureHint: "rent",
      dates: { announcedAt: "2026.10.14", applyEnd: "2026.10.29", applyStart: null },
    });
    expect(lhDetailQuery(candidates[0]!.detailParams)).toBe(
      "PAN_ID=2015122300012345&CCR_CNNT_SYS_DS_CD=03&SPL_INF_TP_CD=050&UPP_AIS_TP_CD=06&AIS_TP_CD=07",
    );
  });

  it("상세: 가장 이른 접수 시작·발표일·첨부", () => {
    expect(parseLhDetail(SYNTHETIC_LH_DETAIL)).toEqual({
      applyStart: "2026-10-20",
      resultAt: "2026-11-05",
      attachments: [
        { name: "공고문 고양창릉S3_공고문.pdf", url: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=111" },
        { name: "기타 평면도.pdf", url: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=222" },
      ],
    });
  });

  it("오류 봉투 감지", () => {
    expect(isLhErrorBody("<OpenAPI_ServiceResponse><returnReasonCode>30</returnReasonCode>")).toBe(true);
    expect(isLhErrorBody(JSON.stringify(SYNTHETIC_LH_LIST))).toBe(false);
  });
});

describe("GH", () => {
  it("카드: 중복·상가 제외, 신청기간", () => {
    const cards = parseGhCards(SYNTHETIC_GH_MAIN);
    expect(cards).toEqual([
      { pbancNo: "1234", bizTyNm: "행복주택", bizTyCd: "06", title: "남양주왕숙 행복주택 입주자 모집", applyStart: "2026-10-18", applyEnd: "2026-10-21" },
    ]);
    expect(ghCardToRaw(cards[0]!).originalUrl).toBe("https://apply.gh.or.kr/sb/sr/sr7155/selectPbancDetailView.do?pbancNo=1234");
  });

  it("대기열: 주석은 비활성, 실제 호출은 활성", () => {
    expect(ghNetFunnelActive(SYNTHETIC_GH_MAIN)).toBe(false);
    expect(ghNetFunnelActive(SYNTHETIC_GH_QUEUE)).toBe(true);
  });

  it("상세 첨부: PDF 링크만, 상대 주소는 절대 주소로", () => {
    expect(parseGhAttachments(SYNTHETIC_GH_DETAIL, "https://apply.gh.or.kr/sb/sr/sr7155/selectPbancDetailView.do?pbancNo=1234")).toEqual([
      { name: "남양주왕숙 행복주택 입주자모집공고문.pdf", url: "https://apply.gh.or.kr/cmmn/fileDown.do?atchFileId=FILE_1&fileSn=0" },
    ]);
  });
});

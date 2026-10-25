// 변경 요청 4 예시 — 시 이름·위치 글·지구 이름·신청 대상·PDF 고르기·실패 이유 (business-rules §12, business-logic-model "변경 요청 4")
// 원천 조각은 2026-10-25 운영 원천에서 확인한 실제 값 (LH 상세 dsSbd·dsCtrtPlc, GH 상세 HTML, 청약홈 공급 위치)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { judgementAudiences } from "../../domain/audiences.ts";
import { DISTRICTS } from "../../eligibility/reference-data.ts";
import { allTargetedAudiences, findAudiences, noticeAttachmentNames } from "../audience-words.ts";
import { contentHashInput } from "../content-hash.ts";
import { parseExtraction } from "../extraction.ts";
import { normalizeWithoutHash } from "../normalize.ts";
import { parseGhAttachments, parseGhDetailInfo } from "../parsers/gh.ts";
import { parseLhDetail } from "../parsers/lh.ts";
import { pickNoticePdf } from "../pdf-locator.ts";
import { findPlaceRegions } from "../place-names.ts";
import { failureReason } from "../ports.ts";
import { matchCapitalSigungu, withoutSpecialCity } from "../regions.ts";
import type { RawNotice } from "../types.ts";

const real = (name: string) => readFileSync(new URL(`../../__tests__/fixtures/collect/${name}`, import.meta.url), "utf8");

function raw(over: Partial<RawNotice>): RawNotice {
  return {
    source: "lh_rental",
    sourceNoticeNo: "N1",
    title: "공고",
    complexName: null,
    location: null,
    sigungu: null,
    provider: "LH",
    supplyTypeText: null,
    tenureHint: null,
    dates: { announcedAt: null, applyStart: null, applyEnd: null, resultAt: null, contractStart: null, contractEnd: null },
    originalUrl: "https://example.invalid/1",
    attachments: [],
    raw: null,
    ...over,
  };
}
const normalize = (over: Partial<RawNotice>) => normalizeWithoutHash(raw(over), DISTRICTS)!;
const sigungus = (over: Partial<RawNotice>) => normalize(over).regions.map((r) => r.sigungu);

/** LH 상세 응답 조각: 단지 주소와 접수처 주소가 다른 공고 */
const lhDetail = (complex: string, office: string) => [
  { dsSbd: [{ LCT_ARA_ADR: complex, BZDT_NM: "단지" }] },
  { dsCtrtPlc: [{ CTRT_PLC_ADR: office, CTRT_PLC_DTL_ADR: "" }] },
  { dsAhflInfo: [] },
];

describe("시 이름 정리 (BR-U3-E1)", () => {
  it("특례시 → 목록 이름, 멱등", () => {
    expect(withoutSpecialCity("화성특례시")).toBe("화성시");
    expect(withoutSpecialCity(withoutSpecialCity("화성특례시"))).toBe("화성시");
    expect(matchCapitalSigungu("경기", "화성특례시 동탄구")).toBe("화성시");
    expect(matchCapitalSigungu("경기", "고양특례시 덕양구")).toBe("고양시");
  });

  it("아크메르 동탄 95 — 청약홈 공급 위치 '화성특례시'는 화성시", () => {
    const n = normalize({ source: "applyhome", provider: "케이비부동산신탁(주)", title: "아크메르 동탄 95", location: "경기도 화성특례시 동탄구 반송동 95번지[동탄(1) M1-1-2블록]" });
    expect(n.regions).toEqual([{ sido: "경기", sigungu: "화성시" }]);
  });
});

describe("지구 이름 → 시군구 (BR-U3-E4·E5)", () => {
  it.each([
    ["구리갈매 S1블록 10년공공임대주택 예비입주자 모집공고", ["구리시"]],
    ["시흥거모 S-1블록 공공분양주택 입주자모집공고", ["시흥시"]],
    ["시흥하중 A1블록 신혼희망타운(공공분양) 잔여세대 추가입주자모집공고", ["시흥시"]],
    ["연천BIX 경기행복주택 기업체 기숙사 추가모집 공고", ["연천군"]],
    ["[경기북부] 청년 매입임대주택 선착순 예비입주자 모집공고 (김포시, 포천시)", ["김포시", "포천시"]],
    ["2026년 GH Care Hub 특화형 매입임대주택(일반) 부천. 김포 입주자 모집 공고문", ["김포시", "부천시"]],
    ["남양주왕숙 행복주택", ["남양주시"]],
    ["아크메르 동탄 99", []],
    ["광명시흥 뉴:홈 공공분양", ["광명시"]], // 낱말 중간의 "시흥"은 쓰지 않는다 — 지구(광명시흥)로 따로 맞는다
    ["[경기남부] 든든전세 매입임대주택", []],
  ])("%s → %j", (title, expected) => {
    expect(findPlaceRegions("경기", [title]).map((r) => r.sigungu)).toEqual(expected);
  });

  it("'광주광역시'는 경기 광주시가 아니다", () => {
    expect(findPlaceRegions("경기", ["광주광역시 남구 공고"])).toEqual([]);
    expect(findPlaceRegions("경기", ["광주 태전 행복주택"]).map((r) => r.sigungu)).toEqual(["광주시"]);
  });
});

describe("원천 공급 위치 칸 (BR-U3-E2·E3)", () => {
  it("LH: 단지 주소(dsSbd)는 쓰고 접수처(dsCtrtPlc)는 쓰지 않는다 — 시흥하중의 접수처는 화성시", () => {
    const detail = parseLhDetail(lhDetail("경기도 시흥시 하중동", "경기도 화성시 동탄구 청계동"));
    expect(detail.locationTexts).toEqual(["경기도 시흥시 하중동"]);
    const regions = sigungus({ title: "시흥하중 A1블록 신혼희망타운(공공분양) 잔여세대 추가입주자모집공고", location: "경기도 시흥하중 A1블록 신혼희망타운(공공분양) 잔여세대 추가입주자모집공고", locationTexts: detail.locationTexts });
    expect(regions).toEqual(["시흥시"]);
  });

  it("LH 구리갈매: 단지 주소 구리시, 접수처 남양주시는 빠진다", () => {
    const detail = parseLhDetail(lhDetail("경기도 구리시 갈매동", "경기도 남양주시 다산중앙로123번길 22-80"));
    expect(sigungus({ title: "구리갈매 S1블록 10년공공임대주택 예비입주자 모집공고", location: "경기도 구리갈매 S1블록 10년공공임대주택 예비입주자 모집공고", locationTexts: detail.locationTexts })).toEqual(["구리시"]);
  });

  it("GH 행복주택 상세: '공급정보' 표의 소재지만 — 접수처 표와 페이지 아래 본사 주소(수원)는 쓰지 않는다", () => {
    const html = real("real-gh-detail-sr7150.html");
    const info = parseGhDetailInfo(html);
    expect(info.locationTexts).toEqual(["경기도 연천군 연천읍 통현리 1073"]);
    expect(info.hintTexts).toEqual(["25A 기업체기숙사", "36A 기업체기숙사"]);
    const page = "https://apply.gh.or.kr/sb/sr/sr7150/selectPbancDetailView.do?pbancNo=811";
    const n = normalize({
      source: "gh",
      provider: "GH",
      title: "연천BIX 경기행복주택 기업체 기숙사 추가모집 공고",
      location: "경기도",
      supplyTypeText: "행복주택",
      attachments: parseGhAttachments(html, page),
      ...info,
    });
    expect(n.regions).toEqual([{ sido: "경기", sigungu: "연천군" }]);
    expect(n.audiences).toEqual(["dormitory"]);
    expect(n.supplyType).toBe("happy_unknown");
  });

  it("GH 특화형 매입임대: 소재지가 없으면 공고문 첨부 이름의 지역", () => {
    const html = real("real-gh-detail-sr7155.html");
    const page = "https://apply.gh.or.kr/sb/sr/sr7155/selectPbancDetailView.do?pbancNo=792";
    expect(parseGhDetailInfo(html).locationTexts).toEqual([]);
    const n = normalize({ source: "gh", provider: "GH", title: "26년 GH 특화형 매입임대주택 입주자 모집 공고(운영기관 : 한지붕협동조합)", location: "경기도", attachments: parseGhAttachments(html, page) });
    expect(n.regions.map((r) => r.sigungu)).toEqual(expect.arrayContaining(["부천시", "김포시"]));
    expect(n.regions.every((r) => r.sigungu !== null && r.sigungu !== "수원시")).toBe(true);
    expect(n.audiences).toEqual([]); // "(일반)" 첨부가 있어 신혼 전용으로 보지 않는다
  });
});

describe("신청 대상 (BR-U3-E20·E21)", () => {
  it.each([
    ["연천BIX 경기행복주택 기업체 기숙사 추가모집 공고", ["dormitory"]],
    ["'26년 경기도형 창업특화주택 입주자 모집 공고(운영기관 : 나눔과미래)", ["startup"]],
    ["[온라인 접수 불가, 관할 주거복지지사 현장접수] 경기남부지역본부 2026년 일반 매입임대주택 입주자 모집공고", ["low_income"]],
    ["시흥하중 A1블록 신혼희망타운(공공분양) 잔여세대 추가입주자모집공고", ["newlywed"]],
    ["강동구 청년창업가,예술인주택(수요자맞춤형) 잔여세대 모집 공고", ["startup", "artist", "youth"]],
    ["2026년 2차 희망하우징(공공기숙사) 입주자 모집공고", ["student"]],
    ["은평구 홀몸어르신 은빛주택(수요자맞춤형) 잔여세대 모집", ["senior"]],
    ["장애인 자립특화형 주택 여기가 입주자 모집공고(경기도 김포시)", ["disabled"]],
    ["인천부평(도시재생뉴딜) 행복주택 입주자 최초 모집", []],
    ["[경기남부] 든든전세 매입임대주택 예비입주자 모집공고(비분양전환)", []],
    ["구리갈매 S1블록 10년공공임대주택 예비입주자 모집공고", []],
  ])("%s → %j", (title, expected) => {
    expect(findAudiences([title])).toEqual(expected);
  });

  it("목록은 모든 항목이 대상일 때만: 주택형 모두 기숙사 → dormitory, '일반'이 섞이면 없음", () => {
    expect(allTargetedAudiences(["25A 기업체기숙사", "36A 기업체기숙사"])).toEqual(["dormitory"]);
    expect(allTargetedAudiences(["26A 청년", "36A 신혼부부", "26B 고령자"])).toEqual(["youth", "senior", "newlywed"]);
    expect(allTargetedAudiences(["(일반) 부천. 김포 입주자 모집 공고문", "(의왕 신혼부부형) 입주자 모집 공고문"])).toEqual([]);
    expect(allTargetedAudiences([])).toEqual([]);
  });

  it("서식·양식 첨부 이름은 단서로 쓰지 않는다", () => {
    const names = noticeAttachmentNames([
      { name: "공고문(PDF) 인천부평행복주택입주자모집.pdf", url: "u1" },
      { name: "기타 첨부파일 [양식3]추가제출서류(예비신혼부부_신청시)_해당자만제출.hwpx", url: "u2" },
      { name: "청년매입임대_QnA 모집.hwpx", url: "u3" },
    ]);
    expect(names).toEqual(["공고문(PDF) 인천부평행복주택입주자모집"]);
  });

  it("판정 대상: AI 값이 비어 있지 않으면 AI, 비거나 없으면 제목 값 (E23)", () => {
    expect(judgementAudiences(["youth", "newlywed", "senior"], [])).toEqual(["youth", "senior", "newlywed"]);
    expect(judgementAudiences([], ["dormitory"])).toEqual(["dormitory"]);
    expect(judgementAudiences(null, ["startup"])).toEqual(["startup"]);
  });

  it("AI 추출: 9개 값만, 배열이 아니면 모름(null)", () => {
    expect(parseExtraction({ isNotice: true, units: [], audiences: ["dormitory", "모름", "senior"] })!.audiences).toEqual(["dormitory", "senior"]);
    expect(parseExtraction({ isNotice: true, units: [], audiences: [] })!.audiences).toEqual([]);
    expect(parseExtraction({ isNotice: true, units: [], audiences: "senior" })!.audiences).toBeNull();
  });
});

describe("AI 분석 (BR-U3-E30·E32·E40)", () => {
  it("'공고문(PDF)' 라벨이 붙은 엑셀은 고르지 않는다 (인천본부 정정 공고 실제 첨부)", () => {
    const pick = pickNoticePdf([
      { name: "공고문(PDF) (261022)(인천본부)공급대상주택목록.xlsx", url: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=69110456" },
      { name: "공고문(hwp) (261022)(인천본부)일반매입임대주택입주자모집공고문.hwpx", url: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=69110458" },
    ]);
    expect(pick).toBeNull();
    expect(
      pickNoticePdf([{ name: "공고문(PDF) 구리갈매S1블록10년공공임대주택예비입주자모집공고(2026.10.22공고).pdf", url: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=69102241" }])?.url,
    ).toBe("https://apply.lh.or.kr/lhapply/lhFile.do?fileid=69102241");
  });

  it("실패 이유: 코드 + 설명, URL 쿼리는 지우고 200자", () => {
    const e = new Error("HTTP 402 https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=SECRET");
    const reason = failureReason("gemini_error", e);
    expect(reason).toBe("gemini_error: HTTP 402 https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?[redacted]");
    expect(reason).not.toContain("SECRET");
    expect(failureReason("no_pdf", new Error("no_pdf"))).toBe("no_pdf");
    expect(failureReason("gemini_error", new Error("가".repeat(300)))).toHaveLength(200);
  });

  it("정규화 판이 바뀌면 같은 내용도 해시 입력이 달라진다 (배포 뒤 다시 저장)", () => {
    const n = { title: "t", location: null, supplyTypeText: null, schedule: normalize({}).schedule, attachments: [] };
    expect(contentHashInput(n, 4)).not.toBe(contentHashInput(n, 3));
    expect(contentHashInput(n)).toBe(contentHashInput(n, 4));
  });
});

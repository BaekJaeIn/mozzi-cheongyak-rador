// 예시 기반 테스트 — 실제 응답 픽스처 real-* (Step 12, scripts/capture-fixtures.mjs로 2026-10-15 캡처)
// 원천이 바뀌어 실제 수집이 깨지면: 다시 캡처 → 이 테스트의 기대값을 새 응답에 맞춰 고친다.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchDistricts } from "../../domain/district-matcher.ts";
import { DISTRICTS } from "../../eligibility/reference-data.ts";
import { ghCardToRaw, ghNetFunnelActive, parseGhAttachments, parseGhCards } from "../parsers/gh.ts";
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

describe("HTML 문자 참조", () => {
  it("숫자 참조(10진·16진)를 풀고, 범위 밖은 그대로 둔다", () => {
    expect(htmlToText("&#039;26년 &#x27;A&#39; &#99999999;")).toBe("'26년 'A' &#99999999;");
  });
});

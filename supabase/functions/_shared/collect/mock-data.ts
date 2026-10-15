// 목업 원천 데이터·추출 결과 (BR-U3-07, FR-1.4) — 로컬 개발·통합 테스트·E2E가 외부 호출 없이 전체 흐름을 돈다
// 날짜는 실행일(today) 기준으로 계산해 언제 돌려도 수집 범위 안에 든다. 실제 공고가 아닌 가상 데이터.
import { addDays, type IsoDate } from "../domain/dates.ts";
import type { CollectSource, RawDates, RawNotice } from "./types.ts";

const dates = (today: IsoDate, o: { announced: number; start?: number; end?: number }): RawDates => ({
  announcedAt: addDays(today, o.announced),
  applyStart: o.start === undefined ? null : addDays(today, o.start),
  applyEnd: o.end === undefined ? null : addDays(today, o.end),
  resultAt: null,
  contractStart: null,
  contractEnd: null,
});

const base = (o: Partial<RawNotice> & Pick<RawNotice, "source" | "sourceNoticeNo" | "title" | "dates">): RawNotice => ({
  complexName: null,
  location: null,
  sigungu: null,
  provider: "LH",
  supplyTypeText: null,
  tenureHint: null,
  originalUrl: "https://example.invalid/notice",
  attachments: [],
  raw: { mock: true },
  ...o,
});

export const MOCK_PDF_PREFIX = "mock://pdf/";

export function mockRawNotices(today: IsoDate): Record<CollectSource, RawNotice[]> {
  return {
    lh_rental: [
      // ① 교산 A2 공공분양 — 청약홈 ①과 같은 공고 (묶여야 함)
      base({
        source: "lh_rental",
        sourceNoticeNo: "MOCK-LH-1",
        title: "[하남교산] A-2BL 뉴:홈 공공분양 입주자모집",
        location: "경기도 하남시 천현동",
        supplyTypeText: "분양주택 공공분양",
        tenureHint: "sale",
        dates: dates(today, { announced: -2, start: 5, end: 7 }),
        attachments: [{ name: "입주자모집공고문.pdf", url: `${MOCK_PDF_PREFIX}gyosan-a2.pdf` }],
      }),
      // ② 창릉 국민임대
      base({
        source: "lh_rental",
        sourceNoticeNo: "MOCK-LH-2",
        title: "고양창릉 S-3블록 국민임대 예비입주자 모집",
        location: "경기도 고양시 덕양구 화전동",
        supplyTypeText: "임대주택 국민임대",
        tenureHint: "rent",
        dates: dates(today, { announced: -1, start: 10, end: 14 }),
        attachments: [{ name: "모집공고.pdf", url: `${MOCK_PDF_PREFIX}changneung-s3.pdf` }],
      }),
      // ③ 하남 미사 — 지구 없음, 지구 후보 경고 (BR-U3-22)
      base({
        source: "lh_rental",
        sourceNoticeNo: "MOCK-LH-3",
        title: "하남미사 행복주택 추가모집",
        location: "경기도 하남시 망월동",
        supplyTypeText: "임대주택 행복주택",
        dates: dates(today, { announced: -3, start: 2, end: 4 }),
      }),
      // ④ 이미 마감 — 범위 밖 (BR-U3-40)
      base({
        source: "lh_rental",
        sourceNoticeNo: "MOCK-LH-4",
        title: "남양주왕숙 A1블록 통합공공임대",
        location: "경기도 남양주시 진접읍",
        supplyTypeText: "임대주택 통합공공임대",
        dates: dates(today, { announced: -30, start: -20, end: -10 }),
      }),
    ],
    applyhome: [
      // ① 교산 A2 — LH ①과 묶임
      base({
        source: "applyhome",
        sourceNoticeNo: "MOCK-APH-1",
        title: "하남교산 A2블록 공공분양",
        complexName: "하남교산 A2블록 공공분양",
        location: "경기도 하남시 교산동 일원",
        provider: "한국토지주택공사",
        supplyTypeText: "분양주택 국민",
        tenureHint: "sale",
        dates: dates(today, { announced: -2, start: 5, end: 7 }),
      }),
      // ② 성남 대장동 — 부천 대장 아님 (오매칭 방지)
      base({
        source: "applyhome",
        sourceNoticeNo: "MOCK-APH-2",
        title: "판교 대장지구 민간분양",
        location: "경기도 성남시 분당구 대장동",
        provider: "민간",
        supplyTypeText: "분양주택 민영",
        dates: dates(today, { announced: -1, start: 6, end: 8 }),
      }),
      // ③ 계양 민영 — PDF 없음 (표준 요건 유지)
      base({
        source: "applyhome",
        sourceNoticeNo: "MOCK-APH-3",
        title: "인천계양 A10블록 민간 아파트",
        location: "인천광역시 계양구 박촌동",
        provider: "민간",
        supplyTypeText: "분양주택 민영",
        tenureHint: "sale",
        dates: dates(today, { announced: 0, start: 8, end: 9 }),
      }),
    ],
    gh: [
      // ① 왕숙 행복주택 (GH, 블록 없음 → 단독 묶음)
      base({
        source: "gh",
        sourceNoticeNo: "MOCK-GH-1",
        title: "남양주왕숙 행복주택 입주자 모집",
        location: "경기도",
        provider: "GH",
        supplyTypeText: "행복주택",
        dates: dates(today, { announced: -1, start: 3, end: 6 }),
        attachments: [{ name: "공고문.pdf", url: `${MOCK_PDF_PREFIX}wangsuk-happy.pdf` }],
      }),
    ],
  };
}

/** 목업 Gemini 응답 (PDF 주소별) — 실제 응답과 같은 납작한 형식 */
export function mockExtractionFor(pdfUrl: string): unknown {
  if (pdfUrl.endsWith("wangsuk-happy.pdf")) {
    return {
      isNotice: true,
      schedule: { announcedAt: null, applyStart: null, applyEnd: null, resultAt: null, contractStart: null, contractEnd: null },
      units: [
        {
          label: "26㎡",
          supplyTypeText: "행복주택 고령자",
          exclusiveAreaM2: 26,
          supplyCount: 30,
          requirements: {
            minAge: 65,
            ageBasis: "member",
            homelessRequired: true,
            incomeBasis: "urban_worker",
            incomePercent: 100,
            incomePercentFor1: 120,
            incomePercentFor2: 110,
            assetMaxManwon: 34500,
            carMaxManwon: 4542,
          },
        },
        { label: "36㎡", supplyTypeText: "행복주택 청년", exclusiveAreaM2: 36, supplyCount: 50, requirements: { minAge: 19 } },
      ],
      summary: {
        eligibilityPlain: "만 65세 이상이고 집이 없는 분이 신청할 수 있어요. 소득과 자산 기준이 있어요.",
        forSeniorCouple: "부부 2인 가구는 월 소득 645만원 정도까지 신청할 수 있어요.",
      },
    };
  }
  if (pdfUrl.endsWith("changneung-s3.pdf")) {
    return {
      isNotice: true,
      schedule: { resultAt: null },
      units: [
        {
          label: "46㎡",
          supplyTypeText: "국민임대 고령자 우선공급",
          exclusiveAreaM2: 46,
          supplyCount: 20,
          requirements: { minAge: 65, homelessRequired: true, incomeBasis: "urban_worker", incomePercent: 70, incomePercentFor1: 90, incomePercentFor2: 80, assetMaxManwon: 34500, carMaxManwon: 4542 },
        },
      ],
      summary: { eligibilityPlain: "만 65세 이상 무주택 세대가 우선 신청할 수 있어요.", forSeniorCouple: "부부 가구는 소득 기준 80%를 적용받아요." },
    };
  }
  return { isNotice: true, units: [], summary: { eligibilityPlain: "공고문의 신청 자격을 확인해 주세요.", forSeniorCouple: "원문을 확인해 주세요." } };
}

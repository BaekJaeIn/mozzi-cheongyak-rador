// 청약홈 분양정보 (data.go.kr 15098547, odcloud getAPTLttotPblancDetail) 응답 → RawNotice (BR-U3-02·11)
// 필드명은 cheongYak-radar에서 실제 응답으로 확인한 것. 이 API에는 첨부(공고문 PDF) 정보가 없다 (RK-U3-2).
import type { RawNotice } from "../types.ts";

export const APPLYHOME_ENDPOINT = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail";
export const APPLYHOME_PER_PAGE = 100;
export const APPLYHOME_MAX_PAGES = 5;

const TARGET_AREA = /경기|인천/;

const text = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s === "" ? null : s;
};

export interface ApplyhomePage {
  /** 응답 행 수 (지역 필터 전) — 마지막 페이지 판단용 */
  rowCount: number;
  notices: RawNotice[];
}

export function parseApplyhomePage(json: unknown): ApplyhomePage {
  const rows = Array.isArray((json as { data?: unknown })?.data) ? ((json as { data: unknown[] }).data) : [];
  const notices: RawNotice[] = [];
  for (const row of rows) {
    const r = (row ?? {}) as Record<string, unknown>;
    const area = text(r.SUBSCRPT_AREA_CODE_NM);
    if (area && !TARGET_AREA.test(area)) continue; // BR-U3-02 지역 사전 필터
    const rent = text(r.RENT_SECD_NM);
    notices.push({
      source: "applyhome",
      sourceNoticeNo: text(r.PBLANC_NO) ?? "",
      title: text(r.HOUSE_NM) ?? "",
      complexName: text(r.HOUSE_NM),
      location: text(r.HSSPLY_ADRES) ?? area,
      sigungu: null,
      provider: text(r.BSNS_MBY_NM) ?? "청약홈",
      supplyTypeText: [rent, text(r.HOUSE_DTL_SECD_NM), text(r.HOUSE_SECD_NM)].filter(Boolean).join(" ") || null,
      tenureHint: rent?.includes("임대") ? "rent" : rent?.includes("분양") ? "sale" : null,
      dates: {
        announcedAt: text(r.RCRIT_PBLANC_DE),
        applyStart: text(r.SPSPLY_RCEPT_BGNDE) ?? text(r.RCEPT_BGNDE), // BR-U3-11
        applyEnd: text(r.RCEPT_ENDDE),
        resultAt: text(r.PRZWNER_PRESNATN_DE),
        contractStart: text(r.CNTRCT_CNCLS_BGNDE),
        contractEnd: text(r.CNTRCT_CNCLS_ENDDE),
      },
      originalUrl: text(r.PBLANC_URL) ?? "https://www.applyhome.co.kr",
      attachments: [],
      raw: { PBLANC_NO: r.PBLANC_NO, HOUSE_MANAGE_NO: r.HOUSE_MANAGE_NO },
    });
  }
  return { rowCount: rows.length, notices };
}

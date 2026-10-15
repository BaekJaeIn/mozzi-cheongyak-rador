// LH 분양임대 공고 목록 (data.go.kr 15058530) + 상세 (15057999) 응답 파서 (BR-U3-03·04)
// 목록·상세 구조는 cheongYak-radar(lh.ts, parsers.ts)에서 가져옴. 첨부(공고문 PDF) 추출은 새로 추가 — Step 12 실제 응답으로 확정.
import { findSido } from "../../domain/profile.ts";
import { parseDateRange, parseSourceDate } from "../dates.ts";
import type { Attachment, RawNotice } from "../types.ts";

export const LH_LIST_ENDPOINT = "https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1";
export const LH_DETAIL_ENDPOINT = "https://apis.data.go.kr/B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1";
export const LH_PAGE_SIZE = 100;
export const LH_MAX_PAGES = 5;

const NON_HOUSING = /토지|상가|용지|점포|주유소|어린이집|창고|물류|공장|근린생활/;
const TARGET_SIDO = new Set(["경기", "인천"]);
const DETAIL_PARAM_KEYS = ["PAN_ID", "CCR_CNNT_SYS_DS_CD", "SPL_INF_TP_CD", "UPP_AIS_TP_CD", "AIS_TP_CD"] as const;

function pick(r: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = r[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

/** LH 응답에서 레코드 배열 (배열형 [{dsSch},{dsList:[...]}] / 객체형 모두) */
export function lhRows(json: unknown, key = "dsList"): Record<string, unknown>[] {
  if (Array.isArray(json)) {
    for (const block of json) {
      if (block && typeof block === "object" && Array.isArray((block as Record<string, unknown>)[key])) {
        return (block as Record<string, unknown>)[key] as Record<string, unknown>[];
      }
    }
    return [];
  }
  const o = (json ?? {}) as Record<string, unknown>;
  if (Array.isArray(o[key])) return o[key] as Record<string, unknown>[];
  return [];
}

/** 응답이 오류 봉투(키 미승인 등)인지 */
export function isLhErrorBody(text: string): boolean {
  return /Forbidden|errMsg|등록되지|SERVICE_KEY|returnReasonCode/i.test(text);
}

export interface LhCandidate {
  notice: RawNotice;
  /** 상세 API 호출에 쓰는 값 */
  detailParams: Record<(typeof DETAIL_PARAM_KEYS)[number], string>;
}

export function parseLhListPage(json: unknown): { rowCount: number; candidates: LhCandidate[] } {
  const rows = lhRows(json);
  const candidates: LhCandidate[] = [];
  for (const r of rows) {
    const upper = pick(r, ["UPP_AIS_TP_NM"]);
    const supply = [upper, pick(r, ["AIS_TP_CD_NM"])].filter(Boolean).join(" ") || null;
    const title = pick(r, ["PAN_NM"]) ?? "";
    if (NON_HOUSING.test(`${supply ?? ""} ${title}`)) continue;
    const region = pick(r, ["CNP_CD_NM", "LCT_ARA_DTL_ADR"]);
    const sido = findSido(`${region ?? ""} ${title}`);
    if (!sido || !TARGET_SIDO.has(sido)) continue; // 경기·인천만
    const detailParams = Object.fromEntries(DETAIL_PARAM_KEYS.map((k) => [k, pick(r, [k]) ?? ""])) as LhCandidate["detailParams"];
    candidates.push({
      detailParams,
      notice: {
        source: "lh_rental",
        sourceNoticeNo: pick(r, ["PAN_ID"]) ?? "",
        title,
        complexName: null,
        location: [region, title].filter(Boolean).join(" "),
        sigungu: null,
        provider: "LH",
        supplyTypeText: supply,
        tenureHint: upper?.includes("임대") ? "rent" : upper?.includes("분양") ? "sale" : null,
        dates: {
          announcedAt: pick(r, ["PAN_NT_ST_DT"]),
          applyStart: null, // 상세에서 채움
          applyEnd: pick(r, ["CLSG_DT"]),
          resultAt: null,
          contractStart: null,
          contractEnd: null,
        },
        originalUrl: pick(r, ["DTL_URL"]) ?? "https://apply.lh.or.kr",
        attachments: [],
        raw: { PAN_ID: r.PAN_ID, PAN_SS: r.PAN_SS },
      },
    });
  }
  return { rowCount: rows.length, candidates };
}

export function lhDetailQuery(params: LhCandidate["detailParams"]): string {
  return DETAIL_PARAM_KEYS.map((k) => `${k}=${encodeURIComponent(params[k])}`).join("&");
}

export interface LhDetail {
  applyStart: string | null;
  resultAt: string | null;
  attachments: Attachment[];
}

/** 상세 응답 → 접수 시작(공급일정 중 가장 이른 시작), 발표일, 첨부 */
export function parseLhDetail(json: unknown): LhDetail {
  const schedules = lhRows(json, "dsSplScdl");
  const starts = schedules.map((r) => parseDateRange(String(r.ACP_DTTM ?? ""))[0]).filter((d): d is string => !!d).sort();
  const results = schedules.map((r) => parseSourceDate(r.PZWR_ANC_DT)).filter((d): d is string => !!d).sort();

  // 첨부 데이터셋: 이름에 "Ahfl"이 들어간 블록 (예: dsAhflInfo)
  const attachments: Attachment[] = [];
  const blocks = Array.isArray(json) ? json : [json];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
      if (!/ahfl/i.test(key) || !Array.isArray(value)) continue;
      for (const row of value as Record<string, unknown>[]) {
        const url = Object.entries(row).find(([k, v]) => /URL$/i.test(k) && typeof v === "string" && v.startsWith("http"))?.[1] as string | undefined;
        if (!url) continue;
        const kind = pick(row, ["SL_PAN_AHFL_DS_CD_NM"]);
        const file = pick(row, ["CMN_AHFL_NM", "AHFL_NM", "FILE_NM"]);
        attachments.push({ name: [kind, file].filter(Boolean).join(" ") || url, url });
      }
    }
  }
  return { applyStart: starts[0] ?? null, resultAt: results[0] ?? null, attachments };
}

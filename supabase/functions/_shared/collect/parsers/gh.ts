// GH 청약센터 메인 카드·대기열·상세 첨부 파서 (BR-U3-05)
// 카드·대기열·상세 경로는 cheongYak-radar(parsers.ts)에서 가져옴. 상세 첨부는 Step 12 실제 HTML(real-gh-*)로 확인:
// 첨부는 apply-cdn.gh.or.kr/sr/<경로>/selectFileDown.do?… 링크이고, 링크 글자가 "파일명.pdf (크기 Byte)"다.
import { parseSourceDate } from "../dates.ts";
import type { Attachment, RawNotice } from "../types.ts";
import { absoluteUrl, htmlToText } from "./html.ts";

export const GH_BASE = "https://apply.gh.or.kr";
export const GH_MAIN_URL = `${GH_BASE}/co/coa/selectMainView.do`;

export interface GhCard {
  pbancNo: string;
  bizTyNm: string | null;
  bizTyCd: string | null;
  title: string;
  applyStart: string | null;
  applyEnd: string | null;
}

/** 대기열(NetFunnel) 활성 여부 — 주석 처리된 호출은 비활성. 활성이면 우회하지 않는다 */
export function ghNetFunnelActive(html: string): boolean {
  return /^\s*(?!\/\/)\s*NetFunnel_Action\s*\(/m.test(html);
}

/** 메인 카드 → 공고 (pbancNo 중복 제거, 상가 제외) */
export function parseGhCards(html: string): GhCard[] {
  const out: GhCard[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bdata-pbancNo="(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const pbancNo = m[1]!;
    if (seen.has(pbancNo)) continue;
    const open = m[0];
    const bizTyNm = open.match(/data-bizTyNm="([^"]*)"/i)?.[1]?.trim() || null;
    if (bizTyNm?.includes("상가")) continue;
    const titleHtml = m[2]!.match(/<p class="leading-6[^"]*">([\s\S]*?)<\/p>/i)?.[1];
    const title = titleHtml ? htmlToText(titleHtml) : "";
    if (!title) continue;
    const period = htmlToText(m[2]!.match(/<p class="calender_box">([\s\S]*?)<\/p>/i)?.[1] ?? "")
      .replace("신청기간", "")
      .split("~");
    seen.add(pbancNo);
    out.push({
      pbancNo,
      bizTyNm,
      bizTyCd: open.match(/data-bizTyCd="([^"]*)"/i)?.[1] || null,
      title,
      applyStart: parseSourceDate(period[0]),
      applyEnd: parseSourceDate(period[1]),
    });
  }
  return out;
}

const GH_DETAIL_PATHS: Record<string, string> = {
  "06": "/sb/sr/sr7155/selectPbancDetailView.do",
  "07": "/sb/sr/sr7170/selectPbancDetailView.do",
};

export function ghDetailUrl(card: Pick<GhCard, "pbancNo" | "bizTyCd">): string {
  const path = GH_DETAIL_PATHS[card.bizTyCd ?? ""] ?? "/sb/sr/sr7150/selectPbancDetailView.do";
  return `${GH_BASE}${path}?pbancNo=${card.pbancNo}`;
}

export function ghCardToRaw(card: GhCard): RawNotice {
  return {
    source: "gh",
    sourceNoticeNo: card.pbancNo,
    title: card.title,
    complexName: null,
    location: "경기도", // GH는 경기도 공급 — 시군은 제목에서
    sigungu: null,
    provider: "GH",
    supplyTypeText: card.bizTyNm,
    tenureHint: null,
    dates: {
      announcedAt: null,
      applyStart: card.applyStart,
      applyEnd: card.applyEnd,
      resultAt: null,
      contractStart: null,
      contractEnd: null,
    },
    originalUrl: ghDetailUrl(card),
    attachments: [],
    raw: { pbancNo: card.pbancNo, bizTyCd: card.bizTyCd },
  };
}

/** 상세 페이지 → 첨부 (링크 글자나 주소에 .pdf가 있는 것). 링크 글자 끝의 "(1164034 Byte)"는 뺀다 */
export function parseGhAttachments(html: string, pageUrl: string): Attachment[] {
  const out: Attachment[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]!;
    const name = htmlToText(m[2]!).replace(/\s*\(\s*[\d,]+\s*Bytes?\s*\)\s*$/i, "");
    if (!/\.pdf/i.test(name) && !/\.pdf/i.test(href)) continue;
    if (/^javascript:/i.test(href)) continue;
    const url = absoluteUrl(href, pageUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ name: name || url, url });
  }
  return out;
}

/**
 * 상세 페이지의 공급 위치·주택형 (변경 4 BR-U3-E2·E3·E20).
 * 소재지는 "…공급정보" 표에서만 읽는다 — "접수처" 표와 페이지 아래 본사 주소는 쓰지 않는다
 */
export function parseGhDetailInfo(html: string): { locationTexts: string[]; hintTexts: string[] } {
  const locationTexts: string[] = [];
  for (const table of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const caption = htmlToText(table[0].match(/<caption>([\s\S]*?)<\/caption>/i)?.[1] ?? "");
    if (!caption.includes("공급정보") || caption.includes("접수처")) continue;
    for (const m of table[0].matchAll(/<th\b[^>]*>\s*소재지\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
      const text = htmlToText(m[1]!);
      if (text && !locationTexts.includes(text)) locationTexts.push(text);
    }
  }
  const hintTexts: string[] = [];
  for (const m of html.matchAll(/<tr\b[^>]*class="[^"]*tb_house_con[^"]*"[^>]*>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
    const text = htmlToText(m[1]!);
    if (text && !hintTexts.includes(text)) hintTexts.push(text);
  }
  return { locationTexts, hintTexts };
}

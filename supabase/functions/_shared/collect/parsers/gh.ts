// GH 청약센터 메인 카드·대기열·상세 첨부 파서 (BR-U3-05)
// 카드·대기열·상세 경로는 cheongYak-radar(parsers.ts)에서 가져옴. 상세 첨부 추출은 새로 추가 — Step 12 실제 HTML로 확정.
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

/** 상세 페이지 → 첨부 (링크 글자나 주소에 .pdf가 있는 것) */
export function parseGhAttachments(html: string, pageUrl: string): Attachment[] {
  const out: Attachment[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1]!;
    const name = htmlToText(m[2]!);
    if (!/\.pdf/i.test(name) && !/\.pdf/i.test(href)) continue;
    if (/^javascript:/i.test(href)) continue;
    const url = absoluteUrl(href, pageUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ name: name || url, url });
  }
  return out;
}

// SH 서울주택도시개발공사 공고 게시판 파서 (U3 변경 2 BR-U3-C10~C14)
// 2026-10-19 실제 화면(real-sh-*.html)으로 확인:
// - 목록: list.do?multi_itm_seq=(2 임대|1 분양)&itm_seq_1=1(모집공고)&page=N, 행마다 getDetailView('글번호'), 제목, 등록일
// - 상세: view.do?seq=글번호 (GET 가능). 본문에 "모집공고일 : 2026.10.12." "접수기간 : 2026. 10. 26.(월) ~ 2026.11. 06.(금)" 같은 줄
// - 첨부: 본문 스크립트의 initParam.downList(JSON) → /main/com/file/innoFD.do?brdId&seq&fileTp&fileSeq (첨부 컴포넌트 설정 innorix.config.js와 같은 주소)
import { CAPITAL_SIGUNGU } from "../../domain/regions.ts";
import { parseDateRange, parseSourceDate } from "../dates.ts";
import type { Attachment, RawNotice } from "../types.ts";
import { htmlToText } from "./html.ts";

export const SH_BASE = "https://www.i-sh.co.kr";

export interface ShBoard {
  kind: "rent" | "sale";
  /** 게시판 경로 (list.do·view.do 앞까지) */
  path: string;
  multiItmSeq: 1 | 2;
  label: string;
}

/** BR-U3-C10: 주택임대·주택분양 (사이트 검색 스크립트의 분류별 주소) */
export const SH_BOARDS: readonly ShBoard[] = [
  { kind: "rent", path: "/main/lay2/program/S1T297C4476/www/brd/m_247", multiItmSeq: 2, label: "주택임대" },
  { kind: "sale", path: "/main/lay2/program/S1T294C296/www/brd/m_244", multiItmSeq: 1, label: "주택분양" },
];
export const SH_LIST_PAGES = 2;
/** 목록에 접수 기간이 없어 마감 전인지 모르므로, 등록 뒤 이 기간이 지난 글은 모집이 끝난 것으로 본다 */
export const SH_STALE_DAYS = 120;

export function shListUrl(board: ShBoard, page: number): string {
  return `${SH_BASE}${board.path}/list.do?multi_itm_seq=${board.multiItmSeq}&itm_seq_1=1&page=${page}`;
}
export function shViewUrl(board: ShBoard, seq: string): string {
  return `${SH_BASE}${board.path}/view.do?seq=${seq}`;
}

export interface ShCard {
  seq: string;
  title: string;
  registeredAt: string | null;
}

/** BR-U3-C11: 모집공고가 아닌 글 */
const EXCLUDE = /발표|결과|당첨|공개|정정|취소|안내문|서류|계약/;
export function isShExcluded(title: string): boolean {
  return EXCLUDE.test(title);
}

/** 목록 화면이 정상인지 (대기열·차단·오류 화면이면 false, NFR-U3-C8) */
export function isShListPage(html: string): boolean {
  return /getDetailView\(/.test(html) || /게시물이 없습니다|검색된 결과가 없습니다/.test(html);
}

/** 목록 → 글 (글번호 중복 제거) */
export function parseShList(html: string): ShCard[] {
  const out: ShCard[] = [];
  const seen = new Set<string>();
  for (const row of html.split(/<tr[\s>]/i)) {
    const link = row.match(/getDetailView\('(\d+)'\);return false;"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const seq = link[1]!;
    if (seen.has(seq)) continue;
    const title = htmlToText(link[2]!);
    if (!title) continue;
    seen.add(seq);
    const date = row.match(/<td class="num">\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/);
    out.push({ seq, title, registeredAt: date ? parseSourceDate(date[1]) : null });
  }
  return out;
}

export interface ShDetail {
  announcedAt: string | null;
  applyStart: string | null;
  applyEnd: string | null;
  resultAt: string | null;
  attachments: Attachment[];
}

const lineValue = (text: string, label: RegExp): string | null => {
  const m = text.match(new RegExp(`${label.source}\\s*[:：]\\s*([^■○]{4,80})`));
  return m ? m[1]!.trim() : null;
};

/** 상세 → 일정·첨부 (BR-U3-C13·C14). 못 찾은 값은 null (AI 추출이 채움) */
export function parseShDetail(html: string): ShDetail {
  const text = htmlToText(html);
  const [applyStart, applyEnd] = parseDateRange(lineValue(text, /접수\s*기간/));
  return {
    announcedAt: parseSourceDate(lineValue(text, /모집\s*공고일/) ?? ""),
    applyStart,
    applyEnd,
    resultAt: parseSourceDate(lineValue(text, /당첨자\s*발표/) ?? ""),
    attachments: parseShAttachments(html),
  };
}

interface DownItem {
  brdId?: unknown;
  seq?: unknown;
  fileSeq?: unknown;
  fileTp?: unknown;
  oriFileNm?: unknown;
}

/** initParam.downList → PDF 첨부만 (공고문 찾기는 BR-U3-60이 이름으로) */
export function parseShAttachments(html: string): Attachment[] {
  const m = html.match(/initParam\.downList\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) return [];
  let list: DownItem[];
  try {
    list = JSON.parse(m[1]!) as DownItem[];
  } catch {
    return [];
  }
  const out: Attachment[] = [];
  for (const d of Array.isArray(list) ? list : []) {
    const name = typeof d.oriFileNm === "string" ? d.oriFileNm.trim() : "";
    const ok = [d.brdId, d.seq, d.fileSeq, d.fileTp].every((v) => typeof v === "string" && /^[A-Za-z0-9_]+$/.test(v));
    if (!ok || !/\.pdf$/i.test(name)) continue;
    const q = new URLSearchParams({ brdId: d.brdId as string, seq: d.seq as string, fileTp: d.fileTp as string, fileSeq: d.fileSeq as string });
    out.push({ name, url: `${SH_BASE}/main/com/file/innoFD.do?${q.toString()}` });
  }
  return out;
}

/** 제목 맨 앞쪽의 서울 구 이름 (예: "은평구 홀몸어르신…") — 없으면 null (AI가 공고문에서 고침, BR-U3-C9) */
export function shSigunguFromTitle(title: string): string | null {
  for (const gu of CAPITAL_SIGUNGU.서울) if (new RegExp(`(^|[\\s\\[(])${gu}(?=[\\s)\\]]|$)`).test(title)) return gu;
  return null;
}

export function shCardToRaw(board: ShBoard, card: ShCard, detail: ShDetail | null): RawNotice {
  return {
    source: "sh",
    sourceNoticeNo: card.seq,
    title: card.title,
    complexName: null,
    location: "서울특별시", // SH는 서울 공급 (BR-U3-C12)
    sigungu: shSigunguFromTitle(card.title),
    provider: "SH",
    supplyTypeText: board.label,
    tenureHint: board.kind === "sale" ? "sale" : "rent",
    dates: {
      announcedAt: detail?.announcedAt ?? card.registeredAt,
      applyStart: detail?.applyStart ?? null,
      applyEnd: detail?.applyEnd ?? null,
      resultAt: detail?.resultAt ?? null,
      contractStart: null,
      contractEnd: null,
    },
    originalUrl: shViewUrl(board, card.seq),
    attachments: detail?.attachments ?? [],
    raw: { seq: card.seq, title: card.title, registeredAt: card.registeredAt, board: board.kind },
  };
}

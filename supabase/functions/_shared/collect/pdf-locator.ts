// 공고문 PDF 고르기 (BR-U3-60): 이름에 "공고"·"모집"이 있는 PDF 우선, 없으면 첫 PDF
// 실제 GH 첨부(Step 12)는 공고문·포스터·팸플릿·주택내역이 모두 "모집"을 담는다 → 공고문 > 공고 > 모집, 부속 자료는 뒤로.
import type { Attachment } from "./types.ts";

/** 파일 이름 확장자나 주소 경로가 .pdf — "공고문(PDF) …xlsx" 같은 구분 라벨만으로는 고르지 않는다 (변경 4 BR-U3-E30) */
const isPdf = (a: Attachment) => /\.pdf($|\?)/i.test(a.url) || /\.pdf\s*$/i.test(a.name);
const SUPPLEMENT = /포스터|팸플릿|팜플렛|리플릿|리플렛|홍보|안내문|주택내역|주택목록|연락처|신청서|서식|배치도|평면도|카탈로그/;

function noticeScore(a: Attachment): number {
  if (SUPPLEMENT.test(a.name)) return 0;
  if (/공고문/.test(a.name)) return 3;
  if (/공고/.test(a.name)) return 2;
  if (/모집/.test(a.name)) return 1;
  return 0;
}

export function pickNoticePdf(attachments: readonly Attachment[]): Attachment | null {
  const pdfs = attachments.filter(isPdf);
  let best: Attachment | null = null;
  let bestScore = 0;
  for (const a of pdfs) {
    const score = noticeScore(a);
    if (score > bestScore) [best, bestScore] = [a, score];
  }
  return best ?? pdfs[0] ?? null;
}

/** 묶음의 원천들을 대표부터 차례로 보고 처음 찾은 공고문 PDF */
export function pickNoticePdfFromSources(sources: readonly { attachments: readonly Attachment[] }[]): Attachment | null {
  for (const s of sources) {
    const pdf = pickNoticePdf(s.attachments);
    if (pdf) return pdf;
  }
  return null;
}

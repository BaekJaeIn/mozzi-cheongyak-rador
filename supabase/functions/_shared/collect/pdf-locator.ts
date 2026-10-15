// 공고문 PDF 고르기 (BR-U3-60): 이름에 "공고"·"모집"이 있는 PDF 우선, 없으면 첫 PDF
import type { Attachment } from "./types.ts";

const isPdf = (a: Attachment) => /\.pdf($|\?)/i.test(a.url) || /\.pdf\s*$/i.test(a.name) || /pdf/i.test(a.name);
const looksLikeNotice = (a: Attachment) => /공고|모집/.test(a.name);

export function pickNoticePdf(attachments: readonly Attachment[]): Attachment | null {
  const pdfs = attachments.filter(isPdf);
  return pdfs.find(looksLikeNotice) ?? pdfs[0] ?? null;
}

/** 묶음의 원천들을 대표부터 차례로 보고 처음 찾은 공고문 PDF */
export function pickNoticePdfFromSources(sources: readonly { attachments: readonly Attachment[] }[]): Attachment | null {
  for (const s of sources) {
    const pdf = pickNoticePdf(s.attachments);
    if (pdf) return pdf;
  }
  return null;
}

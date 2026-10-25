// 제목·단서 글의 신청 대상 낱말 (U3 변경 4 BR-U3-E20·E21, 계획 Q3=A) — 값의 뜻은 U2 domain/audiences.ts
import { NOTICE_AUDIENCES, type NoticeAudience } from "../domain/audiences.ts";
import { compactText } from "../domain/supply-types.ts";
import type { Attachment } from "./types.ts";

/** 띄어쓰기를 무시하고 찾는 말 */
const WORDS: Readonly<Record<NoticeAudience, readonly string[]>> = {
  dormitory: ["기업체기숙사"],
  startup: ["창업"],
  artist: ["예술인", "연극인", "문화예술"],
  student: ["대학생", "공공기숙사", "희망하우징"],
  youth: ["청년"],
  disabled: ["장애인"],
  low_income: ["일반매입임대", "수급자", "차상위", "한부모"],
  senior: ["고령자", "어르신", "은빛"],
  newlywed: ["신혼", "신생아"],
};

/** 찾은 대상을 모두, 표 순서·중복 없이. 낱말이 없으면 [] (누구나·모름, E21) */
export function findAudiences(texts: readonly string[]): NoticeAudience[] {
  const text = compactText(texts.join(" "));
  return NOTICE_AUDIENCES.filter((a) => WORDS[a].some((w) => text.includes(w)));
}

/** 서식·양식 등 제출 서류 이름 — 대상·지역 단서로 쓰지 않는다 (E3) */
const FORM = /서식|양식|신청서|제출서류|동의서|위임장|확인서|작성방법|QnA|Q&A|질의/i;

/** 단서로 쓸 첨부 이름: 공고문·공고·모집이 들어간 것 중 서식이 아닌 것. "(1234 Byte)"·확장자는 뺀다 */
export function noticeAttachmentNames(attachments: readonly Attachment[]): string[] {
  return attachments
    .map((a) => a.name)
    .filter((name) => /공고|모집/.test(name) && !FORM.test(name))
    .map((name) => name.replace(/\.[A-Za-z0-9]{2,5}$/, ""));
}

/**
 * 목록(첨부 이름·주택형 칸)의 대상: 모든 항목에 대상 낱말이 있을 때만 합집합, 하나라도 없으면(일반 몫) [].
 * 예: 주택형 "25A 기업체기숙사"·"36A 기업체기숙사" → dormitory, 첨부 "(일반) 부천. 김포"·"(의왕 신혼부부형)" → [] (변경 4 BR-U3-E20)
 */
export function allTargetedAudiences(items: readonly string[]): NoticeAudience[] {
  const each = items.map((item) => findAudiences([item]));
  if (each.length === 0 || each.some((a) => a.length === 0)) return [];
  return NOTICE_AUDIENCES.filter((a) => each.some((list) => list.includes(a)));
}

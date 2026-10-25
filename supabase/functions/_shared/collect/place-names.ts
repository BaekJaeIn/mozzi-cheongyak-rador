// 제목·첨부 이름의 지구 이름 → 시군구 (U3 변경 4 BR-U3-E4·E5) — 잘못 넣기보다 못 찾기
// 예: "구리갈매 S1블록" → 구리시, "시흥거모" → 시흥시, "연천BIX" → 연천군, "(김포시, 포천시)" → 김포시·포천시
import { type CapitalSido, CAPITAL_SIGUNGU } from "../domain/regions.ts";
import type { NoticeRegion } from "../eligibility/types.ts";

interface Stem {
  stem: string;
  sigungu: string;
}

/** 시도별 시군구 앞부분(시·군·구를 뺀 2글자 이상), 긴 것 먼저 — "남양주"가 "양주"보다 먼저 */
const stemsOf = (sido: CapitalSido): Stem[] =>
  CAPITAL_SIGUNGU[sido]
    .map((sigungu) => ({ stem: sigungu.slice(0, -1), sigungu }))
    .filter((s) => s.stem.length >= 2)
    .sort((a, b) => b.stem.length - a.stem.length);
const STEMS: Readonly<Record<CapitalSido, readonly Stem[]>> = { 서울: stemsOf("서울"), 경기: stemsOf("경기"), 인천: stemsOf("인천") };

/** 낱말 처음: 글 처음이거나 앞 글자가 한글·영문·숫자가 아님 (띄어쓰기·괄호·[·,·.·· 뒤) */
const isWordStart = (text: string, at: number) => at === 0 || !/[가-힣A-Za-z0-9]/.test(text[at - 1]!);

/** 글들에서 그 시도의 시군구를 찾는다. 낱말 중간("광명시흥"의 시흥)이나 "광주광역시"는 쓰지 않는다 */
export function findPlaceRegions(sido: CapitalSido, texts: readonly string[]): NoticeRegion[] {
  const found = new Set<string>();
  for (const raw of texts) {
    const text = raw.normalize("NFC");
    const taken = new Array<boolean>(text.length).fill(false);
    for (const { stem, sigungu } of STEMS[sido]) {
      for (let at = text.indexOf(stem); at !== -1; at = text.indexOf(stem, at + 1)) {
        if (taken[at] || !isWordStart(text, at)) continue;
        if (text.startsWith("광역시", at + stem.length)) continue;
        found.add(sigungu);
        for (let i = at; i < at + stem.length; i++) taken[i] = true;
      }
    }
  }
  return CAPITAL_SIGUNGU[sido].filter((s) => found.has(s)).map((sigungu) => ({ sido, sigungu }));
}

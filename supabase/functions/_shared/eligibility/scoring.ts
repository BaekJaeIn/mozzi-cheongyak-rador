// 추천 점수·피드 정렬 (BR-U2-60~65, Q5=A 4구간, Q6=B 선호 일치 우선)
import type { IsoDate } from "../domain/dates.ts";
import { areaBandOf, type HouseholdProfile } from "../domain/profile.ts";
import type { NoticeForJudgement, Verdict } from "./types.ts";

/** BR-U2-61~64: 면적 일치 + 분양/임대 일치 (0~2). 저층 선호는 데이터가 없어 쓰지 않음 (BR-U2-63) */
export function score(notice: Pick<NoticeForJudgement, "tenure" | "units">, prefs: HouseholdProfile["prefs"]): number {
  const bands = new Set(prefs.areaBands);
  const areaMatch =
    bands.size === 0 ||
    notice.units.some((u) => u.exclusiveAreaM2 !== null && bands.has(areaBandOf(u.exclusiveAreaM2)));
  const tenureMatch = prefs.tenure === "both" || prefs.tenure === notice.tenure;
  return (areaMatch ? 1 : 0) + (tenureMatch ? 1 : 0);
}

export interface FeedSortItem {
  noticeId: string;
  status: "open" | "upcoming";
  score: number;
  applyEnd: IsoDate | null;
  verdict: Exclude<Verdict, "ineligible">;
  /** ISO 시각 */
  firstSeenAt: string;
}

/**
 * BR-U2-65 정렬: ① 접수 중 → 접수 예정 ② 점수 높은 순 ③ 마감일 빠른 순(없으면 뒤)
 * ④ 충족 → 확인 필요 ⑤ 첫 수집이 최근인 순 ⑥ 공고 ID (항상 같은 순서)
 */
export function compareFeedItems(a: FeedSortItem, b: FeedSortItem): number {
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
  if (a.score !== b.score) return b.score - a.score;
  if (a.applyEnd !== b.applyEnd) {
    if (a.applyEnd === null) return 1;
    if (b.applyEnd === null) return -1;
    return a.applyEnd < b.applyEnd ? -1 : 1;
  }
  if (a.verdict !== b.verdict) return a.verdict === "eligible" ? -1 : 1;
  if (a.firstSeenAt !== b.firstSeenAt) return a.firstSeenAt > b.firstSeenAt ? -1 : 1;
  return a.noticeId < b.noticeId ? -1 : a.noticeId > b.noticeId ? 1 : 0;
}

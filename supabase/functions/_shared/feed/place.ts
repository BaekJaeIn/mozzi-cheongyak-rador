// 공고 위치 표시 (U5 변경 2, BR-U5-C1~C5·C7, domain-entities §8.2) — 서버(피드 순서)·기기(카드·상세) 공용
import type { RegionPick } from "../domain/profile.ts";
import { CAPITAL_SIDO, CAPITAL_SIGUNGU } from "../domain/regions.ts";
import { regionMatches } from "../eligibility/area.ts";
import type { NoticeRegion } from "../eligibility/types.ts";

/** 공용 목록 순서 키: 시도 순 → 시도까지만(앞) → 시군구 목록 순 */
function listOrder(r: NoticeRegion): [number, number] {
  const sido = CAPITAL_SIDO.indexOf(r.sido);
  const sigungu = r.sigungu === null ? -1 : CAPITAL_SIGUNGU[r.sido].indexOf(r.sigungu);
  return [sido, sigungu];
}

/** 내 관심 지역에 드는 것 먼저, 같은 무리 안에서는 공용 목록 순서 (BR-U5-C2, P-U5-C1). 원소는 그대로 */
export function orderRegions(regions: readonly NoticeRegion[], interest: readonly RegionPick[]): NoticeRegion[] {
  const inInterest = (r: NoticeRegion) => interest.some((p) => regionMatches(r, p));
  return [...regions].sort((a, b) => {
    const byInterest = Number(inInterest(b)) - Number(inInterest(a));
    if (byInterest !== 0) return byInterest;
    const [as, ag] = listOrder(a);
    const [bs, bg] = listOrder(b);
    return as - bs || ag - bg;
  });
}

/** "서울 강서구", 시도까지만이면 "서울" (BR-U5-C3, Q1=A) */
export function regionName(r: NoticeRegion): string {
  return r.sigungu === null ? r.sido : `${r.sido} ${r.sigungu}`;
}

/** 위치 이름 목록: 지구가 있으면 지구 이름(BR-U5-25), 없으면 지역 이름 (BR-U5-C1, P-U5-C2) */
export function placeNames(districtNames: readonly string[], regions: readonly NoticeRegion[]): string[] {
  return districtNames.length > 0 ? [...districtNames] : regions.map(regionName);
}

/** 지구가 없고 시도까지만 확인된 지역이 있으면 상세에 "정확한 위치는 공고문에서 확인해 주세요" (BR-U5-C4) */
export function placeNeedsCheck(districtNames: readonly string[], regions: readonly NoticeRegion[]): boolean {
  return districtNames.length === 0 && regions.some((r) => r.sigungu === null);
}

export type SummaryView = "summary" | "outOfArea" | "preparing";

/** 상세 요약 자리 (BR-U5-C7·C8, P-U5-C3): 이 기기 판정이 관심 지역 밖이고 요약이 없으면 "만들지 않았어요" */
export function summaryView(summary: unknown | null, judgement: { inDistrict: boolean } | null): SummaryView {
  if (summary !== null && summary !== undefined) return "summary";
  return judgement !== null && !judgement.inDistrict ? "outOfArea" : "preparing";
}

// 변경 요청 4 전 고정본 (커밋 79bf771) — 테스트 전용, P-C4-5 비교 기준. 고치지 않는다.
// 관심 지역 안인지 (U2 변경 2 BR-U2-C10~C12) — 노출 조건 K5의 "관심 지역"
import type { RegionPick } from "../../../../domain/profile.ts";
import { isCapitalSido, isCapitalSigungu } from "../../../../domain/regions.ts";
import type { NoticeRegion } from "../../../types.ts";

/** 공고 지역 하나가 관심 시군구 하나에 들어가는지: 시도가 같고, 시도 전체를 골랐거나(Q1) 공고가 시도까지만 확인됐거나(Q2) 시군구가 같다 */
export function regionMatches(region: NoticeRegion, pick: RegionPick): boolean {
  if (region.sido !== pick.sido) return false;
  return pick.sigungu === null || region.sigungu === null || region.sigungu === pick.sigungu;
}

export function inInterestArea(
  notice: { districtIds: readonly string[]; regions: readonly NoticeRegion[] },
  prefs: { districtIds: readonly string[]; regions: readonly RegionPick[] },
): boolean {
  const wanted = new Set(prefs.districtIds);
  if (notice.districtIds.some((id) => wanted.has(id))) return true; // BR-U2-C10
  return notice.regions.some((r) => prefs.regions.some((p) => regionMatches(r, p))); // BR-U2-C11
}

/** DB `notices.regions`(jsonb) 읽기 — 형식이 틀린 항목은 버린다(지구로만 매칭되도록) */
export function parseNoticeRegions(value: unknown): NoticeRegion[] {
  if (!Array.isArray(value)) return [];
  const out: NoticeRegion[] = [];
  for (const v of value) {
    if (typeof v !== "object" || v === null) continue;
    const { sido, sigungu } = v as { sido?: unknown; sigungu?: unknown };
    if (!isCapitalSido(sido)) continue;
    if (sigungu === null || sigungu === undefined) out.push({ sido, sigungu: null });
    else if (typeof sigungu === "string" && isCapitalSigungu(sido, sigungu)) out.push({ sido, sigungu });
  }
  return out;
}

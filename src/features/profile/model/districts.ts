// 관심 지구 카드 6개 (US-07). 값은 U2 기준 데이터 시드와 같다 — 서버는 저장 때 활성 지구인지 다시 확인한다.
import { DISTRICTS } from "@shared/eligibility/reference-data.ts";

export interface DistrictOption {
  id: string;
  name: string;
}

export const DISTRICT_OPTIONS: readonly DistrictOption[] = DISTRICTS.filter((d) => d.active)
  .slice()
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((d) => ({ id: d.id, name: d.name }));

export const ALL_DISTRICT_IDS: readonly string[] = DISTRICT_OPTIONS.map((d) => d.id);

export function districtName(id: string): string {
  return DISTRICT_OPTIONS.find((d) => d.id === id)?.name ?? id;
}

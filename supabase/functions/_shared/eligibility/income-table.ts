// 소득 기준표·민영 예치금 표 (BR-U2-43·46)
import { normalizeSido } from "../domain/profile.ts";
import type { IncomeBasis } from "../domain/requirements.ts";

export interface IncomeThreshold {
  year: number;
  basis: IncomeBasis;
  householdSize: number;
  /** 100% 금액(원) */
  amountWon: number;
}

export type IncomeTable = ReadonlyMap<string, number>;

const key = (year: number, basis: IncomeBasis, size: number) => `${year}|${basis}|${size}`;

export function createIncomeTable(rows: readonly IncomeThreshold[]): IncomeTable {
  return new Map(rows.map((r) => [key(r.year, r.basis, r.householdSize), r.amountWon]));
}

/** 기준 금액(원) = round(100% 금액 × 비율 / 100). 표에 없으면 null. */
export function incomeLimitWon(
  table: IncomeTable,
  year: number,
  basis: IncomeBasis,
  householdSize: number,
  percent: number,
): number | null {
  const base = table.get(key(year, basis, householdSize));
  return base === undefined ? null : Math.round((base * percent) / 100);
}

// 주택공급에 관한 규칙 별표2 — 민영주택 청약 예치기준금액(만원): 전용 85㎡ 이하 / 102 이하 / 135 이하 / 135 초과
const DEPOSIT_TIERS = {
  seoulBusan: [300, 600, 1000, 1500],
  metro: [250, 400, 700, 1000],
  others: [200, 300, 400, 500],
} as const;
const AREA_LIMITS = [85, 102, 135] as const;

export function depositTiers(sido: string): readonly number[] {
  const s = normalizeSido(sido);
  if (s === "서울" || s === "부산") return DEPOSIT_TIERS.seoulBusan;
  if (["인천", "대구", "광주", "대전", "울산"].includes(s)) return DEPOSIT_TIERS.metro;
  return DEPOSIT_TIERS.others;
}

/** 면적에 맞는 예치금(만원). */
export function depositFor(tiers: readonly number[], areaM2: number): number {
  const index = AREA_LIMITS.findIndex((limit) => areaM2 <= limit);
  return tiers[index === -1 ? 3 : index]!;
}

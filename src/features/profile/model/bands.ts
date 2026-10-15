// 기간 구간 (BR-U4-30·31): 구간을 고르면 판정에는 구간의 아래 값을 저장한다.
// 아래 값을 쓰면 "2년 이상" 같은 조건을 실제보다 길게 잡아 잘못 충족으로 보는 일이 없다.

export interface BandDef<B extends string> {
  band: B;
  label: string;
  /** 저장 값 (년 또는 개월) */
  lower: number;
}

export type YearBand = "lt1" | "1to2" | "2to3" | "3to5" | "5to10" | "ge10";
export type HomelessBand = "lt1" | "1to2" | "2to3" | "3to5" | "5to10" | "10to15" | "ge15";
export type MonthsBand = "lt6" | "6to12" | "12to24" | "24to60" | "60to120" | "ge120";

/** 거주 기간 → residence.years (년) */
export const RESIDENCE_BANDS: readonly BandDef<YearBand>[] = [
  { band: "lt1", label: "1년 미만", lower: 0 },
  { band: "1to2", label: "1~2년", lower: 1 },
  { band: "2to3", label: "2~3년", lower: 2 },
  { band: "3to5", label: "3~5년", lower: 3 },
  { band: "5to10", label: "5~10년", lower: 5 },
  { band: "ge10", label: "10년 이상", lower: 10 },
];

/** 무주택 기간 → housing.homelessYears (년) */
export const HOMELESS_BANDS: readonly BandDef<HomelessBand>[] = [
  { band: "lt1", label: "1년 미만", lower: 0 },
  { band: "1to2", label: "1~2년", lower: 1 },
  { band: "2to3", label: "2~3년", lower: 2 },
  { band: "3to5", label: "3~5년", lower: 3 },
  { band: "5to10", label: "5~10년", lower: 5 },
  { band: "10to15", label: "10~15년", lower: 10 },
  { band: "ge15", label: "15년 이상", lower: 15 },
];

/** 통장 가입 기간 → savings.months (개월) */
export const MONTHS_BANDS: readonly BandDef<MonthsBand>[] = [
  { band: "lt6", label: "6개월 미만", lower: 0 },
  { band: "6to12", label: "6개월~1년", lower: 6 },
  { band: "12to24", label: "1~2년", lower: 12 },
  { band: "24to60", label: "2~5년", lower: 24 },
  { band: "60to120", label: "5~10년", lower: 60 },
  { band: "ge120", label: "10년 이상", lower: 120 },
];

export function lowerOf<B extends string>(bands: readonly BandDef<B>[], band: B): number {
  const found = bands.find((b) => b.band === band);
  if (!found) throw new Error(`알 수 없는 구간: ${band}`);
  return found.lower;
}

/** 저장 값 → 구간: 아래 값 ≤ 값인 가장 큰 구간 (고치기 화면에서 다시 보여 줄 때) */
export function bandOf<B extends string>(bands: readonly BandDef<B>[], value: number): B {
  let current = bands[0]!;
  for (const b of bands) if (b.lower <= value) current = b;
  return current.band;
}

export function bandLabel<B extends string>(bands: readonly BandDef<B>[], band: B): string {
  return bands.find((b) => b.band === band)?.label ?? "";
}

export function isBand<B extends string>(bands: readonly BandDef<B>[], value: unknown): value is B {
  return bands.some((b) => b.band === value);
}

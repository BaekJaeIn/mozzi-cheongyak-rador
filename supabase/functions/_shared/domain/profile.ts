// 가구 프로필 v1 (U2 domain-entities §1) — 만 나이, 면적 구간, 시도 이름 정규화, 형식 검증
import { type IsoDate, isIsoDate } from "./dates.ts";

export const PROFILE_SCHEMA_VERSION = 1 as const;
/** 금액 상한(만원) — 100억원 (BR-U2-72) */
export const MAX_AMOUNT_MANWON = 1_000_000;
export const MAX_HOUSEHOLD_SIZE = 8;

export type AreaBand = "xs" | "s" | "m" | "l";
export const AREA_BANDS: readonly AreaBand[] = ["xs", "s", "m", "l"];
export type WelfareStatus = "livelihood_or_medical" | "near_poverty" | "other_priority" | "none";
export const WELFARE_STATUSES: readonly WelfareStatus[] = ["livelihood_or_medical", "near_poverty", "other_priority", "none"];
export type SavingsKind = "comprehensive" | "savings" | "deposit" | "installment";
export const SAVINGS_KINDS: readonly SavingsKind[] = ["comprehensive", "savings", "deposit", "installment"];
export type HouseholdType = "couple" | "single" | "other";
export type HouseholdHead = "self" | "spouse" | "other";
export type Tenure = "sale" | "rent";
export type TenurePref = Tenure | "both";

export interface HouseholdProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  self: { birthDate: IsoDate | null };
  spouse: { birthDate: IsoDate | null } | null;
  householdType: HouseholdType;
  householdSize: number;
  householdHead: HouseholdHead | null;
  residence: { sido: string | null; sigungu: string | null; years: number | null };
  housing: { homeless: boolean | null; homelessYears: number | null; ownedCount: number | null };
  savings: {
    has: boolean | null;
    kind: SavingsKind | null;
    months: number | null;
    paymentCount: number | null;
    depositManwon: number | null;
  };
  money: {
    monthlyIncome: number | null;
    totalAsset: number | null;
    carValue: number | null;
    spouseEarns: boolean | null;
  };
  welfare: WelfareStatus | null;
  prefs: {
    districtIds: string[];
    areaBands: AreaBand[];
    tenure: TenurePref;
    lowFloor: boolean;
  };
}

export interface HouseholdMember {
  role: "self" | "spouse";
  birthDate: IsoDate | null;
}

/** 판정에 쓰는 부부 구성원 (배우자가 없으면 본인만). */
export function householdMembers(profile: HouseholdProfile): HouseholdMember[] {
  const members: HouseholdMember[] = [{ role: "self", birthDate: profile.self.birthDate }];
  if (profile.spouse) members.push({ role: "spouse", birthDate: profile.spouse.birthDate });
  return members;
}

/**
 * 만 나이 (BR-U2-36). 기준일이 생일 전이면 한 살 적다.
 * 2월 29일생은 평년에 (2, 28) < (2, 29) 이므로 3월 1일에 나이가 든다.
 */
export function ageAt(birthDate: IsoDate, baseDate: IsoDate): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [y, m, d] = baseDate.split("-").map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** 면적 구간 (BR-U2-60): ~40 / 40 초과~60 / 60 초과~85 / 85 초과 */
export function areaBandOf(areaM2: number): AreaBand {
  if (areaM2 <= 40) return "xs";
  if (areaM2 <= 60) return "s";
  if (areaM2 <= 85) return "m";
  return "l";
}

const SIDO_ALIASES: [string, string[]][] = [
  ["서울", ["서울특별시", "서울시", "서울"]],
  ["부산", ["부산광역시", "부산시", "부산"]],
  ["대구", ["대구광역시", "대구시", "대구"]],
  ["인천", ["인천광역시", "인천시", "인천"]],
  ["광주", ["광주광역시", "광주시", "광주"]],
  ["대전", ["대전광역시", "대전시", "대전"]],
  ["울산", ["울산광역시", "울산시", "울산"]],
  ["세종", ["세종특별자치시", "세종시", "세종"]],
  ["경기", ["경기도", "경기"]],
  ["강원", ["강원특별자치도", "강원도", "강원"]],
  ["충북", ["충청북도", "충북"]],
  ["충남", ["충청남도", "충남"]],
  ["전북", ["전북특별자치도", "전라북도", "전북"]],
  ["전남", ["전라남도", "전남"]],
  ["경북", ["경상북도", "경북"]],
  ["경남", ["경상남도", "경남"]],
  ["제주", ["제주특별자치도", "제주도", "제주"]],
];

/** "서울특별시" → "서울" 처럼 줄임 이름으로 맞춘다. 모르는 이름은 공백만 지워 돌려준다. */
export function normalizeSido(name: string): string {
  const compact = name.normalize("NFC").replace(/\s+/g, "");
  for (const [canonical, aliases] of SIDO_ALIASES) {
    if (aliases.some((alias) => compact === alias)) return canonical;
  }
  return compact;
}

// ---------- 형식 검증 (서버 저장 전, BR-U2-72) ----------

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNullableBool = (v: unknown) => v === null || typeof v === "boolean";
const isNullableInt = (v: unknown, min: number, max: number) =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max);
const isNullableDate = (v: unknown) => v === null || isIsoDate(v);
const isNullableString = (v: unknown, maxLength = 40) =>
  v === null || (typeof v === "string" && v.length > 0 && v.length <= maxLength);

export function validateProfile(input: unknown): ValidationResult<HouseholdProfile> {
  const errors: string[] = [];
  const check = (condition: boolean, path: string) => {
    if (!condition) errors.push(path);
  };
  if (!isObject(input)) return { ok: false, errors: ["profile"] };
  const p = input;

  check(p.schemaVersion === PROFILE_SCHEMA_VERSION, "schemaVersion");
  check(isObject(p.self) && isNullableDate(p.self.birthDate), "self.birthDate");
  check(p.spouse === null || (isObject(p.spouse) && isNullableDate(p.spouse.birthDate)), "spouse");
  check(["couple", "single", "other"].includes(p.householdType as string), "householdType");
  check(
    typeof p.householdSize === "number" && Number.isInteger(p.householdSize) && p.householdSize >= 1 && p.householdSize <= MAX_HOUSEHOLD_SIZE,
    "householdSize",
  );
  check(p.householdHead === null || ["self", "spouse", "other"].includes(p.householdHead as string), "householdHead");

  const r = p.residence;
  check(isObject(r) && isNullableString(r.sido) && isNullableString(r.sigungu) && isNullableInt(r.years, 0, 120), "residence");
  const h = p.housing;
  check(
    isObject(h) && isNullableBool(h.homeless) && isNullableInt(h.homelessYears, 0, 120) && isNullableInt(h.ownedCount, 0, 100),
    "housing",
  );
  const s = p.savings;
  check(
    isObject(s) &&
      isNullableBool(s.has) &&
      (s.kind === null || SAVINGS_KINDS.includes(s.kind as SavingsKind)) &&
      isNullableInt(s.months, 0, 1200) &&
      isNullableInt(s.paymentCount, 0, 1200) &&
      isNullableInt(s.depositManwon, 0, MAX_AMOUNT_MANWON),
    "savings",
  );
  const m = p.money;
  check(
    isObject(m) &&
      isNullableInt(m.monthlyIncome, 0, MAX_AMOUNT_MANWON) &&
      isNullableInt(m.totalAsset, 0, MAX_AMOUNT_MANWON) &&
      isNullableInt(m.carValue, 0, MAX_AMOUNT_MANWON) &&
      isNullableBool(m.spouseEarns),
    "money",
  );
  check(p.welfare === null || WELFARE_STATUSES.includes(p.welfare as WelfareStatus), "welfare");
  const pr = p.prefs;
  check(
    isObject(pr) &&
      Array.isArray(pr.districtIds) &&
      pr.districtIds.length >= 1 &&
      pr.districtIds.length <= 20 &&
      pr.districtIds.every((id) => typeof id === "string" && /^[a-z_]{2,40}$/.test(id)) &&
      Array.isArray(pr.areaBands) &&
      pr.areaBands.every((b) => AREA_BANDS.includes(b as AreaBand)) &&
      ["sale", "rent", "both"].includes(pr.tenure as string) &&
      typeof pr.lowFloor === "boolean",
    "prefs",
  );

  return errors.length === 0 ? { ok: true, value: input as unknown as HouseholdProfile } : { ok: false, errors };
}

// 가구 프로필 v3 (U2 domain-entities §1 + 변경 2·3) — 만 나이, 면적 구간, 형식 검증
// v2: 청약통장 명의(savings.owner), 관심 시군구(prefs.regions)
// v3: 가구 종류(householdKind), 신혼 가구 정보(newlywed), 배우자 월소득(money.spouseMonthlyIncome). v1·v2는 profile-migrate.ts로 옮겨 읽는다
import { type IsoDate, isIsoDate } from "./dates.ts";
import { type CapitalSido, CAPITAL_SIGUNGU, isCapitalSido, isCapitalSigungu } from "./regions.ts";

export const PROFILE_SCHEMA_VERSION = 3 as const;
/** 금액 상한(만원) — 100억원 (BR-U2-72) */
export const MAX_AMOUNT_MANWON = 1_000_000;
export const MAX_HOUSEHOLD_SIZE = 8;

export type AreaBand = "xs" | "s" | "m" | "l";
export const AREA_BANDS: readonly AreaBand[] = ["xs", "s", "m", "l"];
export type WelfareStatus = "livelihood_or_medical" | "near_poverty" | "other_priority" | "none";
export const WELFARE_STATUSES: readonly WelfareStatus[] = ["livelihood_or_medical", "near_poverty", "other_priority", "none"];
export type SavingsKind = "comprehensive" | "savings" | "deposit" | "installment";
export const SAVINGS_KINDS: readonly SavingsKind[] = ["comprehensive", "savings", "deposit", "installment"];
/** 청약통장 명의 — 부부 가구 기준 판정이라 판정에는 쓰지 않고 사유 문구에만 쓴다 (BR-U2-C7·C8) */
export type SavingsOwner = "self" | "spouse" | "both";
export const SAVINGS_OWNERS: readonly SavingsOwner[] = ["self", "spouse", "both"];
/** 관심 시군구. sigungu null = 그 시도 전체 (U2 변경 2 Q1=A) */
export interface RegionPick {
  sido: CapitalSido;
  sigungu: string | null;
}
export const MAX_REGION_PICKS = 60;
export type HouseholdType = "couple" | "single" | "other";
export type HouseholdHead = "self" | "spouse" | "other";
export type Tenure = "sale" | "rent";
/** 가구 종류 (변경 3 BR-U2-D1) — 질문·판정·요약 "볼 점"이 달라진다 */
export type HouseholdKind = "senior" | "newlywed";
export const HOUSEHOLD_KINDS: readonly HouseholdKind[] = ["senior", "newlywed"];
export type MarriageStatus = "engaged" | "married";
export const MAX_CHILDREN = 10;

/** 청약통장 한 개 */
export interface SavingsInfo {
  has: boolean | null;
  /** has가 true일 때만 값이 있다. 혼자 사는 가구는 "self" */
  owner: SavingsOwner | null;
  kind: SavingsKind | null;
  months: number | null;
  paymentCount: number | null;
  depositManwon: number | null;
}

/** 신혼 가구 정보 (변경 3 domain-entities) — senior 가구는 null */
export interface NewlywedInfo {
  /** 예비신혼 / 혼인신고 함 / 모름 */
  marriage: MarriageStatus | null;
  /** 혼인신고일, 예비신혼은 예정일 */
  marriageDate: IsoDate | null;
  /** 태아 포함 — 판정에는 쓰지 않는다 (BR-U2-D42) */
  children: number | null;
  /** 세대원 모두 지금까지 집을 가진 적 없음 (생애최초) */
  neverOwnedHome: boolean | null;
  /** 5년 이상 소득세를 낸 분이 있음 (생애최초) */
  incomeTax5y: boolean | null;
  /** 배우자 통장 (Q4=A). 본인 통장은 profile.savings */
  spouseSavings: SavingsInfo | null;
}
export type TenurePref = Tenure | "both";

export interface HouseholdProfile {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  householdKind: HouseholdKind;
  self: { birthDate: IsoDate | null };
  spouse: { birthDate: IsoDate | null } | null;
  householdType: HouseholdType;
  householdSize: number;
  householdHead: HouseholdHead | null;
  residence: { sido: string | null; sigungu: string | null; years: number | null };
  housing: { homeless: boolean | null; homelessYears: number | null; ownedCount: number | null };
  savings: SavingsInfo;
  money: {
    /** 부부 합계. 신혼 가구는 본인 + 배우자 (BR-U2-D23) */
    monthlyIncome: number | null;
    /** 신혼 가구만 — 배우자 월소득 (서버 암호화) */
    spouseMonthlyIncome?: number | null;
    totalAsset: number | null;
    carValue: number | null;
    spouseEarns: boolean | null;
  };
  welfare: WelfareStatus | null;
  newlywed: NewlywedInfo | null;
  prefs: {
    /** 3기 신도시 지구 */
    districtIds: string[];
    /** 관심 시군구 (지구와 합쳐 1곳 이상) */
    regions: RegionPick[];
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

// 시도 이름 정규화는 공용 지역 데이터로 옮김 (변경 2, FR-C2-9) — 사용처를 위해 다시 내보낸다
export { findSido, normalizeSido } from "./regions.ts";

// ---------- 형식 검증 (서버 저장 전, BR-U2-72) ----------

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNullableBool = (v: unknown) => v === null || typeof v === "boolean";
const isNullableInt = (v: unknown, min: number, max: number) =>
  v === null || (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max);
const isNullableDate = (v: unknown) => v === null || isIsoDate(v);
const isNullableString = (v: unknown, maxLength = 40) =>
  v === null || (typeof v === "string" && v.length > 0 && v.length <= maxLength);

/** 관심 시군구 검사: 수도권·목록 안·중복 없음·시도 전체를 고른 시도에는 시군구를 두지 않음 */
export function isValidRegionPicks(value: unknown): value is RegionPick[] {
  if (!Array.isArray(value) || value.length > MAX_REGION_PICKS) return false;
  const keys = new Set<string>();
  const wholeSido = new Set<string>();
  for (const v of value) {
    if (!isObject(v) || !isCapitalSido(v.sido)) return false;
    if (v.sigungu !== null && (typeof v.sigungu !== "string" || !isCapitalSigungu(v.sido, v.sigungu))) return false;
    const key = `${v.sido}|${v.sigungu ?? "*"}`;
    if (keys.has(key)) return false;
    keys.add(key);
    if (v.sigungu === null) wholeSido.add(v.sido);
  }
  return value.every((v) => v.sigungu === null || !wholeSido.has(v.sido));
}

/** 관심 시군구를 검사 규칙에 맞게 정리: 중복 제거, 시도 전체가 있으면 그 시도의 시군구는 뺀다, 목록 순서로 */
export function normalizeRegionPicks(picks: readonly RegionPick[]): RegionPick[] {
  const whole = new Set(picks.filter((p) => p.sigungu === null).map((p) => p.sido));
  const out: RegionPick[] = [];
  for (const sido of Object.keys(CAPITAL_SIGUNGU) as CapitalSido[]) {
    if (whole.has(sido)) {
      out.push({ sido, sigungu: null });
      continue;
    }
    for (const name of CAPITAL_SIGUNGU[sido]) if (picks.some((p) => p.sido === sido && p.sigungu === name)) out.push({ sido, sigungu: name });
  }
  return out;
}

function isSavingsInfo(s: unknown, spousePresent: boolean): s is SavingsInfo {
  return (
    isObject(s) &&
    isNullableBool(s.has) &&
    (s.owner === null || SAVINGS_OWNERS.includes(s.owner as SavingsOwner)) &&
    (s.has === true || s.owner === null) &&
    (spousePresent || s.owner === null || s.owner === "self") &&
    (s.kind === null || SAVINGS_KINDS.includes(s.kind as SavingsKind)) &&
    isNullableInt(s.months, 0, 1200) &&
    isNullableInt(s.paymentCount, 0, 1200) &&
    isNullableInt(s.depositManwon, 0, MAX_AMOUNT_MANWON)
  );
}

function isNewlywedInfo(n: unknown): n is NewlywedInfo {
  return (
    isObject(n) &&
    (n.marriage === null || n.marriage === "engaged" || n.marriage === "married") &&
    isNullableDate(n.marriageDate) &&
    isNullableInt(n.children, 0, MAX_CHILDREN) &&
    isNullableBool(n.neverOwnedHome) &&
    isNullableBool(n.incomeTax5y) &&
    (n.spouseSavings === null || (isSavingsInfo(n.spouseSavings, true) && n.spouseSavings.owner !== "self"))
  );
}

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
  const spousePresent = p.spouse !== null && p.spouse !== undefined;
  const newlywedKind = p.householdKind === "newlywed";
  check(HOUSEHOLD_KINDS.includes(p.householdKind as HouseholdKind), "householdKind");
  // 신혼 가구는 본인 통장만 본인 명의 (배우자 통장은 newlywed.spouseSavings, BR-U2-D30)
  check(isSavingsInfo(p.savings, spousePresent) && (!newlywedKind || (p.savings as SavingsInfo).owner !== "spouse" && (p.savings as SavingsInfo).owner !== "both"), "savings");
  const m = p.money;
  check(
    isObject(m) &&
      isNullableInt(m.monthlyIncome, 0, MAX_AMOUNT_MANWON) &&
      (m.spouseMonthlyIncome === undefined || isNullableInt(m.spouseMonthlyIncome, 0, MAX_AMOUNT_MANWON)) &&
      (newlywedKind || m.spouseMonthlyIncome === undefined || m.spouseMonthlyIncome === null) &&
      isNullableInt(m.totalAsset, 0, MAX_AMOUNT_MANWON) &&
      isNullableInt(m.carValue, 0, MAX_AMOUNT_MANWON) &&
      isNullableBool(m.spouseEarns),
    "money",
  );
  // BR-U2-D3: 신혼 가구는 배우자(또는 예정 배우자)와 신혼 정보가 있어야 하고, senior는 신혼 정보가 없다
  check(newlywedKind ? spousePresent && isNewlywedInfo(p.newlywed) : p.newlywed === null, "newlywed");
  check(p.welfare === null || WELFARE_STATUSES.includes(p.welfare as WelfareStatus), "welfare");
  const pr = p.prefs;
  check(
    isObject(pr) &&
      Array.isArray(pr.districtIds) &&
      pr.districtIds.length <= 20 &&
      isValidRegionPicks(pr.regions) &&
      pr.districtIds.length + (pr.regions as unknown[]).length >= 1 &&
      pr.districtIds.every((id) => typeof id === "string" && /^[a-z_]{2,40}$/.test(id)) &&
      Array.isArray(pr.areaBands) &&
      pr.areaBands.every((b) => AREA_BANDS.includes(b as AreaBand)) &&
      ["sale", "rent", "both"].includes(pr.tenure as string) &&
      typeof pr.lowFloor === "boolean",
    "prefs",
  );

  return errors.length === 0 ? { ok: true, value: input as unknown as HouseholdProfile } : { ok: false, errors };
}

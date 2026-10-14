// 주택형 요건 (U2 domain-entities §2). 키가 없으면 조건 없음, "unknown"이면 조건은 있으나 내용을 모름.
import { normalizeSido } from "./profile.ts";

export type Unknown = "unknown";
export type IncomeBasis = "urban_worker" | "median";
export type WelfareKind = "livelihood_or_medical" | "near_poverty" | "other_priority";

export interface IncomeRequirement {
  basis: IncomeBasis;
  percent: number;
  percentBySize?: Record<number, number>;
  dualIncomePercent?: number;
  amountsWon?: Record<number, number>;
  appliesToAreaMaxM2?: number;
}

export interface SavingsRequirement {
  minMonths: number;
  minPayments?: number;
  depositRule?: "private_by_region_area";
  minDepositManwon?: number;
}

export interface WelfareRequirement {
  anyOf: WelfareKind[];
  orIncome?: IncomeRequirement;
}

export interface Requirements {
  unclassified?: true;
  age?: { minAge: number; who: "member" | "head" } | Unknown;
  homeless?: { minYears: number | null } | Unknown;
  income?: IncomeRequirement | Unknown;
  asset?: { maxManwon: number } | Unknown;
  car?: { maxManwon: number } | Unknown;
  savings?: SavingsRequirement | Unknown;
  residence?: { sidoIn: string[] } | Unknown;
  household?: { headRequired: boolean } | Unknown;
  welfare?: WelfareRequirement | Unknown;
}

export type RequirementKey = Exclude<keyof Requirements, "unclassified">;
export const REQUIREMENT_KEYS: readonly RequirementKey[] = [
  "age",
  "homeless",
  "income",
  "asset",
  "car",
  "savings",
  "residence",
  "household",
  "welfare",
];
/** 구조 조건 (BR-U2-23·24) — 그 밖은 금액·기간 조건 (BR-U2-25) */
export const STRUCTURAL_KEYS: ReadonlySet<RequirementKey> = new Set(["age", "homeless", "residence", "household", "welfare"]);

// ---------- 형식 검증 (AI 추출 결과 등 바깥 JSON) ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: unknown, min: number, max: number): v is number => isNum(v, min, max) && Number.isInteger(v);

function isSizeMap(v: unknown, min: number, max: number, integer: boolean): boolean {
  if (!isObject(v)) return false;
  return Object.entries(v).every(
    ([k, val]) => /^[1-8]$/.test(k) && (integer ? isInt(val, min, max) : isNum(val, min, max)),
  );
}

function isIncome(v: unknown): v is IncomeRequirement {
  if (!isObject(v)) return false;
  return (
    (v.basis === "urban_worker" || v.basis === "median") &&
    isNum(v.percent, 1, 500) &&
    (v.percentBySize === undefined || isSizeMap(v.percentBySize, 1, 500, false)) &&
    (v.dualIncomePercent === undefined || isNum(v.dualIncomePercent, 1, 500)) &&
    (v.amountsWon === undefined || isSizeMap(v.amountsWon, 1, 1_000_000_000, true)) &&
    (v.appliesToAreaMaxM2 === undefined || isNum(v.appliesToAreaMaxM2, 1, 1000))
  );
}

const WELFARE_KINDS: readonly WelfareKind[] = ["livelihood_or_medical", "near_poverty", "other_priority"];

const VALIDATORS: Record<RequirementKey, (v: unknown) => boolean> = {
  age: (v) => isObject(v) && isInt(v.minAge, 0, 120) && (v.who === "member" || v.who === "head"),
  homeless: (v) => isObject(v) && (v.minYears === null || isInt(v.minYears, 0, 100)),
  income: isIncome,
  asset: (v) => isObject(v) && isInt(v.maxManwon, 0, 10_000_000),
  car: (v) => isObject(v) && isInt(v.maxManwon, 0, 10_000_000),
  savings: (v) =>
    isObject(v) &&
    isInt(v.minMonths, 0, 600) &&
    (v.minPayments === undefined || isInt(v.minPayments, 0, 600)) &&
    (v.depositRule === undefined || v.depositRule === "private_by_region_area") &&
    (v.minDepositManwon === undefined || isInt(v.minDepositManwon, 0, 100_000)),
  residence: (v) =>
    isObject(v) &&
    Array.isArray(v.sidoIn) &&
    v.sidoIn.length > 0 &&
    v.sidoIn.every((s) => typeof s === "string" && s.length > 0 && s.length <= 20),
  household: (v) => isObject(v) && typeof v.headRequired === "boolean",
  welfare: (v) =>
    isObject(v) &&
    Array.isArray(v.anyOf) &&
    v.anyOf.every((k) => WELFARE_KINDS.includes(k as WelfareKind)) &&
    (v.orIncome === undefined || isIncome(v.orIncome)),
};

/**
 * 바깥 JSON을 요건으로 검증한다. 하나라도 형식이 틀리면 null (추출 결과 전체를 믿지 않음).
 * 거주 시도 이름은 줄임 이름으로 맞춘다.
 */
export function validateRequirements(input: unknown): Requirements | null {
  if (!isObject(input)) return null;
  const out: Requirements = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "unclassified") {
      if (value !== true) return null;
      out.unclassified = true;
      continue;
    }
    if (!(REQUIREMENT_KEYS as readonly string[]).includes(key)) return null;
    const k = key as RequirementKey;
    if (value === "unknown") {
      (out as Record<string, unknown>)[k] = "unknown";
      continue;
    }
    if (!VALIDATORS[k](value)) return null;
    (out as Record<string, unknown>)[k] =
      k === "residence" ? { sidoIn: (value as { sidoIn: string[] }).sidoIn.map(normalizeSido) } : value;
  }
  return out;
}

// Gemini 응답 검증 (BR-U3-63·64): 어떤 JSON이 와도 예외 없이 검증 결과 또는 null
import { type Requirements, validateRequirements } from "../domain/requirements.ts";
import { parseSourceDate } from "./dates.ts";
import { SCHEDULE_KEYS, type ExtractedUnit, type NoticeExtraction, type Schedule } from "./types.ts";

export const SUMMARY_MAX_CHARS = 600;
const MAX_UNITS = 40;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
const int = (v: unknown, min: number, max: number): number | null => {
  const n = num(v, min, max);
  return n !== null && Number.isInteger(n) ? n : null;
};
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);

/** Gemini의 납작한 요건 필드 → U2 Requirements (형식 검증 실패 시 null) */
export function flatToRequirements(flat: unknown): Requirements | null {
  if (!isObject(flat)) return null;
  const out: Record<string, unknown> = {};

  const minAge = int(flat.minAge, 0, 120);
  if (minAge !== null) out.age = { minAge, who: flat.ageBasis === "head" ? "head" : "member" };

  if (flat.homelessRequired === true) out.homeless = { minYears: int(flat.homelessMinYears, 1, 100) };

  const basis = flat.incomeBasis === "urban_worker" || flat.incomeBasis === "median" ? flat.incomeBasis : null;
  const percent = num(flat.incomePercent, 1, 500);
  if (basis && percent !== null) {
    const income: Record<string, unknown> = { basis, percent };
    const bySize: Record<string, number> = {};
    const p1 = num(flat.incomePercentFor1, 1, 500);
    const p2 = num(flat.incomePercentFor2, 1, 500);
    if (p1 !== null) bySize["1"] = p1;
    if (p2 !== null) bySize["2"] = p2;
    if (Object.keys(bySize).length > 0) income.percentBySize = bySize;
    const dual = num(flat.incomeDualPercent, 1, 500);
    if (dual !== null) income.dualIncomePercent = dual;
    if (Array.isArray(flat.incomeAmounts)) {
      const amounts: Record<string, number> = {};
      for (const row of flat.incomeAmounts) {
        if (!isObject(row)) continue;
        const size = int(row.householdSize, 1, 8);
        const won = int(row.amountWon, 1, 1_000_000_000);
        if (size !== null && won !== null) amounts[String(size)] = won;
      }
      if (Object.keys(amounts).length > 0) income.amountsWon = amounts;
    }
    const areaMax = num(flat.incomeAppliesToAreaMaxM2, 1, 1000);
    if (areaMax !== null) income.appliesToAreaMaxM2 = areaMax;
    out.income = income;
  }

  const asset = int(flat.assetMaxManwon, 0, 10_000_000);
  if (asset !== null) out.asset = { maxManwon: asset };
  const car = int(flat.carMaxManwon, 0, 10_000_000);
  if (car !== null) out.car = { maxManwon: car };

  const months = int(flat.savingsMinMonths, 0, 600);
  if (months !== null) {
    const savings: Record<string, unknown> = { minMonths: months };
    const payments = int(flat.savingsMinPayments, 0, 600);
    if (payments !== null) savings.minPayments = payments;
    const deposit = int(flat.savingsMinDepositManwon, 0, 100_000);
    if (deposit !== null) savings.minDepositManwon = deposit;
    out.savings = savings;
  }

  if (Array.isArray(flat.residenceSido)) {
    const sidoIn = flat.residenceSido.filter((s): s is string => typeof s === "string" && s.trim() !== "");
    if (sidoIn.length > 0) out.residence = { sidoIn };
  }
  if (flat.headRequired === true) out.household = { headRequired: true };
  if (Array.isArray(flat.welfareAnyOf)) {
    const anyOf = flat.welfareAnyOf.filter((k) => k === "livelihood_or_medical" || k === "near_poverty" || k === "other_priority");
    if (anyOf.length > 0) out.welfare = { anyOf };
  }

  return validateRequirements(out);
}

function parseSchedule(v: unknown): Schedule {
  const src = isObject(v) ? v : {};
  const out = {} as Schedule;
  for (const key of SCHEDULE_KEYS) out[key] = parseSourceDate(src[key]);
  return out;
}

function parseUnit(v: unknown): ExtractedUnit | null {
  if (!isObject(v)) return null;
  const supplyTypeText = str(v.supplyTypeText);
  if (!supplyTypeText) return null;
  return {
    label: str(v.label, 40),
    supplyTypeText,
    exclusiveAreaM2: num(v.exclusiveAreaM2, 1, 1000),
    supplyCount: int(v.supplyCount, 0, 100_000),
    requirements: flatToRequirements(v.requirements),
  };
}

function parseSummary(v: unknown): NoticeExtraction["summary"] {
  if (!isObject(v)) return null;
  const a = str(v.eligibilityPlain, SUMMARY_MAX_CHARS);
  const b = str(v.forSeniorCouple, SUMMARY_MAX_CHARS);
  return a && b ? { eligibilityPlain: a, forSeniorCouple: b } : null;
}

/** 응답 전체 검증. 최상위 형식이 틀리면 null (실패로 셈) */
export function parseExtraction(json: unknown): NoticeExtraction | null {
  if (!isObject(json) || typeof json.isNotice !== "boolean") return null;
  if (!json.isNotice) return { isNotice: false, schedule: parseSchedule(null), units: [], summary: null };
  const units = Array.isArray(json.units)
    ? json.units.slice(0, MAX_UNITS).map(parseUnit).filter((u): u is ExtractedUnit => u !== null)
    : [];
  return { isNotice: true, schedule: parseSchedule(json.schedule), units, summary: parseSummary(json.summary) };
}

// Gemini 응답 검증 (BR-U3-63·64): 어떤 JSON이 와도 예외 없이 검증 결과 또는 null
import { type Requirements, validateRequirements } from "../domain/requirements.ts";
import { parseSourceDate } from "./dates.ts";
import { type NoticeAudience, parseAudiences } from "../domain/audiences.ts";
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
    // 변경 3 BR-U3-D12: 우선공급·추첨
    const priority = num(flat.incomePriorityPercent, 1, 500);
    if (priority !== null) income.priorityPercent = priority;
    const priorityDual = num(flat.incomePriorityDualPercent, 1, 500);
    if (priorityDual !== null) income.priorityDualIncomePercent = priorityDual;
    const lottery = int(flat.lotteryRealEstateMaxManwon, 0, 10_000_000);
    if (lottery !== null) income.overLottery = { realEstateMaxManwon: lottery };
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
  // 변경 3 BR-U3-D12: 혼인·예비신혼, 생애최초
  const marriageYears = int(flat.marriageMaxYears, 1, 30);
  if (marriageYears !== null) {
    out.marriage = { maxYears: marriageYears, engagedAllowed: typeof flat.preNewlywedAllowed === "boolean" ? flat.preNewlywedAllowed : "unknown" };
  }
  const taxYears = int(flat.firstTimeIncomeTaxYears, 0, 30);
  if (taxYears !== null) out.firstTime = { neverOwned: true, incomeTaxYears: taxYears, marriedOrChildRequired: true };
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
  if (!a || !b) return null;
  // 변경 3 BR-U3-D21: 신혼부부가 볼 점은 선택 — 틀리거나 비어도 나머지는 살린다
  const c = str(v.forNewlywed, SUMMARY_MAX_CHARS);
  return c ? { eligibilityPlain: a, forSeniorCouple: b, forNewlywed: c } : { eligibilityPlain: a, forSeniorCouple: b };
}

/** 공급 위치: 문자열 최대 10개, 각 40자 (판별은 regions.ts가 공용 목록으로) */
function parseSupplySigungu(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, 10).map((s) => str(s, 40)).filter((s): s is string => s !== null);
  return out.length > 0 ? out : null;
}

/** 신청 대상 (변경 4 BR-U3-E22): 배열이 아니면 null(모름), 형식이 틀린 값은 버린다 */
function parseAudienceList(v: unknown): NoticeAudience[] | null {
  return Array.isArray(v) ? parseAudiences(v) : null;
}

/** 응답 전체 검증. 최상위 형식이 틀리면 null (실패로 셈) */
export function parseExtraction(json: unknown): NoticeExtraction | null {
  if (!isObject(json) || typeof json.isNotice !== "boolean") return null;
  if (!json.isNotice) return { isNotice: false, schedule: parseSchedule(null), units: [], summary: null };
  const units = Array.isArray(json.units)
    ? json.units.slice(0, MAX_UNITS).map(parseUnit).filter((u): u is ExtractedUnit => u !== null)
    : [];
  return { isNotice: true, schedule: parseSchedule(json.schedule), units, summary: parseSummary(json.summary),
    supplySigungu: parseSupplySigungu(json.supplySigungu),
    audiences: parseAudienceList(json.audiences),
  };
}

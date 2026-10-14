// 표준 요건 + AI 추출 요건 확정 (BR-U2-20~28, AD-7을 Q4=A에 맞게 다듬음)
import { REQUIREMENT_KEYS, type RequirementKey, type Requirements, STRUCTURAL_KEYS } from "./requirements.ts";

/** 추출 값이 표준 값의 0.5배~2배 안이면 믿는다 (BR-U2-25). */
export const SANITY_MIN_RATIO = 0.5;
export const SANITY_MAX_RATIO = 2;

function withinRatio(extracted: number, standard: number): boolean {
  if (standard === 0) return extracted === 0;
  const ratio = extracted / standard;
  return ratio >= SANITY_MIN_RATIO && ratio <= SANITY_MAX_RATIO;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

type Value = NonNullable<Requirements[RequirementKey]>;

/** 금액·기간 조건 둘 다 있을 때: 공고 값을 쓰되 터무니없으면 unknown (BR-U2-25). */
function resolveNumeric(key: RequirementKey, s: Value, e: Value): Value {
  if (s === "unknown" || e === "unknown") return e === "unknown" ? "unknown" : e;
  switch (key) {
    case "asset":
    case "car": {
      const sv = (s as { maxManwon: number }).maxManwon;
      const ev = (e as { maxManwon: number }).maxManwon;
      return withinRatio(ev, sv) ? e : "unknown";
    }
    case "income": {
      const si = s as Exclude<Requirements["income"], "unknown" | undefined>;
      const ei = e as Exclude<Requirements["income"], "unknown" | undefined>;
      if (si.basis !== ei.basis || !withinRatio(ei.percent, si.percent)) return "unknown";
      // 공고에 면적 적용 범위가 없으면 표준 범위를 유지
      return { ...ei, appliesToAreaMaxM2: ei.appliesToAreaMaxM2 ?? si.appliesToAreaMaxM2 };
    }
    case "savings": {
      const ss = s as Exclude<Requirements["savings"], "unknown" | undefined>;
      const es = e as Exclude<Requirements["savings"], "unknown" | undefined>;
      if (!withinRatio(es.minMonths, ss.minMonths)) return "unknown";
      return { ...es, depositRule: es.depositRule ?? ss.depositRule };
    }
    default:
      return e;
  }
}

/**
 * @param standard 공급유형 표준 요건 (S)
 * @param extracted 형식 검증을 통과한 공고 추출 요건 (E), 없으면 null
 */
export function resolveRequirements(standard: Requirements, extracted: Requirements | null): Requirements {
  if (!extracted) return standard; // BR-U2-20

  const extractedHasConditions = REQUIREMENT_KEYS.some((k) => extracted[k] !== undefined);
  if (standard.unclassified) {
    // BR-U2-28: 분류 실패를 추출로 보완
    if (!extractedHasConditions) return standard;
    const rest: Requirements = { ...extracted };
    delete rest.unclassified;
    return rest;
  }

  const out: Requirements = {};
  for (const key of REQUIREMENT_KEYS) {
    const s = standard[key];
    const e = extracted[key];
    let value: Value | undefined;
    if (s === undefined && e === undefined) value = undefined;
    else if (e === undefined) value = s; // BR-U2-21
    else if (s === undefined) value = e; // BR-U2-22
    else if (e === "unknown") value = "unknown"; // BR-U2-27
    else if (s === "unknown") value = e; // BR-U2-26
    else if (STRUCTURAL_KEYS.has(key)) value = deepEqual(s, e) ? s : "unknown"; // BR-U2-23·24
    else value = resolveNumeric(key, s, e); // BR-U2-25
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

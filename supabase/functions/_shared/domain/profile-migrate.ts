// 프로필 옮기기 v1 → v2 → v3 (U2 변경 2 BR-U2-C1~C6, 변경 3 BR-U2-D1). 기기(U4)와 서버(코덱·재계산)가 같은 함수를 쓴다
import { type HouseholdProfile, PROFILE_SCHEMA_VERSION, type ValidationResult, validateProfile } from "./profile.ts";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 버전 1 → 2. 버전 2 이상과 모르는 값은 그대로 돌려준다(검사는 validateProfile이 한다).
 * - 통장 있음 → 명의 "나" (C1), 통장 없음 → 모름 (C2: 배우자 명의 통장을 "없음"으로 넣은 경우를 숨기지 않기), 모름 → 그대로 (C3)
 * - 관심 시군구는 빈 목록, 관심 지구는 그대로 (C4)
 */
export function migrateProfile(input: unknown): unknown {
  return migrateV2toV3(migrateV1toV2(input));
}

/** 버전 2 → 3: 기존 가구는 모두 노부부, 신혼 정보 없음 (BR-U2-D1). 버전 3·모르는 값은 그대로 */
function migrateV2toV3(input: unknown): unknown {
  if (!isObject(input) || input.schemaVersion !== 2) return input;
  return { ...input, schemaVersion: PROFILE_SCHEMA_VERSION, householdKind: "senior", newlywed: null };
}

function migrateV1toV2(input: unknown): unknown {
  if (!isObject(input) || input.schemaVersion !== 1) return input;
  const savings = isObject(input.savings) ? input.savings : {};
  const prefs = isObject(input.prefs) ? input.prefs : {};
  const nextSavings =
    savings.has === true
      ? { ...savings, owner: "self" }
      : { has: null, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null };
  return { ...input, schemaVersion: 2, savings: nextSavings, prefs: { ...prefs, regions: [] } };
}

/** 옮긴 뒤 검사 — 기기 저장본·서버 저장본·API 입력을 읽을 때 쓴다 */
export function parseProfile(input: unknown): ValidationResult<HouseholdProfile> {
  return validateProfile(migrateProfile(input));
}

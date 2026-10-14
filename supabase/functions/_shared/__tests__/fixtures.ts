// 예시 테스트용 고정 데이터 (가상의 가구 — 실제 가족 정보 아님, NFR-U2-08)
import { bytesToBase64Url } from "../encoding/base64url.ts";
import type { HouseholdProfile } from "../domain/profile.ts";
import type { Requirements } from "../domain/requirements.ts";
import type { SupplyTypeCode } from "../domain/supply-types.ts";
import { createIncomeTable } from "../eligibility/income-table.ts";
import { INCOME_THRESHOLDS, STANDARD_REQUIREMENTS } from "../eligibility/reference-data.ts";
import type { EligibilityReference } from "../eligibility/engine.ts";
import type { NoticeForJudgement, UnitForJudgement } from "../eligibility/types.ts";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object | null ? DeepPartial<NonNullable<T[K]>> | T[K] : T[K] };

/** business-logic-model §4의 예시 가구 */
export function makeProfile(overrides: DeepPartial<HouseholdProfile> = {}): HouseholdProfile {
  const base: HouseholdProfile = {
    schemaVersion: 1,
    self: { birthDate: "1960-03-02" },
    spouse: { birthDate: "1963-07-01" },
    householdType: "couple",
    householdSize: 2,
    householdHead: "self",
    residence: { sido: "경기", sigungu: "하남시", years: 10 },
    housing: { homeless: true, homelessYears: 10, ownedCount: 0 },
    savings: { has: true, kind: "comprehensive", months: 120, paymentCount: 120, depositManwon: 1000 },
    money: { monthlyIncome: 450, totalAsset: 20_000, carValue: 1_500, spouseEarns: false },
    welfare: "none",
    prefs: { districtIds: ["gyosan"], areaBands: [], tenure: "both", lowFloor: false },
  };
  const merge = (a: unknown, b: unknown): unknown => {
    if (b === undefined) return a;
    if (b === null || typeof b !== "object" || Array.isArray(b) || a === null || typeof a !== "object") return b;
    const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
    for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
    return out;
  };
  return merge(base, overrides) as HouseholdProfile;
}

export const REFERENCE_2026: EligibilityReference = { incomeTable: createIncomeTable(INCOME_THRESHOLDS) };

export function makeUnit(supplyType: SupplyTypeCode, area: number | null = 36, requirements?: Requirements): UnitForJudgement {
  return { id: `unit-${supplyType}-${area}`, supplyType, exclusiveAreaM2: area, requirements: requirements ?? STANDARD_REQUIREMENTS[supplyType] };
}

export function makeNotice(units: UnitForJudgement[], overrides: Partial<NoticeForJudgement> = {}): NoticeForJudgement {
  return {
    id: "notice-1",
    tenure: "rent",
    announcedAt: "2026-09-15",
    applyStart: "2026-09-25",
    applyEnd: "2026-09-30",
    districtIds: ["gyosan"],
    units,
    ...overrides,
  };
}

/** 테스트용 AES 키 (32바이트를 seed로 채움) — 운영 키 아님 */
export const testKey = (seed: number) => bytesToBase64Url(new Uint8Array(32).fill(seed));

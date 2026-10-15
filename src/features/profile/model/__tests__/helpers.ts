// 테스트 도우미 — 메모리 저장소와 예시 답
import type { KeyValueStorage } from "@/features/device/identity-store";
import { ALL_DISTRICT_IDS } from "../districts";
import type { WizardAnswers } from "../types";

export function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

/** business-logic-model §6 어머니 기기 예시 */
export const MOTHER_ANSWERS: WizardAnswers = {
  selfBirth: "1963-07-01",
  householdType: "couple",
  spouseBirth: "1960-03-02",
  head: "spouse",
  sido: "경기",
  sigungu: "하남시",
  residenceYearsBand: "5to10",
  homeOwned: false,
  homelessYearsBand: "10to15",
  savingsHas: true,
  savingsKind: "comprehensive",
  savingsMonthsBand: "ge120",
  paymentCount: 120,
  depositManwon: 1200,
  monthlyIncome: 450,
  spouseEarns: true,
  totalAsset: 20000,
  carValue: 1500,
  welfare: "none",
  districtIds: [...ALL_DISTRICT_IDS],
  areaBands: ["s"],
  tenure: "rent",
  lowFloor: false,
};

/** 필수만 채운 답 */
export const MINIMAL_ANSWERS: WizardAnswers = {
  selfBirth: "1960-01-01",
  householdType: "single",
  sido: "부산",
  districtIds: ["gyosan"],
};

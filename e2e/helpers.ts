// E2E 공용 — 저장된 프로필을 미리 넣어 두기 (서버에는 보내지 않은 상태: synced로 표시)
import type { Page } from "@playwright/test";

export const SAMPLE_PROFILE = {
  schemaVersion: 1,
  self: { birthDate: "1960-03-02" },
  spouse: { birthDate: "1963-07-01" },
  householdType: "couple",
  householdSize: 2,
  householdHead: "self",
  residence: { sido: "경기", sigungu: "하남시", years: 5 },
  housing: { homeless: true, homelessYears: 10, ownedCount: 0 },
  savings: { has: false, kind: null, months: null, paymentCount: null, depositManwon: null },
  money: { monthlyIncome: 450, totalAsset: 20000, carValue: 1500, spouseEarns: true },
  welfare: "none",
  prefs: { districtIds: ["wangsuk", "gyosan", "changneung", "daejang", "gyeyang", "gwangmyeong_siheung"], areaBands: ["s"], tenure: "rent", lowFloor: false },
};

/** 다음 페이지 열기부터 기기에 프로필이 저장된 상태로 만든다 */
export async function seedStoredProfile(page: Page) {
  await page.addInitScript((profile) => {
    if (window.localStorage.getItem("mz.profile") === null) {
      window.localStorage.setItem(
        "mz.profile",
        JSON.stringify({ version: 1, profile, savedAt: "2026-10-15T00:00:00.000Z", sync: { state: "synced", at: "2026-10-15T00:00:00.000Z" } }),
      );
    }
  }, SAMPLE_PROFILE);
}

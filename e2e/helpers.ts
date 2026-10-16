// E2E 공용 — 저장된 프로필을 미리 넣어 두기 (서버에는 보내지 않은 상태: synced로 표시)
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

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

// ---------- 기기 등록 한도 (U1 register_device: 최근 1시간 신규 20대) ----------
// E2E는 테스트마다 새 기기를 등록해서 한도를 넘는다. 한도 자체는 보안 장치라 그대로 두고,
// **로컬 Supabase일 때만** 테스트 기기의 created_at을 2시간 전으로 옮겨 한도 계산에서 뺀다.
// (기기를 지우지 않으므로 다른 테스트가 쓰는 기기에 영향이 없다)
function localEnv(): { url: string; key: string } | null {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    try {
      for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
        const m = /^\s*(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*?)\s*$/.exec(line);
        if (m?.[1] === "SUPABASE_URL") url ??= m[2];
        if (m?.[1] === "SUPABASE_SERVICE_ROLE_KEY") key ??= m[2];
      }
    } catch {
      return null;
    }
  }
  if (!url || !key) return null;
  const host = new URL(url).hostname;
  return host === "127.0.0.1" || host === "localhost" ? { url, key } : null; // 운영 DB는 절대 건드리지 않는다
}

export async function releaseRegistrationLimit(): Promise<void> {
  const env = localEnv();
  if (!env) return;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`${env.url}/rest/v1/devices?created_at=gt.${encodeURIComponent(hourAgo)}`, {
    method: "PATCH",
    headers: { apikey: env.key, authorization: `Bearer ${env.key}`, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ created_at: twoHoursAgo }),
  });
  if (!res.ok) throw new Error(`기기 등록 한도 풀기 실패: ${res.status}`);
}

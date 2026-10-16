// 피드 첫 화면 표시 시간 측정 (NFR-4.1: 4G에서 3초 이내, performance-test-instructions.md)
// Chromium 네트워크·CPU 느리게 하기: 느린 4G(내려받기 1.6Mbps, 올리기 750kbps, 왕복 150ms) + CPU 4배 느리게
// 측정: 페이지 열기 → "맞춤 공고" 제목이 보일 때까지. ① 저장본 없음 ② 저장본 있음(두 번째부터)
//
//   APP_URL=http://localhost:3123 node scripts/measure-feed-4g.mjs [반복 수]
// 로컬 서버이므로 서버 처리 시간은 실제(Vercel·Supabase)보다 짧을 수 있다 — 결과에 함께 적는다.
import { chromium, devices } from "@playwright/test";

const APP = process.env.APP_URL ?? "http://localhost:3123";
const runs = Number(process.argv[2] ?? "5");
const PROFILE = {
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
  prefs: { districtIds: ["wangsuk", "gyosan", "changneung", "daejang", "gyeyang", "gwangmyeong_siheung"], areaBands: [], tenure: "both", lowFloor: false },
};

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Galaxy S9+"], locale: "ko-KR", timezoneId: "Asia/Seoul" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

// 준비: 기기 등록·프로필 저장(느리게 하기 전에)
await page.addInitScript((profile) => {
  if (!localStorage.getItem("mz.profile")) {
    localStorage.setItem("mz.profile", JSON.stringify({ version: 1, profile, savedAt: new Date().toISOString(), sync: { state: "pending", since: new Date().toISOString(), attempts: 0 } }));
  }
  localStorage.setItem("mz.installHint", JSON.stringify({ version: 1, dismissedAt: new Date().toISOString() }));
}, PROFILE);
await page.goto(APP);
await page.getByRole("heading", { level: 1, name: "맞춤 공고" }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(1000);

await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

async function measure(clearCache) {
  if (clearCache) {
    await page.evaluate(() => localStorage.removeItem("mz.feed"));
    await cdp.send("Network.clearBrowserCache");
  }
  const t0 = Date.now();
  await page.goto(APP, { waitUntil: "commit" });
  await page.getByRole("heading", { level: 1, name: "맞춤 공고" }).waitFor({ timeout: 60_000 });
  const heading = Date.now() - t0;
  // 서버에서 받은 목록으로 바뀔 때까지 ("새 공고를 확인하고 있어요"가 사라짐)
  await page.getByText("새 공고를 확인하고 있어요").waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);
  return { heading, fresh: Date.now() - t0 };
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], max: s[s.length - 1] };
};

const cold = [];
const warm = [];
for (let i = 0; i < runs; i++) cold.push(await measure(true));
for (let i = 0; i < runs; i++) warm.push(await measure(false));

console.log(JSON.stringify({
  condition: "느린 4G(1.6Mbps/750kbps/150ms) + CPU 4배, Galaxy S9+ Chromium, 로컬 서버",
  runs,
  noCache: { firstPaintMs: stats(cold.map((r) => r.heading)), freshListMs: stats(cold.map((r) => r.fresh)) },
  withCache: { firstPaintMs: stats(warm.map((r) => r.heading)), freshListMs: stats(warm.map((r) => r.fresh)) },
}, null, 2));
await browser.close();

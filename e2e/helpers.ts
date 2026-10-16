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

// ---------- U5 피드 공고 (로컬 Supabase 전용) ----------
// 공고·주택형·지구·출처를 직접 넣고, 판정은 화면에서 프로필을 저장해 **실제 U2 재계산**으로 만든다.
// 운영 DB 주소면 아무것도 넣지 않는다(hasLocalDb() = false → 테스트를 건너뜀).

export function hasLocalDb(): boolean {
  return localEnv() !== null;
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<unknown> {
  const env = localEnv();
  if (!env) throw new Error("로컬 Supabase가 아니면 공고를 넣지 않는다");
  const res = await fetch(`${env.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.key,
      authorization: `Bearer ${env.key}`,
      "content-type": "application/json",
      prefer: init.prefer ?? "return=minimal",
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} 실패: ${res.status} ${await res.text()}`);
  return res.status === 204 || init.prefer !== "return=representation" ? null : res.json();
}

/** 한국 날짜 + n일 */
export function kstDate(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export interface SeededNotice {
  id: string;
  name: string;
  url: string;
}

export interface FeedFixture {
  open: SeededNotice; // 충족, 접수 중, 마감 D-2, 요약 있음
  upcoming: SeededNotice; // 확인 필요(소득 기준 모름), 접수 예정 D-5, 요약 준비 중
  ineligible: SeededNotice; // 미충족(사는 곳), 접수 중 → 피드에 없음
  closed: SeededNotice; // 충족이지만 마감 → 피드에 없음
}

const OK_REQ = {
  age: { minAge: 65, who: "member" },
  homeless: { minYears: null },
  income: { basis: "urban_worker", percent: 100, amountsWon: { "2": 5866270 } },
};

/** tag: 프로젝트마다 다르게 (android·iphone이 동시에 돌아도 이름이 겹치지 않게) */
export async function seedFeedNotices(tag: string): Promise<FeedFixture> {
  await cleanupFeedNotices(tag);
  const spec = [
    { key: "open", name: `E2E 교산 A2 어르신 임대 ${tag}`, start: -2, end: 2, req: OK_REQ, summary: true },
    { key: "upcoming", name: `E2E 교산 B1 신혼 ${tag}`, start: 5, end: 7, req: { income: "unknown" }, summary: false },
    { key: "ineligible", name: `E2E 교산 C3 부산 ${tag}`, start: -1, end: 3, req: { residence: { sidoIn: ["부산"] } }, summary: false },
    { key: "closed", name: `E2E 교산 D4 마감 ${tag}`, start: -10, end: -5, req: OK_REQ, summary: false },
  ] as const;

  const notices = (await rest("notices", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify(
      spec.map((s) => ({
        dedup_key: `e2e:${tag}:${s.key}`,
        title: `${s.name} 입주자 모집공고`,
        complex_name: s.name,
        location: "경기도 하남시 교산동",
        sido: "경기",
        sigungu: "하남시",
        provider: "LH",
        primary_source: "lh_rental",
        tenure: "rent",
        announced_at: kstDate(s.start - 7),
        apply_start: kstDate(s.start),
        apply_end: kstDate(s.end),
        result_at: kstDate(s.end + 14),
        summary: s.summary ? { eligibilityPlain: "만 65세 이상 무주택 세대가 신청할 수 있어요.", forSeniorCouple: "부부 두 분 중 한 분만 만 65세 이상이어도 돼요." } : null,
        summary_status: s.summary ? "done" : "pending",
      })),
    ),
  })) as { id: string; dedup_key: string }[];
  const idOf = (key: string) => notices.find((n) => n.dedup_key === `e2e:${tag}:${key}`)!.id;

  await rest("notice_districts", { method: "POST", body: JSON.stringify(spec.map((s) => ({ notice_id: idOf(s.key), district_id: "gyosan" }))) });
  await rest("housing_units", {
    method: "POST",
    body: JSON.stringify(
      spec.flatMap((s) => [
        { notice_id: idOf(s.key), label: "46A", supply_type: "national_rental_senior", exclusive_area_m2: 46, supply_count: 120, requirements: s.req },
        { notice_id: idOf(s.key), label: "59A", supply_type: "national_rental_senior", exclusive_area_m2: 59, supply_count: null, requirements: s.req },
      ]),
    ),
  });
  await rest("source_notices", {
    method: "POST",
    body: JSON.stringify(
      spec.map((s) => ({
        source: "lh_rental",
        source_notice_no: `e2e-${tag}-${s.key}`,
        notice_id: idOf(s.key),
        original_url: `https://apply.lh.or.kr/e2e/${tag}/${s.key}`,
        content_hash: "e2e",
      })),
    ),
  });

  const pick = (key: (typeof spec)[number]["key"]): SeededNotice => {
    const s = spec.find((x) => x.key === key)!;
    return { id: idOf(key), name: s.name, url: `https://apply.lh.or.kr/e2e/${tag}/${key}` };
  };
  return { open: pick("open"), upcoming: pick("upcoming"), ineligible: pick("ineligible"), closed: pick("closed") };
}

/** 넣은 공고 지우기 (주택형·지구·출처·판정은 함께 지워진다) */
export async function cleanupFeedNotices(tag: string): Promise<void> {
  if (!hasLocalDb()) return;
  await rest(`notices?dedup_key=like.${encodeURIComponent(`e2e:${tag}:*`)}`, { method: "DELETE" });
}

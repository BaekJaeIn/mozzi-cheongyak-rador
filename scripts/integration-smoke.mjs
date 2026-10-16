// Unit 간 통합 시험 (Build and Test, integration-test-instructions.md) — 로컬 Supabase 전용
// U3 수집(목업) → U3 분석(목업) → U1 기기 등록 → U4 프로필 저장(U2 재계산) → U5 피드·상세 → U6 구독 → U6 발송
//
// 전제: supabase start, supabase functions serve --env-file <COLLECT_MOCK=1 포함> --no-verify-jwt,
//       next start(로컬 Supabase 값으로), 환경 변수 APP_URL·SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY·CRON_SECRET
// 운영 주소면 아무것도 하지 않고 끝낸다.
import { randomBytes, randomUUID } from "node:crypto";

const APP = process.env.APP_URL ?? "http://localhost:3123";
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON = process.env.CRON_SECRET;
if (!SB || !KEY || !CRON) throw new Error("SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY·CRON_SECRET가 필요해요");
for (const url of [APP, SB]) {
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") throw new Error(`로컬 주소에서만 실행해요: ${host}`);
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const rest = (path, init = {}) =>
  fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", prefer: init.prefer ?? "return=representation", ...init.headers },
  });
const fn = (name, body = {}) =>
  fetch(`${SB}/functions/v1/${name}`, { method: "POST", headers: { authorization: `Bearer ${CRON}`, "content-type": "application/json" }, body: JSON.stringify(body) });

const kstHour = (new Date().getUTCHours() + 9) % 24;
const device = { deviceId: randomUUID(), token: randomBytes(32).toString("base64url") };
const auth = { "x-device-id": device.deviceId, "x-device-token": device.token };
const endpoint = `https://fcm.googleapis.com/fcm/send/integration-${randomUUID()}`;

const PROFILE = {
  schemaVersion: 1,
  self: { birthDate: "1960-03-02" },
  spouse: { birthDate: "1963-07-01" },
  householdType: "couple",
  householdSize: 2,
  householdHead: "self",
  residence: { sido: "경기", sigungu: "하남시", years: 5 },
  housing: { homeless: true, homelessYears: 10, ownedCount: 0 },
  savings: { has: true, kind: "comprehensive", months: 120, paymentCount: 120, depositManwon: 600 },
  money: { monthlyIncome: 450, totalAsset: 20000, carValue: 1500, spouseEarns: true },
  welfare: "none",
  prefs: { districtIds: ["wangsuk", "gyosan", "changneung", "daejang", "gyeyang", "gwangmyeong_siheung"], areaBands: [], tenure: "both", lowFloor: false },
};

try {
  // U3
  const collect = await (await fn("collect")).json();
  check("U3 collect(목업) 실행", Array.isArray(collect.sources ?? collect.results ?? []) || typeof collect === "object", JSON.stringify(collect).slice(0, 160));
  const analyze = await (await fn("analyze")).json();
  check("U3 analyze(목업) 실행", typeof analyze === "object" && !analyze.error, JSON.stringify(analyze).slice(0, 160));
  const notices = await (await rest("source_notices?select=notice_id&source_notice_no=like.MOCK-*")).json();
  check("U3 목업 공고 저장", notices.length > 0, `${notices.length}건`);

  // U1
  const reg = await fetch(`${APP}/api/device`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(device) });
  check("U1 기기 등록", reg.status === 201, String(reg.status));

  // U4 → U2
  const save = await fetch(`${APP}/api/profile`, { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(PROFILE) });
  check("U4 프로필 저장 + U2 재계산", save.status === 200, String(save.status));
  const judged = await (await rest(`judgements?select=notice_id,verdict&device_id=eq.${device.deviceId}`)).json();
  check("U2 판정 저장", judged.length > 0, judged.map((j) => j.verdict).join(","));

  // U5
  const feed = await (await fetch(`${APP}/api/feed`, { headers: auth })).json();
  check("U5 피드 ready + 맞는 공고", feed.state === "ready" && feed.items.length > 0, `${feed.items?.length}건: ${feed.items?.map((i) => i.complexName ?? i.title).join(" / ")}`);
  const visibleIds = new Set(feed.items.map((i) => i.id));
  const hidden = judged.filter((j) => j.verdict === "ineligible" && visibleIds.has(j.notice_id));
  check("U5 미충족은 피드에 없음", hidden.length === 0);
  if (feed.items[0]) {
    const detail = await (await fetch(`${APP}/api/notices/${feed.items[0].id}`, { headers: auth })).json();
    check("U5 상세 + 판정 이유", detail.notice?.id === feed.items[0].id && detail.judgement?.units?.length > 0, `${detail.judgement?.units?.length}개 주택형`);
  }

  // U6
  const sub = await fetch(`${APP}/api/push/subscribe`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ endpoint, expirationTime: null, keys: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" } }),
  });
  check("U6 구독 저장", sub.status === 200, String(sub.status));
  const baseline = await (await rest(`notification_log?select=notice_id,kind&device_id=eq.${device.deviceId}`)).json();
  check("U6 첫 구독 기준선 = 지금 피드 공고", baseline.length === feed.items.length && baseline.every((b) => b.kind === "baseline" && visibleIds.has(b.notice_id)), `${baseline.length}건`);

  // 기준선을 지워 "새로 맞는 공고"가 있는 상태로 만들고 지금 시각을 알림 시각으로
  await rest(`notification_log?device_id=eq.${device.deviceId}`, { method: "DELETE", prefer: "return=minimal" });
  await rest(`devices?id=eq.${device.deviceId}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ notify_hour: kstHour }) });
  const run = await (await fn("dispatch")).json();
  check("U6 dispatch 실행", typeof run.devices === "number" && run.devices >= 1, JSON.stringify(run));
  const left = await (await rest(`push_subscriptions?select=endpoint&device_id=eq.${device.deviceId}`)).json();
  const dev = (await (await rest(`devices?select=last_push_on&id=eq.${device.deviceId}`)).json())[0];
  check("U6 FCM 전송 → 가짜 구독 만료 → 구독 삭제·몫 되돌림", left.length === 0 && dev.last_push_on === null);
} finally {
  // 정리: 이 기기(구독·판정·기록 함께), 목업 공고
  await rest(`devices?id=eq.${device.deviceId}`, { method: "DELETE", prefer: "return=minimal" });
  const mock = await (await rest("source_notices?select=notice_id&source_notice_no=like.MOCK-*")).json();
  for (const { notice_id } of mock) await rest(`notices?id=eq.${notice_id}`, { method: "DELETE", prefer: "return=minimal" });
  console.log(`정리: 기기 1대, 목업 공고 ${mock.length}건 삭제`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed === 0 ? 0 : 1);

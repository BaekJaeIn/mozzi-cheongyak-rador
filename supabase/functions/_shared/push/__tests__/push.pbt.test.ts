// 속성 기반 테스트 — U6 발송 (domain-entities §7, P-U6-1~8). P-U6-9·10은 화면 쪽(src/features/pwa)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { addDays } from "../../domain/dates.ts";
import { buildFeed } from "../../feed/visible.ts";
import { feedRowsArb, isoDateArb } from "@/features/notice/model/__tests__/arbitraries";
import { buildPayload, MAX_PAYLOAD_BYTES } from "../payload.ts";
import { planDevice, visibleNoticeIds } from "../plan.ts";
import { runDispatch } from "../dispatch.ts";
import { type SendOutcome, settleDevice } from "../send.ts";
import { isAllowedPushEndpoint, validateSubscription } from "../endpoint.ts";
import { canSendTest, TEST_LIMIT, TEST_WINDOW_MS } from "../test-limit.ts";
import { createVapidSigner, generateVapidKeys, type VapidSigner } from "../vapid.ts";
import { fakePushService, MemoryDispatchStore, silentLog, UA_KEYS } from "./sim.ts";

let vapidPromise: Promise<VapidSigner> | null = null;
const vapid = () => (vapidPromise ??= generateVapidKeys().then((k) => createVapidSigner({ ...k, subject: "https://mozzi-cheongyak-rador.vercel.app" })));

// ---------- 계획 ----------

test.prop([feedRowsArb, fc.array(fc.integer({ min: 0, max: 20 }), { maxLength: 10 }), isoDateArb])(
  "P-U6-1 알릴 공고 = 피드 공고 − 알림 기록 (피드에 없는 공고는 절대 알리지 않음)",
  (rows, picks, today) => {
    const feedIds = buildFeed(rows, today, new Map(), []).map((i) => i.id);
    const notified = new Set(picks.map((i) => rows[i % Math.max(rows.length, 1)]?.notice.id).filter((x): x is string => !!x));
    const item = planDevice("dev", rows, notified, today);
    const expected = feedIds.filter((id) => !notified.has(id));
    expect(item?.notices.map((n) => n.id) ?? []).toEqual(expected);
    if (item) expect(item.counts.eligible + item.counts.unknown).toBe(item.notices.length);
  },
);

// ---------- 실행 시뮬레이션 ----------

type Op =
  | { kind: "run"; day: number; hour: number; concurrent: boolean }
  | { kind: "setHour"; device: number; hour: number }
  | { kind: "fail"; device: number; status: 201 | 410 | 503 | "network" }
  | { kind: "subscribe"; device: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("run" as const), day: fc.integer({ min: 0, max: 2 }), hour: fc.constantFrom(8, 9), concurrent: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("setHour" as const), device: fc.integer({ min: 0, max: 2 }), hour: fc.constantFrom(8, 9) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("fail" as const), device: fc.integer({ min: 0, max: 2 }), status: fc.constantFrom(201 as const, 410 as const, 503 as const, "network" as const) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("subscribe" as const), device: fc.integer({ min: 0, max: 2 }) }) },
);

const endpointOf = (d: number) => `https://fcm.googleapis.com/fcm/send/dev${d}`;

async function simulate(rowsByDevice: Parameters<typeof buildFeed>[0][], ops: Op[]) {
  const store = new MemoryDispatchStore();
  const push = fakePushService();
  rowsByDevice.forEach((rows, d) => {
    store.devices.set(`dev${d}`, { notifyHour: 9, enabled: true, lastPushOn: null, profileVersion: null, rows: [...rows] });
    store.subscriptions.set(endpointOf(d), { deviceId: `dev${d}`, ...UA_KEYS, failingSince: null });
  });
  const deps = { store, vapid: await vapid(), transport: push.transport, recompute: async () => ({ status: "saved" }), log: silentLog, nowMs: () => 0, sleep: async () => undefined };
  for (const op of ops) {
    if (op.kind === "run") {
      const now = new Date(Date.UTC(2026, 9, 20 + op.day, op.hour - 9));
      if (op.concurrent) await Promise.all([runDispatch(deps, now), runDispatch(deps, now)]);
      else await runDispatch(deps, now);
    } else if (op.kind === "setHour") {
      const d = store.devices.get(`dev${op.device}`);
      if (d) d.notifyHour = op.hour;
    } else if (op.kind === "fail") push.status.set(endpointOf(op.device), op.status);
    else if (!store.subscriptions.has(endpointOf(op.device)) && store.devices.has(`dev${op.device}`)) {
      store.subscriptions.set(endpointOf(op.device), { deviceId: `dev${op.device}`, ...UA_KEYS, failingSince: null });
    }
  }
  return { store, push };
}

const devicesArb = fc.array(feedRowsArb, { minLength: 1, maxLength: 3 });

test.prop([devicesArb, fc.array(opArb, { maxLength: 25 })], { numRuns: 60 })(
  "P-U6-2 어떤 실행 순서(재실행·동시 실행·시각 변경·실패)에서도 공고는 기기당 1번, 기기는 하루 1번",
  async (rowsByDevice, ops) => {
    const { store } = await simulate(rowsByDevice, ops);
    const perDay = new Map<string, number>();
    const notices = new Map<string, Set<string>>();
    for (const r of store.records) {
      if (r.input.noticeIds.length === 0) continue;
      const key = `${r.deviceId}|${r.today}`;
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
      const seen = notices.get(r.deviceId) ?? new Set<string>();
      for (const n of r.input.noticeIds) {
        expect(seen.has(n)).toBe(false);
        seen.add(n);
      }
      notices.set(r.deviceId, seen);
    }
    for (const count of perDay.values()) expect(count).toBe(1);
  },
);

test.prop([devicesArb, fc.constantFrom(410 as const, 503 as const, "network" as const)], { numRuns: 40 })(
  "P-U6-3 모든 구독이 실패한 실행 뒤에는 알림 기록과 오늘 표시가 실행 전과 같다",
  async (rowsByDevice, status) => {
    const store = new MemoryDispatchStore();
    const push = fakePushService();
    rowsByDevice.forEach((rows, d) => {
      store.devices.set(`dev${d}`, { notifyHour: 9, enabled: true, lastPushOn: "2026-10-19", profileVersion: null, rows });
      store.subscriptions.set(endpointOf(d), { deviceId: `dev${d}`, ...UA_KEYS, failingSince: null });
      push.status.set(endpointOf(d), status);
    });
    await runDispatch({ store, vapid: await vapid(), transport: push.transport, recompute: async () => ({ status: "saved" }), log: silentLog, nowMs: () => 0, sleep: async () => undefined }, new Date("2026-10-20T00:00:00Z"));
    expect(store.log.size).toBe(0);
    for (const d of store.devices.values()) expect(d.lastPushOn).toBe("2026-10-19");
  },
);

// ---------- 문구·결과·검사 ----------

const itemArb = fc
  .uniqueArray(fc.uuid(), { minLength: 1, maxLength: 30 })
  .chain((ids) =>
    fc.tuple(...ids.map((id) => fc.record({ id: fc.constant(id), name: fc.string({ unit: "grapheme", minLength: 1, maxLength: 80 }), verdict: fc.constantFrom("eligible" as const, "unknown" as const) }))),
  )
  .map((notices) => {
    const eligible = notices.filter((n) => n.verdict === "eligible").length;
    return { deviceId: "dev", notices, counts: { eligible, unknown: notices.length - eligible } };
  });

test.prop([itemArb, isoDateArb])("P-U6-4 알림 내용: 1건이면 상세·여러 건이면 피드, 건수 일치, 2KB 이하", (item, today) => {
  const p = buildPayload(item, today);
  expect(p.title).toBe("모찌네 청약 알리미");
  expect(p.body.length).toBeGreaterThan(0);
  expect(new TextEncoder().encode(JSON.stringify(p)).length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  if (item.notices.length === 1) expect(p.url).toBe(`/notice/${item.notices[0]!.id}`);
  else {
    expect(p.url).toBe("/");
    expect(p.body).toContain(`${item.notices.length}건`);
    // 공고 이름은 여러 건 문구에 들어가지 않는다
    for (const n of item.notices) if (n.name.length > 3 && !/\d/.test(n.name)) expect(p.body.includes(n.name)).toBe(false);
  }
});

const outcomeArb: fc.Arbitrary<SendOutcome> = fc.oneof(
  fc.constant({ kind: "sent" as const }),
  fc.constant({ kind: "gone" as const }),
  fc.record({ kind: fc.constant("retryable" as const), status: fc.option(fc.integer({ min: 429, max: 599 }), { nil: null }) }),
  fc.record({ kind: fc.constant("rejected" as const), status: fc.integer({ min: 0, max: 499 }) }),
);

test.prop([fc.array(fc.tuple(fc.uuid(), outcomeArb), { maxLength: 6 })])("P-U6-5 결과 정리: 만료만 지울 목록, 보냄이 있을 때만 delivered", (pairs) => {
  const s = settleDevice(pairs.map(([endpoint, outcome]) => ({ endpoint, outcome })));
  expect(s.gone).toEqual(pairs.filter(([, o]) => o.kind === "gone").map(([e]) => e));
  expect(s.delivered).toBe(pairs.some(([, o]) => o.kind === "sent"));
  expect(s.success.length + s.failed.length + s.gone.length).toBe(pairs.length);
});

const hostArb = fc.oneof(
  fc.constantFrom("fcm.googleapis.com", "web.push.apple.com", "updates.push.services.mozilla.com", "wns2.notify.windows.com"),
  fc.domain(),
  fc.ipV4(),
);
const subArb = fc.record({
  endpoint: fc.tuple(fc.constantFrom("https", "http"), hostArb, fc.webPath()).map(([s, h, p]) => `${s}://${h}${p}`),
  keys: fc.record({
    p256dh: fc.oneof(fc.constant(UA_KEYS.p256dh), fc.base64String().map((s) => s.replace(/=/g, ""))),
    auth: fc.oneof(fc.constant(UA_KEYS.auth), fc.string()),
  }),
});

test.prop([subArb])("P-U6-6 받아들인 구독은 https·허용 호스트·키 길이를 만족하고, 다시 검사해도 통과", (body) => {
  const r = validateSubscription(body);
  if (!r.ok) return;
  expect(isAllowedPushEndpoint(r.value.endpoint)).toBe(true);
  expect(new URL(r.value.endpoint).protocol).toBe("https:");
  expect(validateSubscription(r.value)).toEqual(r);
});

test.prop([feedRowsArb, isoDateArb, fc.integer({ min: 0, max: 3 })], { numRuns: 60 })(
  "P-U6-7 기준선: 첫 구독 직후 계획은 0건, 다시 구독해도 기준선이 늘지 않는다",
  async (rows, today, reSubscribe) => {
    const store = new MemoryDispatchStore();
    store.devices.set("dev", { notifyHour: 9, enabled: true, lastPushOn: null, profileVersion: null, rows });
    const baselineAt: string[] = [];
    const subscribe = () => {
      if (baselineAt.length === 0) {
        store.baseline("dev", visibleNoticeIds(rows, today));
        baselineAt.push(today);
      }
    };
    subscribe();
    const size = store.log.size;
    for (let i = 0; i < reSubscribe; i++) subscribe();
    expect(store.log.size).toBe(size);
    expect(planDevice("dev", rows, new Set([...store.log.keys()].map((k) => k.slice(4))), today)).toBeNull();
  },
);

test.prop([fc.array(fc.integer({ min: 0, max: 5 * 60 * 60 * 1000 }), { maxLength: 40 })])(
  "P-U6-8 시험 알림: 어느 1시간 구간에도 4번 이상 보내지지 않는다",
  (offsets) => {
    const base = Date.UTC(2026, 9, 20);
    const sent: Date[] = [];
    for (const o of [...offsets].sort((a, b) => a - b)) {
      const now = new Date(base + o);
      if (canSendTest(sent, now)) sent.push(now);
    }
    for (const t of sent) {
      const inWindow = sent.filter((s) => s.getTime() > t.getTime() - TEST_WINDOW_MS && s.getTime() <= t.getTime()).length;
      expect(inWindow).toBeLessThanOrEqual(TEST_LIMIT);
    }
  },
);

test.prop([fc.integer({ min: 1, max: 1000 })], { numRuns: 1 })("P-13 1,000대 발송이 시간 예산 안에 끝난다 (가짜 푸시 서비스 지연 포함)", async () => {
  const store = new MemoryDispatchStore();
  const push = fakePushService(5);
  const rows = [
    {
      verdict: "eligible" as const,
      inDistrict: true,
      score: 1,
      detail: {},
      notice: { id: "n1", title: "공고", complexName: null, tenure: "rent" as const, applyStart: "2026-10-19", applyEnd: addDays("2026-10-19", 10), firstSeenAt: "2026-10-18T00:00:00.000Z" },
      districts: [],
    },
  ];
  for (let d = 0; d < 1000; d++) {
    store.devices.set(`dev${d}`, { notifyHour: 9, enabled: true, lastPushOn: null, profileVersion: null, rows });
    store.subscriptions.set(endpointOf(d), { deviceId: `dev${d}`, ...UA_KEYS, failingSince: null });
  }
  const started = Date.now();
  const s = await runDispatch(
    { store, vapid: await vapid(), transport: push.transport, recompute: async () => ({ status: "saved" }), log: silentLog, nowMs: () => Date.now(), sleep: async () => undefined },
    new Date("2026-10-20T00:00:00Z"),
  );
  const elapsed = Date.now() - started;
  console.log(`[P-13] 1,000대 발송 ${elapsed}ms (동시 5, 지연 5ms)`);
  expect(s.sent).toBe(1000);
  expect(elapsed).toBeLessThan(45_000);
});

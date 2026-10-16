// 발송 계획·문구·보내기·실행기 예시 테스트 (BR-U6-01~45, business-logic-model §1.1)
import { describe, expect, it } from "vitest";
import { buildPayload, countsText, encodePayload, shortName, testPayload } from "../payload.ts";
import { planDevice, visibleNoticeIds } from "../plan.ts";
import { classifyStatus, sendPush, settleDevice } from "../send.ts";
import { kstHour, partOf, runDispatch } from "../dispatch.ts";
import { createVapidSigner, generateVapidKeys } from "../vapid.ts";
import { fakePushService, feedRow, MemoryDispatchStore, silentLog, UA_KEYS } from "./sim.ts";

const TODAY = "2026-10-20";
const NOW_9 = new Date("2026-10-20T00:00:00Z"); // KST 09:00
const ROWS = [
  feedRow("a", "eligible", "2026-10-19", "2026-10-23", "하남교산 A2"),
  feedRow("b", "eligible", "2026-10-25", "2026-10-28"),
  feedRow("c", "unknown", "2026-10-27", "2026-10-29"),
  feedRow("d", "ineligible", "2026-10-19", "2026-10-23"),
  feedRow("e", "eligible", "2026-10-10", "2026-10-15"), // 마감
];

describe("planDevice (BR-U6-03·05)", () => {
  it("피드에 보이는 공고 − 알림 기록, 피드 순서", () => {
    const item = planDevice("dev", ROWS, new Set(["b"]), TODAY)!;
    expect(item.notices.map((n) => n.id)).toEqual(["a", "c"]);
    expect(item.counts).toEqual({ eligible: 1, unknown: 1 });
    expect(item.notices[0]!.name).toBe("하남교산 A2");
    expect(item.notices[1]!.name).toBe("c 공고");
  });

  it("모두 알렸거나 보이는 공고가 없으면 null", () => {
    expect(planDevice("dev", ROWS, new Set(["a", "b", "c"]), TODAY)).toBeNull();
    expect(planDevice("dev", [], new Set(), TODAY)).toBeNull();
    expect(visibleNoticeIds(ROWS, TODAY)).toEqual(["a", "b", "c"]);
  });
});

describe("알림 문구 (BR-U6-30~36)", () => {
  it("2건 이상: 건수와 괄호, 피드로", () => {
    const p = buildPayload(planDevice("dev", ROWS, new Set(), TODAY)!, TODAY);
    expect(p).toEqual({ title: "모찌네 청약 알리미", body: "새로 맞는 공고 3건이 있어요 (자격 충족 2 · 확인 필요 1)", url: "/", tag: "daily-2026-10-20" });
  });

  it("1건: 이름·판정, 상세로", () => {
    const p = buildPayload(planDevice("dev", ROWS, new Set(["b", "c"]), TODAY)!, TODAY);
    expect(p.body).toBe("하남교산 A2 · 자격 충족 — 눌러서 확인해 보세요");
    expect(p.url).toBe("/notice/a");
  });

  it("괄호는 있는 쪽만, 24글자 넘으면 자름", () => {
    expect(countsText({ eligible: 3, unknown: 0 })).toBe("자격 충족 3");
    expect(countsText({ eligible: 0, unknown: 2 })).toBe("확인 필요 2");
    expect(shortName("가".repeat(24))).toBe("가".repeat(24));
    expect(shortName("가".repeat(25))).toBe(`${"가".repeat(23)}…`);
  });

  it("시험 알림은 설정으로, 2KB 넘으면 거부", () => {
    expect(testPayload()).toMatchObject({ url: "/settings", tag: "test" });
    expect(() => encodePayload({ ...testPayload(), body: "가".repeat(1000) })).toThrow("2KB");
  });
});

describe("보내기 (BR-U6-40~43)", () => {
  it.each([
    [201, "sent"],
    [404, "gone"],
    [410, "gone"],
    [429, "retryable"],
    [503, "retryable"],
    [400, "rejected"],
    [403, "rejected"],
    [413, "rejected"],
  ] as const)("%i → %s", (status, kind) => {
    expect(classifyStatus(status).kind).toBe(kind);
  });

  async function setup() {
    const vapid = await createVapidSigner({ ...(await generateVapidKeys()), subject: "https://mozzi-cheongyak-rador.vercel.app" });
    return { vapid, push: fakePushService() };
  }
  const target = { endpoint: "https://fcm.googleapis.com/fcm/send/x", ...UA_KEYS };

  it("헤더: VAPID·aes128gcm·TTL·긴급도", async () => {
    const { vapid } = await setup();
    let seen: RequestInit | null = null;
    const outcome = await sendPush(target, testPayload(), {
      vapid,
      transport: async (_url, init) => {
        seen = init;
        return new Response(null, { status: 201 });
      },
      nowSeconds: 1_790_000_000,
      ttl: 600,
    });
    expect(outcome).toEqual({ kind: "sent" });
    const h = seen!.headers as Record<string, string>;
    expect(h.authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect(h["content-encoding"]).toBe("aes128gcm");
    expect(h.ttl).toBe("600");
    expect(h.urgency).toBe("normal");
  });

  it("일시 오류는 1번 더, 그래도 실패면 retryable", async () => {
    const { vapid, push } = await setup();
    push.status.set(target.endpoint, 503);
    const outcome = await sendPush(target, testPayload(), { vapid, transport: push.transport, nowSeconds: 0, ttl: 60, sleep: async () => undefined });
    expect(outcome).toEqual({ kind: "retryable", status: 503 });
    expect(push.calls).toHaveLength(2);
  });

  it("네트워크 오류 뒤 성공", async () => {
    const { vapid } = await setup();
    let n = 0;
    const outcome = await sendPush(target, testPayload(), {
      vapid,
      transport: async () => {
        n += 1;
        if (n === 1) throw new TypeError("network");
        return new Response(null, { status: 201 });
      },
      nowSeconds: 0,
      ttl: 60,
      sleep: async () => undefined,
    });
    expect(outcome).toEqual({ kind: "sent" });
  });

  it("허용 안 된 주소·깨진 키는 보내지 않는다", async () => {
    const { vapid, push } = await setup();
    const opts = { vapid, transport: push.transport, nowSeconds: 0, ttl: 60 };
    expect(await sendPush({ ...target, endpoint: "https://evil.com/x" }, testPayload(), opts)).toEqual({ kind: "rejected", status: 0 });
    expect(await sendPush({ ...target, auth: "AA" }, testPayload(), opts)).toEqual({ kind: "rejected", status: 0 });
    expect(push.calls).toHaveLength(0);
  });

  it("결과 정리: 하나라도 보냈으면 delivered, 만료는 지울 목록", () => {
    expect(
      settleDevice([
        { endpoint: "a", outcome: { kind: "gone" } },
        { endpoint: "b", outcome: { kind: "sent" } },
        { endpoint: "c", outcome: { kind: "retryable", status: null } },
      ]),
    ).toEqual({ delivered: true, success: ["b"], failed: ["c"], gone: ["a"] });
  });
});

describe("runDispatch — business-logic-model §1.1", () => {
  async function setup() {
    const store = new MemoryDispatchStore();
    const push = fakePushService();
    const vapid = await createVapidSigner({ ...(await generateVapidKeys()), subject: "https://mozzi-cheongyak-rador.vercel.app" });
    const deps = { store, vapid, transport: push.transport, recompute: async () => ({ status: "saved" }), log: silentLog, nowMs: () => 0, sleep: async () => undefined };
    const add = (id: string, hour: number, lastPushOn: string | null, rows = ROWS) => {
      store.devices.set(id, { notifyHour: hour, enabled: true, lastPushOn, profileVersion: 1, rows });
      store.subscriptions.set(`https://fcm.googleapis.com/fcm/send/${id}`, { deviceId: id, ...UA_KEYS, failingSince: null });
    };
    return { store, push, deps, add };
  }

  it("9시: 어머니·아버지에게 보내고, 이미 보낸 기기·10시 기기는 건너뜀", async () => {
    const t = await setup();
    t.add("mother", 9, null);
    t.add("father", 9, null, [ROWS[2]!]);
    t.add("tester", 9, TODAY);
    t.add("other", 10, null);
    const s = await runDispatch(t.deps, NOW_9);
    expect(s).toMatchObject({ hour: 9, today: TODAY, devices: 2, sent: 2, failed: 0 });
    expect(t.push.calls.map((c) => c.endpoint).sort()).toEqual([
      "https://fcm.googleapis.com/fcm/send/father",
      "https://fcm.googleapis.com/fcm/send/mother",
    ]);
    expect([...t.store.log.keys()].sort()).toEqual(["father|c", "mother|a", "mother|b", "mother|c"]);

    // 같은 시각에 한 번 더 → 아무도 받지 않음 (멱등)
    const again = await runDispatch(t.deps, NOW_9);
    expect(again.devices).toBe(0);
    expect(t.push.calls).toHaveLength(2);
  });

  it("알릴 공고가 없으면 몫을 잡지 않는다", async () => {
    const t = await setup();
    t.add("mother", 9, null, [ROWS[3]!, ROWS[4]!]);
    const s = await runDispatch(t.deps, NOW_9);
    expect(s).toMatchObject({ skippedEmpty: 1, sent: 0 });
    expect(t.store.devices.get("mother")!.lastPushOn).toBeNull();
  });

  it("모두 실패하면 몫을 되돌리고 기록하지 않는다, 만료 구독은 지운다", async () => {
    const t = await setup();
    t.add("mother", 9, "2026-10-19");
    t.push.status.set("https://fcm.googleapis.com/fcm/send/mother", 410);
    const s = await runDispatch(t.deps, NOW_9);
    expect(s).toMatchObject({ failed: 1, removedSubscriptions: 1 });
    expect(t.store.devices.get("mother")!.lastPushOn).toBe("2026-10-19");
    expect(t.store.log.size).toBe(0);
    expect(t.store.subscriptions.size).toBe(0);
  });

  it("기준선 뒤 첫 실행은 0건", async () => {
    const t = await setup();
    t.add("mother", 9, null);
    t.store.baseline("mother", visibleNoticeIds(ROWS, TODAY));
    expect((await runDispatch(t.deps, NOW_9)).skippedEmpty).toBe(1);
  });

  it("기록이 실패해도 다른 기기는 계속, 그 공고는 기록 없음(다음 날 다시)", async () => {
    const t = await setup();
    t.add("mother", 9, null);
    t.add("father", 9, null);
    t.store.failRecord = true;
    const s = await runDispatch(t.deps, NOW_9);
    expect(s.sent).toBe(2);
    expect(t.store.log.size).toBe(0);
  });

  it("오래된 판정은 다시 계산", async () => {
    const t = await setup();
    t.add("mother", 9, null);
    t.store.devices.get("mother")!.profileVersion = 2; // 판정은 버전 1로 계산됨
    t.store.deviceRows = async (ids) => new Map(ids.map((id) => [id, { rows: ROWS, notified: [], stats: { count: 5, minProfileVersion: 1 } }]));
    let recomputed = 0;
    const s = await runDispatch({ ...t.deps, recompute: async () => ((recomputed += 1), { status: "saved" }) }, NOW_9);
    expect(recomputed).toBe(1);
    expect(s.recomputed).toBe(1);
  });

  it("시간 예산을 넘으면 새 기기를 시작하지 않는다", async () => {
    const t = await setup();
    for (const id of ["a1", "a2", "a3"]) t.add(id, 9, null);
    let clock = 0;
    const s = await runDispatch({ ...t.deps, nowMs: () => (clock += 20_000), concurrency: 1 }, NOW_9);
    expect(s.timeBudgetExceeded).toBe(true);
    expect(s.skippedBudget).toBeGreaterThan(0);
    expect(s.sent + s.skippedBudget).toBe(3);
  });

  it("나눠 부르기: 모든 기기가 정확히 한 몫에 들어간다", async () => {
    const t = await setup();
    const ids = Array.from({ length: 20 }, (_, i) => `d${i}`);
    for (const id of ids) t.add(id, 9, null);
    let total = 0;
    for (let index = 0; index < 3; index++) total += (await runDispatch({ ...t.deps, part: { index, count: 3 } }, NOW_9)).devices;
    expect(total).toBe(20);
    expect(t.push.calls).toHaveLength(20);
    expect(ids.map((id) => partOf(id, 3)).every((p) => p >= 0 && p < 3)).toBe(true);
  });

  it("KST 시", () => {
    expect(kstHour(new Date("2026-10-20T15:00:00Z"))).toBe(0);
    expect(kstHour(new Date("2026-10-20T14:59:59Z"))).toBe(23);
  });
});

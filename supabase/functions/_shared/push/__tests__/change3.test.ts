// U6 변경 3 예시 — 마감 임박 고르기·계획·문구·발송 (business-rules §14)
import { describe, expect, it } from "vitest";
import { buildPayload, encodePayload } from "../payload.ts";
import { deadlineNotices, planDevice } from "../plan.ts";
import { runDispatch } from "../dispatch.ts";
import { createVapidSigner, generateVapidKeys } from "../vapid.ts";
import { fakePushService, feedRow, MemoryDispatchStore, silentLog, UA_KEYS } from "./sim.ts";

const TODAY = "2026-10-20";
const NOW_9 = new Date("2026-10-20T00:00:00Z"); // KST 09:00
const BOOKMARKS = [
  { id: "x", title: "x 공고", complexName: "교산 A2", applyEnd: "2026-10-21" },
  { id: "y", title: "양원 행복주택", complexName: null, applyEnd: "2026-10-21" },
  { id: "z", title: "z 공고", complexName: null, applyEnd: "2026-10-22" },
  { id: "w", title: "w 공고", complexName: null, applyEnd: null },
];

describe("마감 임박 고르기 (BR-U6-D10~D12)", () => {
  it("마감 내일만, 기록 빼고, 이름 순, 스위치 끄면 없음", () => {
    expect(deadlineNotices(BOOKMARKS, new Set(), TODAY)).toEqual([{ id: "y", name: "양원 행복주택" }, { id: "x", name: "교산 A2" }].sort((a, b) => (a.name < b.name ? -1 : 1)));
    expect(deadlineNotices(BOOKMARKS, new Set(["x"]), TODAY).map((d) => d.id)).toEqual(["y"]);
    expect(deadlineNotices(BOOKMARKS, new Set(), TODAY, false)).toEqual([]);
  });
});

describe("계획·문구 (BR-U6-D20·D21·D30~D33)", () => {
  const row = feedRow("a", "eligible", "2026-10-19", "2026-10-23", "하남교산 A2");
  const one = [{ id: "x", name: "교산 A2" }];
  const two = [...one, { id: "y", name: "양원 행복주택" }];

  it("새 공고 없이 마감만 있어도 보낸다, 둘 다 없으면 null", () => {
    expect(planDevice("dev", [], new Set(), TODAY, one)).toMatchObject({ notices: [], deadlines: one });
    expect(planDevice("dev", [], new Set(), TODAY, [])).toBeNull();
  });

  it("마감만 1건 → 그 상세, 2건 → 관심 공고 화면", () => {
    expect(buildPayload(planDevice("dev", [], new Set(), TODAY, one)!, TODAY)).toEqual({
      title: "모찌네 청약 알리미", body: "관심 공고 교산 A2 접수 마감이 내일이에요", url: "/notice/x", tag: "daily-2026-10-20",
    });
    expect(buildPayload(planDevice("dev", [], new Set(), TODAY, two)!, TODAY)).toMatchObject({ body: "관심 공고 2건 접수 마감이 내일이에요", url: "/bookmarks" });
  });

  it("새 공고와 같이: 둘째 줄, 누르는 곳은 새 공고 규칙", () => {
    expect(buildPayload(planDevice("dev", [row], new Set(), TODAY, one)!, TODAY)).toMatchObject({
      body: "하남교산 A2 · 자격 충족 — 눌러서 확인해 보세요\n관심 공고 교산 A2 마감이 내일이에요", url: "/notice/a",
    });
    expect(buildPayload(planDevice("dev", [row], new Set(), TODAY, two)!, TODAY).body).toBe("하남교산 A2 · 자격 충족 — 눌러서 확인해 보세요\n관심 공고 2건 마감이 내일이에요");
  });

  it("긴 이름은 줄이고 2KB 이하", () => {
    const long = [{ id: "x", name: "가".repeat(40) }];
    const p = buildPayload(planDevice("dev", [], new Set(), TODAY, long)!, TODAY);
    expect(p.body).toBe(`관심 공고 ${"가".repeat(23)}… 접수 마감이 내일이에요`);
    expect(() => encodePayload(p)).not.toThrow();
  });
});

describe("runDispatch — 마감 임박 (business-logic-model §8.2·8.3)", () => {
  async function setup() {
    const store = new MemoryDispatchStore();
    const push = fakePushService();
    const vapid = await createVapidSigner({ ...(await generateVapidKeys()), subject: "https://mozzi-cheongyak-rador.vercel.app" });
    const deps = { store, vapid, transport: push.transport, recompute: async () => ({ status: "saved" }), log: silentLog, nowMs: () => 0, sleep: async () => undefined };
    const add = (id: string, rows = [feedRow("a", "eligible", "2026-10-19", "2026-10-23")]) => {
      store.devices.set(id, { notifyHour: 9, enabled: true, lastPushOn: null, profileVersion: 1, rows });
      store.subscriptions.set(`https://fcm.googleapis.com/fcm/send/${id}`, { deviceId: id, ...UA_KEYS, failingSince: null });
    };
    return { store, push, deps, add };
  }

  it("엄마 휴대폰: 새 공고 없이 별표 마감 내일 → 1번 보내고 마감 기록, 다시 실행해도 그대로", async () => {
    const t = await setup();
    t.add("mother", []);
    t.store.bookmarks.set("mother", BOOKMARKS);
    const s = await runDispatch(t.deps, NOW_9);
    expect(s).toMatchObject({ sent: 1, skippedEmpty: 0 });
    expect([...t.store.deadlineLog].sort()).toEqual(["mother|x", "mother|y"]);
    expect(t.store.log.size).toBe(0); // 새 공고 알림 기록과 따로
    await runDispatch(t.deps, NOW_9);
    expect(t.push.calls).toHaveLength(1);
  });

  it("마감 알림 끈 기기·별표 없는 기기는 지금과 같다", async () => {
    const t = await setup();
    t.add("father", []);
    t.store.bookmarks.set("father", BOOKMARKS);
    t.store.deadlineOff.add("father");
    t.add("me");
    const s = await runDispatch(t.deps, NOW_9);
    expect(s).toMatchObject({ sent: 1, skippedEmpty: 1 });
    expect(t.store.deadlineLog.size).toBe(0);
  });

  it("보내기가 모두 실패하면 마감 기록도 없다 (다음 실행에서 다시 대상)", async () => {
    const t = await setup();
    t.add("mother", []);
    t.store.bookmarks.set("mother", BOOKMARKS);
    t.push.status.set("https://fcm.googleapis.com/fcm/send/mother", 500);
    await runDispatch(t.deps, NOW_9);
    expect(t.store.deadlineLog.size).toBe(0);
    expect(t.store.devices.get("mother")!.lastPushOn).toBeNull();
  });
});

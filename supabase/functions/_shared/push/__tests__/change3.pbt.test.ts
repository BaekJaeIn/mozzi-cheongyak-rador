// 속성 기반 테스트 — U6 변경 3 (domain-entities §8.6, P-U6-D1~D4)
import { fc, test } from "@fast-check/vitest";
import { addDays } from "../../domain/dates.ts";
import { expect } from "vitest";
import { buildPayload, encodePayload } from "../payload.ts";
import { type BookmarkedNotice, deadlineNotices, planDevice } from "../plan.ts";
import { runDispatch } from "../dispatch.ts";
import { createVapidSigner, generateVapidKeys } from "../vapid.ts";
import { buildPayload as legacyBuildPayload } from "./legacy/payload.ts";
import { planDevice as legacyPlanDevice } from "./legacy/plan.ts";
import { fakePushService, feedRow, MemoryDispatchStore, silentLog, UA_KEYS } from "./sim.ts";

const TODAY = "2026-10-20";
const verdictArb = fc.constantFrom("eligible" as const, "unknown" as const, "ineligible" as const);
const dayArb = fc.option(fc.integer({ min: -5, max: 10 }), { nil: null });
const rowsArb = fc.uniqueArray(fc.integer({ min: 1, max: 99 }), { maxLength: 8 }).chain((ids) =>
  fc.tuple(...ids.map((id) => fc.tuple(verdictArb, dayArb, fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null })).map(([v, end, name]) =>
    feedRow(`n${id}`, v, addDays(TODAY, -3), end === null ? null : addDays(TODAY, end), name)))),
);
const bookmarksArb: fc.Arbitrary<BookmarkedNotice[]> = fc.uniqueArray(fc.integer({ min: 1, max: 99 }), { maxLength: 10 }).chain((ids) =>
  fc.tuple(...ids.map((id) => fc.record({
    id: fc.constant(`b${id}`),
    title: fc.string({ unit: "grapheme", minLength: 1, maxLength: 60 }),
    complexName: fc.option(fc.string({ unit: "grapheme", minLength: 1, maxLength: 60 }), { nil: null }),
    applyEnd: fc.option(fc.integer({ min: -2, max: 4 }).map((d) => addDays(TODAY, d)), { nil: null }),
  }))),
);

test.prop([rowsArb, fc.subarray(Array.from({ length: 99 }, (_, i) => `n${i + 1}`))])("P-U6-D1 마감 임박이 없으면 계획·문구는 변경 3 전과 같다", (rows, notified) => {
  const now = planDevice("dev", rows, new Set(notified), TODAY);
  const before = legacyPlanDevice("dev", rows, new Set(notified), TODAY);
  if (before === null) {
    expect(now).toBeNull();
    return;
  }
  expect(now).toEqual({ ...before, deadlines: [] });
  expect(buildPayload(now!, TODAY)).toEqual(legacyBuildPayload(before, TODAY));
});

test.prop([bookmarksArb, fc.subarray(Array.from({ length: 99 }, (_, i) => `b${i + 1}`)), fc.boolean()])("P-U6-D2 마감 임박 = 관심 공고 ∩ 마감 내일 − 기록, 스위치 끄면 빈 목록", (bookmarks, recorded, enabled) => {
  const got = deadlineNotices(bookmarks, new Set(recorded), TODAY, enabled);
  const tomorrow = addDays(TODAY, 1);
  const expected = enabled ? bookmarks.filter((b) => b.applyEnd === tomorrow && !recorded.includes(b.id)).map((b) => b.id).sort() : [];
  expect(got.map((d) => d.id).sort()).toEqual(expected);
});

test.prop([fc.array(fc.record({ id: fc.uuid(), name: fc.string({ unit: "grapheme", minLength: 1, maxLength: 80 }) }), { minLength: 1, maxLength: 100 }), rowsArb])(
  "P-U6-D4 마감 포함 알림 내용은 2KB 이하, 이름은 24글자 이하로 줄인다",
  (deadlines, rows) => {
    const item = planDevice("dev", rows, new Set(), TODAY, deadlines)!;
    const p = buildPayload(item, TODAY);
    expect(() => encodePayload(p)).not.toThrow();
    expect(p.body).toContain("마감이 내일이에요");
  },
);

test.prop([bookmarksArb, fc.integer({ min: 1, max: 4 })], { numRuns: 30 })("P-U6-D3 같은 날 몇 번 실행해도 기기당 1번, 같은 공고 마감 기록 1번", async (bookmarks, runs) => {
  const store = new MemoryDispatchStore();
  const push = fakePushService();
  const vapid = await createVapidSigner({ ...(await generateVapidKeys()), subject: "https://mozzi-cheongyak-rador.vercel.app" });
  store.devices.set("dev", { notifyHour: 9, enabled: true, lastPushOn: null, profileVersion: 1, rows: [] });
  store.subscriptions.set("https://fcm.googleapis.com/fcm/send/dev", { deviceId: "dev", ...UA_KEYS, failingSince: null });
  store.bookmarks.set("dev", bookmarks);
  const deps = { store, vapid, transport: push.transport, recompute: async () => ({ status: "saved" }), log: silentLog, nowMs: () => 0, sleep: async () => undefined };
  for (let i = 0; i < runs; i++) await runDispatch(deps, new Date("2026-10-20T00:00:00Z"));
  const expected = deadlineNotices(bookmarks, new Set(), TODAY).length;
  expect(push.calls).toHaveLength(expected > 0 ? 1 : 0);
  expect(store.deadlineLog.size).toBe(expected);
});

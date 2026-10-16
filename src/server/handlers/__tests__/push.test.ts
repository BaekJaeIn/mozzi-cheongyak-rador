// 예시 기반 테스트 — U6 API (BR-U6-50~55·65~68·90~92, NFR-U6-16)
import { buildAuthHeaders } from "@shared/security/auth-headers.ts";
import { generateVapidKeys } from "@shared/push/vapid.ts";
import type { PushTarget } from "@shared/push/send.ts";
import { describe, expect, it } from "vitest";
import { createRouteGuard } from "../../auth/route-guard";
import { createMemoryDevices, seedDevice } from "../../__tests__/helpers";
import type { FeedQueryRepository, FeedRow } from "../../feed/types";
import { createPushKeyHandler, createSubscribeHandler, createTestPushHandler, type PushDeps, SUBSCRIBE_MAX_BODY_BYTES } from "../push";

const NOW = new Date("2026-10-20T03:00:00Z");
const UA = { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/secret-token-abc";

const row = (id: string, verdict: FeedRow["verdict"], end: string): FeedRow => ({
  verdict,
  inDistrict: true,
  score: 1,
  detail: {},
  notice: { id, title: id, complexName: null, tenure: "rent", applyStart: "2026-10-19", applyEnd: end, firstSeenAt: "2026-10-18T00:00:00.000Z" },
  districts: [],
});

async function setup(o: { vapid?: boolean; subs?: PushTarget[]; testAllowed?: boolean; status?: number } = {}) {
  const devices = createMemoryDevices();
  const credentials = await seedDevice(devices, NOW);
  const logs: string[] = [];
  const withDevice = createRouteGuard(() => ({ devices, now: () => NOW }), (l) => void logs.push(l));
  const keys = await generateVapidKeys();
  const saved: unknown[] = [];
  const recorded: unknown[] = [];
  const sentTo: string[] = [];
  const deps: PushDeps = {
    vapid: () => (o.vapid === false ? null : { ...keys, subject: "https://mozzi-cheongyak-rador.vercel.app" }),
    feed: () => ({ listFeedRows: async () => [row("open", "eligible", "2026-10-23"), row("no", "ineligible", "2026-10-23"), row("old", "eligible", "2026-10-01")] }) as unknown as FeedQueryRepository,
    saveSubscription: async (input) => {
      saved.push(input);
      return { saved: true, baselined: true };
    },
    tryTestPush: async () => o.testAllowed ?? true,
    listSubscriptions: async () => o.subs ?? [{ endpoint: ENDPOINT, ...UA }],
    recordResult: async (_d, r) => void recorded.push(r),
    transport: async (url) => {
      sentTo.push(url);
      return new Response(null, { status: o.status ?? 201 });
    },
    now: () => NOW,
  };
  const req = (path: string, body?: string, auth = true) =>
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { ...(auth ? buildAuthHeaders(credentials) : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body,
    });
  return {
    keys,
    logs,
    saved,
    recorded,
    sentTo,
    subscribe: (body: string, auth = true) =>
      withDevice(createSubscribeHandler(deps), { route: "POST /api/push/subscribe", maxBodyBytes: SUBSCRIBE_MAX_BODY_BYTES })(req("/api/push/subscribe", body, auth)),
    test: () => withDevice(createTestPushHandler(deps), { route: "POST /api/push/test" })(req("/api/push/test")),
    key: () => createPushKeyHandler(deps)(),
  };
}

const body = JSON.stringify({ endpoint: ENDPOINT, expirationTime: null, keys: UA });

describe("POST /api/push/subscribe", () => {
  it("저장 + 기준선은 지금 피드에 보이는 공고 (BR-U6-10)", async () => {
    const t = await setup();
    const res = await t.subscribe(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ subscribed: true });
    expect(t.saved[0]).toMatchObject({ endpoint: ENDPOINT, p256dh: UA.p256dh, auth: UA.auth, baselineIds: ["open"] });
  });

  it("401 인증 없음, 400 허용 안 된 주소, 413 너무 큼", async () => {
    const t = await setup();
    expect((await t.subscribe(body, false)).status).toBe(401);
    expect((await t.subscribe(JSON.stringify({ endpoint: "https://evil.com/x", keys: UA }))).status).toBe(400);
    expect((await t.subscribe(JSON.stringify({ endpoint: ENDPOINT, keys: UA, pad: "x".repeat(5000) }))).status).toBe(413);
    expect(t.saved).toHaveLength(0);
  });

  it("로그에 구독 주소·키가 없다 (NFR-U6-16)", async () => {
    const t = await setup();
    await t.subscribe(body);
    await t.subscribe(JSON.stringify({ endpoint: "https://evil.com/x", keys: UA }));
    const log = t.logs.join("\n");
    for (const secret of ["secret-token-abc", UA.p256dh, UA.auth, "evil.com"]) expect(log).not.toContain(secret);
  });
});

describe("POST /api/push/test", () => {
  it("모든 구독에 보내고 결과를 반영 (알림 기록 없음)", async () => {
    const t = await setup({ subs: [{ endpoint: ENDPOINT, ...UA }, { endpoint: "https://web.push.apple.com/x", ...UA }] });
    const res = await t.test();
    expect(await res.json()).toEqual({ sent: 2, failed: 0, removed: 0 });
    expect(t.sentTo).toHaveLength(2);
    expect(t.recorded[0]).toEqual({ success: [ENDPOINT, "https://web.push.apple.com/x"], failed: [], gone: [] });
  });

  it("만료면 지울 목록으로", async () => {
    const t = await setup({ status: 410 });
    expect(await (await t.test()).json()).toEqual({ sent: 0, failed: 0, removed: 1 });
  });

  it("409 구독 없음, 429 한도, 503 설정 없음", async () => {
    expect((await (await setup({ subs: [] })).test()).status).toBe(409);
    const limited = await (await setup({ testAllowed: false })).test();
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ code: "TOO_MANY_TESTS", message: "잠시 뒤에 다시 시험해 주세요." });
    expect((await (await setup({ vapid: false })).test()).status).toBe(503);
  });
});

describe("GET /api/push/key", () => {
  it("공개 키만, 설정 없으면 503", async () => {
    const t = await setup();
    const res = await t.key();
    expect(await res.json()).toEqual({ publicKey: t.keys.publicKey });
    expect(JSON.stringify(await (await t.key()).json())).not.toContain(t.keys.privateKey);
    expect((await (await setup({ vapid: false })).key()).status).toBe(503);
  });
});

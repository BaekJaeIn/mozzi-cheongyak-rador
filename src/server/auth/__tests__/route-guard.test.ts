// 예시 기반 테스트 — 기기 인증 래퍼 (BR-U1-06~08, 11, P-S6)
import { describe, expect, it } from "vitest";
import { generateToken } from "@shared/security/token.ts";
import { createRouteGuard, shouldTouch, TOUCH_INTERVAL_MS } from "../route-guard";
import { createMemoryDevices, request, seedDevice, silentSink } from "../../__tests__/helpers";

const NOW = new Date("2026-10-14T10:00:00Z");

function setup() {
  const devices = createMemoryDevices();
  const withDevice = createRouteGuard(() => ({ devices, now: () => NOW }), silentSink);
  const handler = withDevice(async (ctx) => Response.json({ deviceId: ctx.deviceId, body: ctx.body }), {
    route: "TEST",
    maxBodyBytes: 64,
  });
  return { devices, handler };
}

describe("withDevice", () => {
  it("헤더가 없으면 401 AUTH_MISSING", async () => {
    const { handler } = setup();
    const res = await handler(request("PUT", { body: "{}" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "AUTH_MISSING" });
  });

  it("없는 기기면 401 DEVICE_UNKNOWN", async () => {
    const { handler } = setup();
    const res = await handler(
      request("PUT", { body: "{}", credentials: { deviceId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", token: generateToken() } }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "DEVICE_UNKNOWN" });
  });

  it("토큰이 다르면 401 TOKEN_MISMATCH", async () => {
    const { devices, handler } = setup();
    const { deviceId } = await seedDevice(devices, NOW);
    const res = await handler(request("PUT", { body: "{}", credentials: { deviceId, token: generateToken() } }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "TOKEN_MISMATCH" });
  });

  it("성공하면 핸들러에 deviceId와 본문을 넘기고 requestId 헤더를 붙인다", async () => {
    const { devices, handler } = setup();
    const credentials = await seedDevice(devices, NOW);
    const res = await handler(request("PUT", { body: '{"a":1}', credentials }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deviceId: credentials.deviceId, body: { a: 1 } });
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("마지막 접속이 1시간 이내면 갱신하지 않고, 1시간 이상이면 갱신한다", async () => {
    const { devices, handler } = setup();
    const recent = await seedDevice(devices, new Date(NOW.getTime() - TOUCH_INTERVAL_MS + 1));
    await handler(request("PUT", { body: "{}", credentials: recent }));
    expect(devices.touches).toHaveLength(0);

    const old = await seedDevice(devices, new Date(NOW.getTime() - TOUCH_INTERVAL_MS));
    await handler(request("PUT", { body: "{}", credentials: old }));
    expect(devices.touches).toEqual([{ deviceId: old.deviceId, now: NOW }]);
  });

  it("본문이 최대 크기를 넘으면 인증 전에 413", async () => {
    const { handler } = setup();
    const res = await handler(request("PUT", { body: JSON.stringify({ x: "y".repeat(100) }) }));
    expect(res.status).toBe(413);
  });

  it("본문이 JSON이 아니면 400", async () => {
    const { devices, handler } = setup();
    const credentials = await seedDevice(devices, NOW);
    const res = await handler(request("PUT", { body: "not json", credentials }));
    expect(res.status).toBe(400);
  });

  it("핸들러가 예외를 던지면 500 SERVER", async () => {
    const devices = createMemoryDevices();
    const credentials = await seedDevice(devices, NOW);
    const withDevice = createRouteGuard(() => ({ devices, now: () => NOW }), silentSink);
    const res = await withDevice(async () => {
      throw new Error("boom");
    }, { route: "TEST" })(request("GET", { credentials }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "SERVER" });
  });
});

// 회귀 테스트: 스모크 테스트에서 발견 — 의존성 준비 실패가 413·401을 가리면 안 되고, 500도 { code } 형식이어야 한다
describe("의존성 준비 실패", () => {
  const broken = createRouteGuard(() => {
    throw new Error("환경 변수 SUPABASE_URL가 설정되지 않았습니다");
  }, silentSink);
  const handler = broken(async () => Response.json({}), { route: "TEST", maxBodyBytes: 64 });

  it("본문 초과는 413, 헤더 없음은 401", async () => {
    expect((await handler(request("PUT", { body: JSON.stringify({ x: "y".repeat(100) }) }))).status).toBe(413);
    expect((await handler(request("PUT", { body: "{}" }))).status).toBe(401);
  });

  it("헤더가 있으면 { code: SERVER } 500", async () => {
    const res = await handler(
      request("PUT", { body: "{}", credentials: { deviceId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", token: generateToken() } }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "SERVER" });
  });
});

describe("shouldTouch", () => {
  it("정확히 1시간이면 갱신", () => {
    expect(shouldTouch(new Date(NOW.getTime() - TOUCH_INTERVAL_MS), NOW)).toBe(true);
  });
});

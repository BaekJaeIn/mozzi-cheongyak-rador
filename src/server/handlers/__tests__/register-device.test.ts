// 예시 기반 테스트 — 기기 등록 API (BR-U1-02~05, P-S4)
import { describe, expect, it } from "vitest";
import { generateDeviceId, generateToken } from "@shared/security/token.ts";
import { createRegisterHandler } from "../register-device";
import { createMemoryDevices, request, silentSink } from "../../__tests__/helpers";

function setup() {
  const devices = createMemoryDevices();
  const handler = createRegisterHandler(() => devices, silentSink);
  return { devices, handler };
}

const body = (deviceId: string, token: string) => JSON.stringify({ deviceId, token });

describe("POST /api/device", () => {
  it("새 기기는 201 created, 토큰은 해시로만 저장", async () => {
    const { devices, handler } = setup();
    const deviceId = generateDeviceId();
    const token = generateToken();
    const res = await handler(request("POST", { body: body(deviceId, token) }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "created" });
    const stored = devices.records.get(deviceId)!;
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.tokenHash).not.toBe(token);
  });

  it("같은 ID·같은 토큰으로 다시 보내면 200 existing (멱등)", async () => {
    const { handler } = setup();
    const payload = body(generateDeviceId(), generateToken());
    await handler(request("POST", { body: payload }));
    const res = await handler(request("POST", { body: payload }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "existing" });
  });

  it("같은 ID·다른 토큰이면 409 DEVICE_CONFLICT", async () => {
    const { handler } = setup();
    const deviceId = generateDeviceId();
    await handler(request("POST", { body: body(deviceId, generateToken()) }));
    const res = await handler(request("POST", { body: body(deviceId, generateToken()) }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "DEVICE_CONFLICT" });
  });

  it("등록 한도를 넘으면 429", async () => {
    const { devices, handler } = setup();
    devices.nextRegisterResult = "rate_limited";
    const res = await handler(request("POST", { body: body(generateDeviceId(), generateToken()) }));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "TOO_MANY_REGISTRATIONS" });
  });

  it("형식이 틀리면 400", async () => {
    const { handler } = setup();
    for (const payload of ["{}", body("not-uuid", generateToken()), body(generateDeviceId(), "short"), "null"]) {
      const res = await handler(request("POST", { body: payload }));
      expect(res.status).toBe(400);
    }
  });

  it("1KB를 넘으면 413", async () => {
    const { handler } = setup();
    const res = await handler(request("POST", { body: JSON.stringify({ pad: "x".repeat(1100) }) }));
    expect(res.status).toBe(413);
  });

  it("저장소 오류면 500, 응답에 내부 정보가 없다", async () => {
    const devices = createMemoryDevices();
    devices.register = async () => {
      throw new Error("db down secret-detail");
    };
    const res = await createRegisterHandler(() => devices, silentSink)(
      request("POST", { body: body(generateDeviceId(), generateToken()) }),
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret-detail");
  });

  // 회귀 테스트: 스모크 테스트에서 발견 — 의존성(환경 변수·DB) 준비가 실패해도 입력 오류는 400·413으로 응답해야 한다
  it("의존성 준비가 실패해도 잘못된 입력은 400·413, 올바른 입력은 { code } 형식의 500", async () => {
    const handler = createRegisterHandler(() => {
      throw new Error("환경 변수 SUPABASE_URL가 설정되지 않았습니다");
    }, silentSink);
    expect((await handler(request("POST", { body: body("bad", "x") }))).status).toBe(400);
    expect((await handler(request("POST", { body: JSON.stringify({ pad: "x".repeat(1100) }) }))).status).toBe(413);
    const res = await handler(request("POST", { body: body(generateDeviceId(), generateToken()) }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "SERVER" });
  });

  it("로그에 토큰이 남지 않는다", async () => {
    const lines: string[] = [];
    const devices = createMemoryDevices();
    const token = generateToken();
    await createRegisterHandler(() => devices, (l) => lines.push(l))(
      request("POST", { body: body(generateDeviceId(), token) }),
    );
    expect(lines.join("\n")).not.toContain(token);
  });
});

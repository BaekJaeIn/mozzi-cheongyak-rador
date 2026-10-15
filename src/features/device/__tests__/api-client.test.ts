// 예시 기반 테스트 — 기기용 API 래퍼 (L1, P-R1, BR-U1-03·09)
import { describe, expect, it } from "vitest";
import { apiError } from "@shared/http/errors.ts";
import { createApiClient } from "../api-client";
import { createIdentity, createMemoryStorage, loadIdentity, saveIdentity } from "../identity-store";

type Reply = Response | "network";

/** 순서대로 응답하는 가짜 fetch. 요청 기록을 남긴다. */
function scriptedFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (reply === undefined) throw new Error(`예상하지 못한 요청: ${url}`);
    if (reply === "network") throw new TypeError("Failed to fetch");
    return reply;
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const ok = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (code: Parameters<typeof apiError>[0], status: number) => Response.json(apiError(code), { status });
const noSleep = async () => undefined;

function setup(replies: Reply[], registered = true) {
  const storage = createMemoryStorage();
  const identity = createIdentity();
  if (registered) saveIdentity(storage, identity);
  const { fetchFn, calls } = scriptedFetch(replies);
  const client = createApiClient({ storage, fetch: fetchFn, sleep: noSleep });
  return { storage, identity, client, calls };
}

const headerOf = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe("ensureDevice", () => {
  it("등록된 기기면 네트워크 요청 없이 돌려준다", async () => {
    const { client, identity, calls } = setup([]);
    await expect(client.ensureDevice()).resolves.toEqual(identity);
    expect(calls).toHaveLength(0);
  });

  it("처음이면 등록하고 저장한다", async () => {
    const { client, storage, calls } = setup([ok({ status: "created" }, 201)], false);
    const identity = await client.ensureDevice();
    expect(calls[0]?.url).toBe("/api/device");
    expect(loadIdentity(storage)).toEqual(identity);
  });

  it("409면 새 ID로 한 번 더 등록한다", async () => {
    const { client, calls } = setup([fail("DEVICE_CONFLICT", 409), ok({ status: "created" }, 201)], false);
    await client.ensureDevice();
    const first = JSON.parse(calls[0]!.init.body as string);
    const second = JSON.parse(calls[1]!.init.body as string);
    expect(first.deviceId).not.toBe(second.deviceId);
  });

  it("등록 중 네트워크가 계속 끊기면 NETWORK 오류", async () => {
    const { client } = setup(["network", "network"], false);
    await expect(client.ensureDevice()).rejects.toMatchObject({ error: { code: "NETWORK" } });
  });
});

describe("request", () => {
  it("인증 헤더를 붙여 보낸다", async () => {
    const { client, identity, calls } = setup([ok({ a: 1 })]);
    const result = await client.request("/api/feed");
    expect(result).toEqual({ ok: true, status: 200, data: { a: 1 } });
    expect(headerOf(calls[0]!.init, "x-device-id")).toBe(identity.deviceId);
    expect(headerOf(calls[0]!.init, "x-device-token")).toBe(identity.token);
  });

  it("5xx면 1번 재시도한다", async () => {
    const { client, calls } = setup([fail("SERVER", 503), ok({ a: 1 })]);
    expect((await client.request("/api/feed")).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("재시도는 1번까지만", async () => {
    const { client, calls } = setup(["network", "network"]);
    const result = await client.request("/api/feed");
    expect(result).toMatchObject({ ok: false, error: { code: "NETWORK" } });
    expect(calls).toHaveLength(2);
  });

  it("4xx는 재시도하지 않는다", async () => {
    const { client, calls } = setup([fail("BAD_REQUEST", 400)]);
    expect(await client.request("/api/feed")).toMatchObject({ ok: false, status: 400, error: { code: "BAD_REQUEST" } });
    expect(calls).toHaveLength(1);
  });

  it("401 DEVICE_UNKNOWN이면 새 기기로 등록하고 원래 요청을 1번 다시 보낸다", async () => {
    const { client, identity, storage, calls } = setup([
      fail("DEVICE_UNKNOWN", 401),
      ok({ status: "created" }, 201),
      ok({ a: 1 }),
    ]);
    let notified = 0;
    client.onReRegistered(() => notified++);
    const result = await client.request("/api/feed");
    expect(result.ok).toBe(true);
    expect(notified).toBe(1);
    const fresh = loadIdentity(storage)!;
    expect(fresh.deviceId).not.toBe(identity.deviceId);
    expect(headerOf(calls[2]!.init, "x-device-id")).toBe(fresh.deviceId);
  });

  it("다시 등록한 뒤에도 401이면 더 반복하지 않는다", async () => {
    const { client, calls } = setup([fail("TOKEN_MISMATCH", 401), ok({ status: "created" }, 201), fail("TOKEN_MISMATCH", 401)]);
    expect(await client.request("/api/feed")).toMatchObject({ ok: false, status: 401 });
    expect(calls).toHaveLength(3);
  });

  it("reregister: false면 401이어도 다시 등록하지 않는다 (U4 모두 지우기)", async () => {
    const { client, identity, storage, calls } = setup([fail("DEVICE_UNKNOWN", 401)]);
    let notified = 0;
    client.onReRegistered(() => notified++);
    expect(await client.request("/api/device", { method: "DELETE" }, { reregister: false })).toMatchObject({
      ok: false,
      status: 401,
      error: { code: "DEVICE_UNKNOWN" },
    });
    expect(calls).toHaveLength(1);
    expect(notified).toBe(0);
    expect(loadIdentity(storage)).toEqual(identity);
  });

  it("reregister: false이고 저장된 기기가 없으면 요청 없이 401 AUTH_MISSING", async () => {
    const { client, calls } = setup([], false);
    expect(await client.request("/api/device", { method: "DELETE" }, { reregister: false })).toMatchObject({
      ok: false,
      status: 401,
      error: { code: "AUTH_MISSING" },
    });
    expect(calls).toHaveLength(0);
  });

  it("204는 data null", async () => {
    const { client } = setup([new Response(null, { status: 204 })]);
    expect(await client.request("/api/device", { method: "DELETE" })).toEqual({ ok: true, status: 204, data: null });
  });

  it("오류 본문 형식이 아니면 SERVER 오류로 바꾼다", async () => {
    const { client } = setup([new Response("<html>", { status: 418 })]);
    expect(await client.request("/api/x")).toMatchObject({ ok: false, error: { code: "SERVER" } });
  });
});

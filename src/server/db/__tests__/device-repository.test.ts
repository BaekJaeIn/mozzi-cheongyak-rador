// 예시 기반 테스트 — DeviceRepository (BR-U1-03, P-S4)
import { describe, expect, it } from "vitest";
import { createDeviceRepository } from "../device-repository";
import { DbError } from "../client";
import { createFakeDb } from "./fake-db";

const ID = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";
const HASH = "a".repeat(64);

describe("register", () => {
  for (const result of ["created", "existing", "conflict", "rate_limited"] as const) {
    it(`RPC 결과 '${result}'를 그대로 돌려준다`, async () => {
      const { db, calls } = createFakeDb(() => ({ data: result, error: null }));
      await expect(createDeviceRepository(db).register(ID, HASH)).resolves.toBe(result);
      expect(calls[0]).toMatchObject({ kind: "rpc", name: "register_device", args: { p_id: ID, p_token_hash: HASH } });
    });
  }

  it("알 수 없는 결과면 DbError", async () => {
    const { db } = createFakeDb(() => ({ data: "weird", error: null }));
    await expect(createDeviceRepository(db).register(ID, HASH)).rejects.toBeInstanceOf(DbError);
  });

  it("DB 오류면 DbError", async () => {
    const { db } = createFakeDb(() => ({ data: null, error: { message: "boom", code: "XX000" } }));
    await expect(createDeviceRepository(db).register(ID, HASH)).rejects.toBeInstanceOf(DbError);
  });
});

describe("findAuth", () => {
  it("기기가 없으면 null", async () => {
    const { db } = createFakeDb(() => ({ data: null, error: null }));
    await expect(createDeviceRepository(db).findAuth(ID)).resolves.toBeNull();
  });

  it("해시와 마지막 접속 시각을 돌려준다", async () => {
    const { db, calls } = createFakeDb(() => ({
      data: { token_hash: HASH, last_seen_at: "2026-10-14T00:00:00.000Z" },
      error: null,
    }));
    const record = await createDeviceRepository(db).findAuth(ID);
    expect(record).toEqual({ tokenHash: HASH, lastSeenAt: new Date("2026-10-14T00:00:00.000Z") });
    expect(calls[0]?.chain.map((c) => c.method)).toEqual(["select", "eq", "maybeSingle"]);
  });
});

describe("touch / deleteAll", () => {
  it("touch는 last_seen_at을 갱신한다", async () => {
    const { db, calls } = createFakeDb(() => ({ data: null, error: null }));
    const now = new Date("2026-10-14T01:00:00.000Z");
    await createDeviceRepository(db).touch(ID, now);
    expect(calls[0]?.chain[0]).toEqual({ method: "update", args: [{ last_seen_at: now.toISOString() }] });
  });

  it("deleteAll은 RPC 결과(true/false)를 돌려준다", async () => {
    const { db } = createFakeDb(() => ({ data: false, error: null }));
    await expect(createDeviceRepository(db).deleteAll(ID)).resolves.toBe(false);
  });
});

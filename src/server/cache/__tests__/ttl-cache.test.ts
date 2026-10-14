// 예시 기반 테스트 — 기준 데이터 캐시 (P-P1)
import { describe, expect, it } from "vitest";
import { createTtlCache } from "../ttl-cache";

describe("createTtlCache", () => {
  it("TTL 안에서는 다시 읽지 않고, 지나면 다시 읽는다", async () => {
    let clock = 0;
    let loads = 0;
    const cache = createTtlCache(async () => ++loads, 1000, () => clock);
    expect(await cache.get()).toBe(1);
    clock = 999;
    expect(await cache.get()).toBe(1);
    clock = 1000;
    expect(await cache.get()).toBe(2);
  });

  it("동시에 여러 번 요청해도 한 번만 읽는다", async () => {
    let loads = 0;
    const cache = createTtlCache(async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 5));
      return "data";
    });
    await Promise.all([cache.get(), cache.get(), cache.get()]);
    expect(loads).toBe(1);
  });

  it("읽기에 실패하면 캐시하지 않고 다음 요청에서 다시 읽는다", async () => {
    let attempt = 0;
    const cache = createTtlCache(async () => {
      attempt++;
      if (attempt === 1) throw new Error("fail");
      return "ok";
    });
    await expect(cache.get()).rejects.toThrow("fail");
    await expect(cache.get()).resolves.toBe("ok");
  });
});

// 예시 기반 테스트 — 기기 ID·토큰 보관 (L2)
import { describe, expect, it } from "vitest";
import { createIdentity, createMemoryStorage, DEVICE_STORAGE_KEY, loadIdentity, saveIdentity } from "../identity-store";

describe("identity-store", () => {
  it("저장한 값을 그대로 읽는다", () => {
    const storage = createMemoryStorage();
    const identity = createIdentity();
    saveIdentity(storage, identity);
    expect(loadIdentity(storage)).toEqual(identity);
  });

  it("값이 없으면 null", () => {
    expect(loadIdentity(createMemoryStorage())).toBeNull();
  });

  it("손상된 값은 null을 돌려주고 지운다", () => {
    for (const raw of ["not json", '{"deviceId":"x","token":"y"}', "null"]) {
      const storage = createMemoryStorage({ [DEVICE_STORAGE_KEY]: raw });
      expect(loadIdentity(storage)).toBeNull();
      expect(storage.data.has(DEVICE_STORAGE_KEY)).toBe(false);
    }
  });
});

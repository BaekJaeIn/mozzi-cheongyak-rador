// 속성 기반 테스트 — 캐시 유효성 판단 단조성 (PBT-03)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { isFresh } from "../ttl-cache";

const time = fc.integer({ min: 0, max: 10 ** 12 });
const ttl = fc.integer({ min: 1, max: 24 * 60 * 60 * 1000 });

test.prop([time, time, time, ttl])("한 번 만료되면 이후 시각에도 만료", (loadedAt, a, b, ttlMs) => {
  const [t1, t2] = a <= b ? [a, b] : [b, a];
  if (!isFresh(loadedAt, t1, ttlMs)) {
    expect(isFresh(loadedAt, t2, ttlMs)).toBe(false);
  }
});

test.prop([time, ttl])("읽은 직후는 유효하고, 정확히 TTL이 지나면 만료", (loadedAt, ttlMs) => {
  expect(isFresh(loadedAt, loadedAt, ttlMs)).toBe(true);
  expect(isFresh(loadedAt, loadedAt + ttlMs, ttlMs)).toBe(false);
});

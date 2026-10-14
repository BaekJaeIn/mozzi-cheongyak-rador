// 속성 기반 테스트 — 재시도 판단 불변식 (PBT-03)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { shouldRetry } from "../retry.ts";

test.prop([fc.integer({ min: 400, max: 499 })])("408을 뺀 4xx는 다시 시도하지 않는다", (status) => {
  expect(shouldRetry({ kind: "status", status })).toBe(status === 408);
});

test.prop([fc.integer({ min: 500, max: 599 })])("5xx는 항상 다시 시도한다", (status) => {
  expect(shouldRetry({ kind: "status", status })).toBe(true);
});

test.prop([fc.integer({ min: 200, max: 399 })])("2xx·3xx는 다시 시도하지 않는다", (status) => {
  expect(shouldRetry({ kind: "status", status })).toBe(false);
});

test("네트워크 오류는 다시 시도한다", () => {
  expect(shouldRetry({ kind: "network" })).toBe(true);
});

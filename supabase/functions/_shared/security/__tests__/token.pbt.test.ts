// 속성 기반 테스트 — 기기 토큰 (PBT-01 식별 속성: Invariant, Easy verification)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { generateDeviceId, generateToken, hashToken, isValidDeviceId, isValidToken, verifyToken } from "../token.ts";
import { tokenArb } from "../../__tests__/arbitraries/index.ts";

test.prop([tokenArb])("모든 토큰 t에 대해 verify(t, hash(t)) = true", async (token) => {
  expect(await verifyToken(token, await hashToken(token))).toBe(true);
});

test.prop([tokenArb, tokenArb])("서로 다른 토큰은 상대의 해시로 검증되지 않는다", async (t1, t2) => {
  fc.pre(t1 !== t2);
  expect(await verifyToken(t2, await hashToken(t1))).toBe(false);
});

test.prop([fc.integer({ min: 1, max: 50 })])("생성기가 만든 값은 항상 형식 검증을 통과한다", (n) => {
  for (let i = 0; i < n; i++) {
    expect(isValidDeviceId(generateDeviceId())).toBe(true);
    expect(isValidToken(generateToken())).toBe(true);
  }
});

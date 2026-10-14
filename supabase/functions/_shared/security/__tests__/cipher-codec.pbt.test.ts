// 속성 기반 테스트 — 암호화 왕복, 코덱 왕복 (PBT-02)
import { fc, test } from "@fast-check/vitest";
import { expect } from "vitest";
import { MAX_AMOUNT_MANWON } from "../../domain/profile.ts";
import { createKeyring, decryptAmount, encryptAmount } from "../amount-cipher.ts";
import { decodeProfile, encodeProfile } from "../profile-codec.ts";
import { profileArb } from "../../__tests__/arbitraries/eligibility.ts";
import { testKey } from "../../__tests__/fixtures.ts";

const keyringPromise = createKeyring({ 1: testKey(7), 2: testKey(8) }, 2);
const amountArb = fc.integer({ min: 0, max: MAX_AMOUNT_MANWON });

test.prop([amountArb])("decrypt(encrypt(x)) = x", async (x) => {
  const ring = await keyringPromise;
  expect(await decryptAmount(await encryptAmount(x, ring), ring)).toBe(x);
});

test.prop([amountArb])("같은 금액도 매번 다른 암호문 (무작위 IV)", async (x) => {
  const ring = await keyringPromise;
  expect(await encryptAmount(x, ring)).not.toBe(await encryptAmount(x, ring));
});

test.prop([profileArb()])("decodeProfile(encodeProfile(p)) = p", async (p) => {
  const ring = await keyringPromise;
  expect(await decodeProfile(await encodeProfile(p, ring), ring)).toEqual(p);
});

test.prop([profileArb({ nullable: false })])("저장 형식 data에는 금액 숫자가 없다", async (p) => {
  const ring = await keyringPromise;
  const stored = await encodeProfile(p, ring);
  const money = stored.data.money as Record<string, unknown>;
  expect(Object.keys(money)).toEqual(["spouseEarns"]);
});

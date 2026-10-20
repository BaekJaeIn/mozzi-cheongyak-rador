// 예시 기반 테스트 — 금액 암호화·프로필 코덱 (BR-U2-70~73)
import { describe, expect, it } from "vitest";

import { AmountCipherError, cipherVersionOf, createKeyring, decryptAmount, encryptAmount } from "../amount-cipher.ts";
import { decodeProfile, encodeProfile, ProfileCodecError } from "../profile-codec.ts";
import { makeProfile, testKey } from "../../__tests__/fixtures.ts";

describe("amount-cipher", () => {
  it("형식 v{n}.{iv}.{ct}, 왕복", async () => {
    const ring = await createKeyring({ 1: testKey(1) }, 1);
    const text = await encryptAmount(450, ring);
    expect(text).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(cipherVersionOf(text)).toBe(1);
    await expect(decryptAmount(text, ring)).resolves.toBe(450);
  });

  // 회귀 테스트 (PBT 발견): 한 자리 금액은 암호문이 23자라 형식 검사에 걸렸다. "자동차 없음 = 0"이 흔하다
  it("0원·한 자리 금액·상한 금액도 왕복된다", async () => {
    const ring = await createKeyring({ 1: testKey(1) }, 1);
    for (const value of [0, 9, 10, 1_000_000]) {
      await expect(decryptAmount(await encryptAmount(value, ring), ring)).resolves.toBe(value);
    }
  });

  it("키 교체 중: 옛 키 암호문도 읽고, 새로 쓰는 것은 새 키", async () => {
    const old = await createKeyring({ 1: testKey(1) }, 1);
    const oldText = await encryptAmount(100, old);
    const both = await createKeyring({ 1: testKey(1), 2: testKey(2) }, 2);
    await expect(decryptAmount(oldText, both)).resolves.toBe(100);
    expect(cipherVersionOf(await encryptAmount(100, both))).toBe(2);
  });

  it("모르는 버전·위조·형식 오류는 AmountCipherError", async () => {
    const ring = await createKeyring({ 1: testKey(1) }, 1);
    const other = await createKeyring({ 1: testKey(9) }, 1);
    const text = await encryptAmount(450, ring);
    await expect(decryptAmount(text.replace(/^v1/, "v3"), ring)).rejects.toBeInstanceOf(AmountCipherError);
    await expect(decryptAmount(text, other)).rejects.toBeInstanceOf(AmountCipherError);
    await expect(decryptAmount("plain-450", ring)).rejects.toBeInstanceOf(AmountCipherError);
  });

  it("금액 범위 밖·잘못된 키 길이는 거부", async () => {
    const ring = await createKeyring({ 1: testKey(1) }, 1);
    await expect(encryptAmount(-1, ring)).rejects.toBeInstanceOf(AmountCipherError);
    await expect(encryptAmount(1.5, ring)).rejects.toBeInstanceOf(AmountCipherError);
    await expect(createKeyring({ 1: "short" }, 1)).rejects.toBeInstanceOf(AmountCipherError);
    await expect(createKeyring({ 1: testKey(1) }, 2)).rejects.toBeInstanceOf(AmountCipherError);
  });
});

describe("profile-codec", () => {
  it("금액 3개만 암호문, data에는 금액이 없다", async () => {
    const ring = await createKeyring({ 1: testKey(1) }, 1);
    const stored = await encodeProfile(makeProfile(), ring);
    expect(stored.encMonthlyIncome).toMatch(/^v1\./);
    expect(JSON.stringify(stored.data)).not.toMatch(/monthlyIncome|totalAsset|carValue/);
    expect((stored.data as { money: unknown }).money).toEqual({ spouseEarns: false });
    await expect(decodeProfile(stored, ring)).resolves.toEqual(makeProfile());
  });

  it("모르는 금액은 null 그대로", async () => {
    const ring = await createKeyring({ 1: testKey(1) }, 1);
    const p = makeProfile({ money: { monthlyIncome: null, totalAsset: null, carValue: null, spouseEarns: null } });
    const stored = await encodeProfile(p, ring);
    expect([stored.encMonthlyIncome, stored.encTotalAsset, stored.encCarValue]).toEqual([null, null, null]);
    await expect(decodeProfile(stored, ring)).resolves.toEqual(p);
  });

  it("모르는 스키마 버전은 오류", async () => {
    const ring = await createKeyring({ 1: testKey(1) }, 1);
    const stored = { ...(await encodeProfile(makeProfile(), ring)), schemaVersion: 4 };
    await expect(decodeProfile(stored, ring)).rejects.toBeInstanceOf(ProfileCodecError);
  });

  it("버전 1로 저장된 프로필은 옮겨서 읽는다 — 통장 없음 → 모름, 관심 시군구 빈 목록 (BR-U2-C2·C4·C6)", async () => {
    const ring = await createKeyring({ 1: testKey(1) }, 1);
    const v2 = await encodeProfile(makeProfile({ savings: { has: false, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null } }), ring);
    const prefsV1: Record<string, unknown> = { ...(v2.data as { prefs: Record<string, unknown> }).prefs };
    delete prefsV1.regions;
    const savingsV1 = { has: false, kind: null, months: null, paymentCount: null, depositManwon: null };
    const stored = { ...v2, schemaVersion: 1, data: { ...v2.data, savings: savingsV1, prefs: prefsV1 } as unknown as typeof v2.data };
    const p = await decodeProfile(stored, ring);
    expect(p.schemaVersion).toBe(3);
    expect(p.savings).toEqual({ has: null, owner: null, kind: null, months: null, paymentCount: null, depositManwon: null });
    expect(p.prefs.regions).toEqual([]);
    expect(p.money.monthlyIncome).toBe(makeProfile().money.monthlyIncome);
  });
});

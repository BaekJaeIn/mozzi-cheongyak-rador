// 예시 기반 테스트 — 기기 토큰 (BR-U1-01, 02, 07)
import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  generateDeviceId,
  generateToken,
  hashToken,
  isValidDeviceId,
  isValidToken,
  verifyToken,
} from "../token.ts";

describe("token", () => {
  it("SHA-256 해시는 알려진 값과 같다", async () => {
    // echo -n "abc" | sha256sum
    expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("생성한 기기 ID는 UUID v4 소문자 형식이다", () => {
    const id = generateDeviceId();
    expect(isValidDeviceId(id)).toBe(true);
    expect(id).toBe(id.toLowerCase());
  });

  it("생성한 토큰은 43자 base64url이다", () => {
    const token = generateToken();
    expect(token).toHaveLength(43);
    expect(isValidToken(token)).toBe(true);
  });

  it("형식이 틀린 값은 거부한다", () => {
    expect(isValidDeviceId("not-a-uuid")).toBe(false);
    expect(isValidDeviceId("6F9619FF-8B86-4D01-B42D-00CF4FC964FF")).toBe(false); // 대문자
    expect(isValidDeviceId(null)).toBe(false);
    expect(isValidToken("short")).toBe(false);
    expect(isValidToken("a".repeat(43) + "=")).toBe(false);
  });

  it("해시 형식이 틀리면 검증에 실패한다", async () => {
    expect(await verifyToken(generateToken(), "not-a-hash")).toBe(false);
  });

  it("상수 시간 비교는 길이가 다르면 false", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
});

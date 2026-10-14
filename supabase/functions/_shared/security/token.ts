// 기기 ID·비밀 토큰 생성과 검증 (BR-U1-01, 02, 06, 07 / P-S2)
// WebCrypto만 사용하므로 Node 18+, Deno, 브라우저에서 같은 코드가 동작한다.
import { bytesToBase64Url, bytesToHex } from "../encoding/base64url.ts";

export const TOKEN_BYTES = 32;

const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// 32바이트를 패딩 없는 base64url로 바꾸면 항상 43자
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export function generateDeviceId(): string {
  return crypto.randomUUID().toLowerCase();
}

export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_PATTERN.test(value);
}

export function isValidToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** 토큰의 SHA-256 해시(16진수 64자). 서버는 이 값만 저장한다. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

/** 길이가 같은 문자열을 끝까지 비교한다 (내용에 따라 걸리는 시간이 달라지지 않게). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 토큰이 저장된 해시와 맞는지 확인한다 (BR-U1-07). */
export async function verifyToken(token: string, storedHash: string): Promise<boolean> {
  if (!isValidToken(token) || !HASH_PATTERN.test(storedHash)) return false;
  return constantTimeEqual(await hashToken(token), storedHash);
}

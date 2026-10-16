// VAPID — RFC 8292 (서버 신분 확인). ES256 JWT를 만들어 Authorization 헤더로 보낸다.
// 개인 키는 내보낼 수 없는 CryptoKey로만 메모리에 둔다 (P-15). 문자열을 로그·오류에 넣지 않는다.
import { base64UrlToBytes, bytesToBase64Url } from "../encoding/base64url.ts";
import { pointToJwk } from "./encrypt.ts";

export const VAPID_TOKEN_TTL_SECONDS = 12 * 60 * 60;

export interface VapidConfig {
  /** base64url 65바이트 공개 점 */
  publicKey: string;
  /** base64url 32바이트 개인 값 */
  privateKey: string;
  /** "https://…" 또는 "mailto:…" */
  subject: string;
}

export interface VapidSigner {
  publicKey: string;
  /** 푸시 서비스 origin별 Authorization 값 (실행 동안 재사용, P-12) */
  authorization(endpoint: string, nowSeconds: number): Promise<string>;
}

const enc = new TextEncoder();

export function isValidVapidConfig(c: Partial<VapidConfig>): c is VapidConfig {
  try {
    return (
      typeof c.publicKey === "string" &&
      typeof c.privateKey === "string" &&
      typeof c.subject === "string" &&
      base64UrlToBytes(c.publicKey).length === 65 &&
      base64UrlToBytes(c.privateKey).length === 32 &&
      /^(https:\/\/|mailto:)/.test(c.subject)
    );
  } catch {
    return false;
  }
}

export async function createVapidSigner(config: VapidConfig): Promise<VapidSigner> {
  if (!isValidVapidConfig(config)) throw new Error("VAPID 설정이 올바르지 않아요");
  const point = base64UrlToBytes(config.publicKey);
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: config.privateKey, ...pointToJwk(point), ext: false },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const cache = new Map<string, { value: string; exp: number }>();

  return {
    publicKey: config.publicKey,
    async authorization(endpoint, nowSeconds) {
      const aud = new URL(endpoint).origin;
      const hit = cache.get(aud);
      if (hit && hit.exp - nowSeconds > 60 * 60) return hit.value; // 1시간 이상 남았으면 재사용
      const exp = nowSeconds + VAPID_TOKEN_TTL_SECONDS;
      const jwt = await signJwt(key, { aud, exp, sub: config.subject });
      const value = `vapid t=${jwt}, k=${config.publicKey}`;
      cache.set(aud, { value, exp });
      return value;
    },
  };
}

export async function signJwt(key: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  const part = (o: unknown) => bytesToBase64Url(enc.encode(JSON.stringify(o)));
  const input = `${part({ typ: "JWT", alg: "ES256" })}.${part(claims)}`;
  // Web Crypto ECDSA 서명은 r‖s 64바이트 — JWS ES256 형식과 같다
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input)));
  return `${input}.${bytesToBase64Url(sig)}`;
}

/** 새 키 쌍 (scripts/generate-vapid.mjs·테스트용) */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: bytesToBase64Url(raw), privateKey: jwk.d! };
}

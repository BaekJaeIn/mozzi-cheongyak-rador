// 구독 형식 검사 — 알려진 푸시 서비스 주소만 (BR-U6-50~52, P-14·16)
// 서버가 사용자가 보낸 임의 주소로 요청하지 않게 저장 때와 보내기 직전에 같은 검사를 한다.
import { base64UrlToBytes, bytesToHex } from "../encoding/base64url.ts";

export const MAX_ENDPOINT_LENGTH = 2048;

/** 정확히 일치 또는 "."으로 시작하는 접미사 */
export const PUSH_HOSTS: readonly string[] = [
  "fcm.googleapis.com", // Chrome·Android·삼성 인터넷
  ".push.apple.com", // Safari·iPhone (web.push.apple.com)
  ".push.services.mozilla.com", // Firefox
  ".notify.windows.com", // Edge (WNS)
];

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function hostAllowed(host: string): boolean {
  return PUSH_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) && host.length > h.length : host === h));
}

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  if (IPV4.test(host) || host.startsWith("[")) return false;
  return hostAllowed(host);
}

function decodedLength(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || !BASE64URL.test(value)) return null;
  try {
    return base64UrlToBytes(value).length;
  } catch {
    return null;
  }
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type SubscriptionCheck = { ok: true; value: SubscriptionInput } | { ok: false; field: "body" | "endpoint" | "keys" | "p256dh" | "auth" };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 본문 = 브라우저 `PushSubscription.toJSON()` 모양: { endpoint, expirationTime?, keys: { p256dh, auth } }.
 * 그 밖의 키는 받지 않는다 (BR-U6-50).
 */
export function validateSubscription(body: unknown): SubscriptionCheck {
  if (!isObject(body)) return { ok: false, field: "body" };
  const allowed = new Set(["endpoint", "expirationTime", "keys"]);
  if (!Object.keys(body).every((k) => allowed.has(k))) return { ok: false, field: "body" };
  if (body.expirationTime !== undefined && body.expirationTime !== null && typeof body.expirationTime !== "number") {
    return { ok: false, field: "body" };
  }
  if (!isAllowedPushEndpoint(body.endpoint)) return { ok: false, field: "endpoint" };
  const keys = body.keys;
  if (!isObject(keys) || Object.keys(keys).length !== 2) return { ok: false, field: "keys" };
  const p256dh = keys.p256dh;
  const auth = keys.auth;
  if (decodedLength(p256dh) !== 65 || base64UrlToBytes(p256dh as string)[0] !== 0x04) return { ok: false, field: "p256dh" };
  if (decodedLength(auth) !== 16) return { ok: false, field: "auth" };
  return { ok: true, value: { endpoint: body.endpoint as string, keys: { p256dh: p256dh as string, auth: auth as string } } };
}

/** 로그용 — 구독 주소 대신 SHA-256 앞 8자 (P-16) */
export async function endpointHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return bytesToHex(new Uint8Array(digest)).slice(0, 8);
}

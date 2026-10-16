// 웹 푸시 보내기 — 결과 분류·재시도 1번 (BR-U6-40~43, NFR-U6-02·10, P-4·14)
import { decodePushKeys, encryptPayload } from "./encrypt.ts";
import { isAllowedPushEndpoint } from "./endpoint.ts";
import { encodePayload, type PushPayload } from "./payload.ts";
import type { VapidSigner } from "./vapid.ts";

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type SendOutcome =
  | { kind: "sent" }
  | { kind: "gone" } // 404·410 → 구독 삭제
  | { kind: "retryable"; status: number | null } // 5xx·429·네트워크·시간 초과
  | { kind: "rejected"; status: number }; // 400·401·403·413 등, 0 = 허용 안 된 주소

/** fetch와 같은 모양 — 테스트에서 가짜 푸시 서비스로 바꾼다 */
export type PushTransport = (url: string, init: RequestInit) => Promise<Response>;

export interface SendOptions {
  vapid: VapidSigner;
  transport: PushTransport;
  nowSeconds: number;
  /** 초 — 매일 알림 12시간, 시험 10분 (NFR-U6-10) */
  ttl: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  timeoutMs?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const DAILY_TTL_SECONDS = 12 * 60 * 60;
export const TEST_TTL_SECONDS = 10 * 60;
export const SEND_TIMEOUT_MS = 10_000;
export const RETRY_DELAY_MS = 2_000;

export function classifyStatus(status: number): SendOutcome {
  if (status >= 200 && status < 300) return { kind: "sent" };
  if (status === 404 || status === 410) return { kind: "gone" };
  if (status === 429 || status >= 500) return { kind: "retryable", status };
  return { kind: "rejected", status };
}

async function attempt(target: PushTarget, body: Uint8Array, options: SendOptions): Promise<SendOutcome> {
  try {
    const res = await options.transport(target.endpoint, {
      method: "POST",
      headers: {
        authorization: await options.vapid.authorization(target.endpoint, options.nowSeconds),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: String(options.ttl),
        urgency: options.urgency ?? "normal",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? SEND_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => undefined); // 오류 본문은 읽지 않는다 (P-16)
    return classifyStatus(res.status);
  } catch {
    return { kind: "retryable", status: null };
  }
}

export async function sendPush(target: PushTarget, payload: PushPayload, options: SendOptions): Promise<SendOutcome> {
  // 보내기 직전에도 주소를 다시 확인한다 (P-14)
  if (!isAllowedPushEndpoint(target.endpoint)) return { kind: "rejected", status: 0 };
  let body: Uint8Array;
  try {
    body = await encryptPayload(encodePayload(payload), decodePushKeys(target.p256dh, target.auth));
  } catch {
    return { kind: "rejected", status: 0 }; // 저장된 키가 깨짐
  }
  const first = await attempt(target, body, options);
  if (first.kind !== "retryable") return first;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  await sleep(options.retryDelayMs ?? RETRY_DELAY_MS);
  return attempt(target, body, options);
}

export interface Settled {
  delivered: boolean;
  success: string[];
  failed: string[];
  gone: string[];
}

/** 한 기기의 구독별 결과 정리: 하나라도 보냈으면 delivered, 만료는 지울 목록 (BR-U6-40·41, P-6) */
export function settleDevice(results: readonly { endpoint: string; outcome: SendOutcome }[]): Settled {
  const out: Settled = { delivered: false, success: [], failed: [], gone: [] };
  for (const { endpoint, outcome } of results) {
    if (outcome.kind === "sent") out.success.push(endpoint);
    else if (outcome.kind === "gone") out.gone.push(endpoint);
    else out.failed.push(endpoint);
  }
  out.delivered = out.success.length > 0;
  return out;
}

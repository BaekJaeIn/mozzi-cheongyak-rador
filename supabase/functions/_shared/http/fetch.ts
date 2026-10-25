// 수집용 HTTP 도우미 (P-U3-R2 재시도, P-U3-P4 크기 상한, P-U3-S2 URL 가리기)
// 표준 fetch·AbortSignal만 쓰므로 Node(Vitest)와 Deno에서 같이 동작한다.
import { shouldRetry } from "./retry.ts";

export const COLLECT_RETRY_DELAY_MS = 2000;
export const PDF_MAX_BYTES = 20 * 1024 * 1024;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 오류 문구용 URL: origin + pathname만 (쿼리의 API 키 제거) */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number | null,
    url: string,
    detail?: string,
  ) {
    super(`${status === null ? "network" : `HTTP ${status}`} ${safeUrl(url)}${detail ? ` (${detail})` : ""}`);
    this.name = "HttpError";
  }
}

/** U1 판단(네트워크·408·5xx)에 429를 더한다 */
export function shouldRetryCollect(status: number | null): boolean {
  if (status === null) return true;
  return status === 429 || shouldRetry({ kind: "status", status });
}

export interface FetchOptions {
  timeoutMs: number;
  init?: RequestInit;
  fetchImpl?: FetchLike;
  sleep?: Sleep;
  retryDelayMs?: number;
  /** 이 시각(Date.now 기준 ms)까지 — 시도마다 남은 시간으로 시간 제한을 줄이고, 남은 시간이 없으면 다시 시도하지 않는다 (변경 4) */
  deadlineAt?: number;
}

/** 마감까지 이보다 적게 남으면 새 시도를 하지 않는다 */
export const MIN_ATTEMPT_MS = 5_000;

/**
 * 시간 제한 + 1회 재시도. 2xx면 Response를, 아니면 HttpError를 던진다.
 * 재시도는 네트워크 오류·408·429·5xx일 때만, 2초 뒤 한 번 (NFR-U3-06).
 */
export async function fetchWithRetry(url: string, opts: FetchOptions): Promise<Response> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? realSleep;
  let lastError: HttpError | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(opts.retryDelayMs ?? COLLECT_RETRY_DELAY_MS);
    const left = opts.deadlineAt === undefined ? Infinity : opts.deadlineAt - Date.now();
    if (left < MIN_ATTEMPT_MS) {
      lastError ??= new HttpError(null, url, "deadline");
      break;
    }
    let res: Response;
    try {
      res = await fetchImpl(url, { ...opts.init, signal: AbortSignal.timeout(Math.min(opts.timeoutMs, left)) });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      lastError = new HttpError(null, url, timeout ? "timeout" : undefined);
      continue;
    }
    if (res.ok) return res;
    await res.body?.cancel().catch(() => undefined);
    lastError = new HttpError(res.status, url);
    if (!shouldRetryCollect(res.status)) break;
  }
  throw lastError ?? new HttpError(null, url);
}

export class TooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`응답이 ${limit} 바이트를 넘음`);
    this.name = "TooLargeError";
  }
}

/** content-length가 상한을 넘으면 받지 않고, 받는 중에도 넘으면 중단한다 (P-U3-P4) */
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new TooLargeError(maxBytes);
  }
  if (!res.body) return new Uint8Array(0);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new TooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** PDF 시그니처(%PDF-) 확인 — 오류 HTML을 PDF로 착각하지 않게 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

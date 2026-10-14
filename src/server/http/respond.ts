// API 응답 도우미 (BR-U1-20, P-S6, 관측성 requestId)
import "server-only";
import { type ApiErrorCode, apiError } from "@shared/http/errors.ts";

export const REQUEST_ID_HEADER = "x-request-id";

export function newRequestId(): string {
  return crypto.randomUUID();
}

const baseHeaders = (requestId: string): HeadersInit => ({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  [REQUEST_ID_HEADER]: requestId,
});

export function json(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders(requestId) });
}

export function noContent(requestId: string): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", [REQUEST_ID_HEADER]: requestId } });
}

export function errorResponse(code: ApiErrorCode, status: number, requestId: string): Response {
  return json(apiError(code), status, requestId);
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; response: Response };

/** 본문을 최대 크기 안에서 읽고 JSON으로 해석한다. 크면 413, 형식이 틀리면 400. */
export async function readJsonBody(req: Request, maxBytes: number, requestId: string): Promise<BodyResult> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, response: errorResponse("PAYLOAD_TOO_LARGE", 413, requestId) };

  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, response: errorResponse("PAYLOAD_TOO_LARGE", 413, requestId) };
  }
  try {
    return { ok: true, value: text === "" ? null : JSON.parse(text) };
  } catch {
    return { ok: false, response: errorResponse("BAD_REQUEST", 400, requestId) };
  }
}

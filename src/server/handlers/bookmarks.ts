// PUT /api/bookmarks — 관심 공고 ID를 서버 목록으로 통째로 바꾼다 (변경 3 BR-U6-D1·D4·D5)
// 공고 ID만 받는다. 로그에는 개수만
import "server-only";
import type { DeviceContext } from "../auth/route-guard";
import { errorResponse, json } from "../http/respond";

/** 100개 × uuid 36자 + 여유 */
export const BOOKMARKS_MAX_BODY_BYTES = 8 * 1024;
export const MAX_SERVER_BOOKMARKS = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 형식 검사: { ids: uuid[] }, 중복 없음, 100개 이하 */
export function validateBookmarkIds(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  const { ids } = body as Record<string, unknown>;
  if (keys.length !== 1 || !Array.isArray(ids) || ids.length > MAX_SERVER_BOOKMARKS) return null;
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) return null;
  const lower = ids.map((id) => (id as string).toLowerCase());
  return new Set(lower).size === lower.length ? lower : null;
}

export function createBookmarksHandler(replace: (deviceId: string, ids: readonly string[]) => Promise<number>) {
  return async ({ deviceId, requestId, log, body }: DeviceContext): Promise<Response> => {
    const ids = validateBookmarkIds(body);
    if (ids === null) return errorResponse("BAD_REQUEST", 400, requestId);
    const saved = await replace(deviceId, ids); // 없는 공고는 DB가 뺀다
    log.info("bookmarks.saved", { sent: ids.length, saved });
    return json({ saved }, 200, requestId);
  };
}

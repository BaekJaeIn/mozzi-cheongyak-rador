// 관심 공고 ID 서버 동기화 상태 (변경 3 U6 domain-entities §8.5, BR-U6-D1~D3)
// - 별표·해제 → pending → PUT /api/bookmarks { ids }(목록 전체) → synced. 보내기는 U4 ProfileSync 대기열이 맡는다
// - 기록이 없으면(업데이트 뒤 처음) 관심 공고가 있을 때만 한 번 보낸다
import type { KeyValueStorage } from "@/features/device/identity-store";
import { BOOKMARKS_SYNC_KEY, type SyncState } from "@/features/profile/model/storage";
import { loadBookmarks } from "./store";

export interface StoredBookmarkSync {
  version: 1;
  /** 마지막으로 바꾼 시각 — 보내는 중에 바뀌었는지 보는 표시 */
  updatedAt: string;
  sync: SyncState;
}

/** 기록이 없을 때의 표시 (처음 한 번 보내기) */
export const INITIAL_STAMP = "initial";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isSyncState(v: unknown): v is SyncState {
  if (!isObject(v)) return false;
  if (v.state === "synced") return typeof v.at === "string";
  if (v.state === "pending") return typeof v.since === "string" && typeof v.attempts === "number";
  return v.state === "failed" && v.code === "BAD_REQUEST";
}

export function loadBookmarkSync(storage: KeyValueStorage): StoredBookmarkSync | null {
  try {
    const raw = storage.getItem(BOOKMARKS_SYNC_KEY);
    const v: unknown = raw === null ? null : JSON.parse(raw);
    return isObject(v) && v.version === 1 && typeof v.updatedAt === "string" && isSyncState(v.sync) ? (v as unknown as StoredBookmarkSync) : null;
  } catch {
    return null;
  }
}

function save(storage: KeyValueStorage, value: StoredBookmarkSync): void {
  try {
    storage.setItem(BOOKMARKS_SYNC_KEY, JSON.stringify(value));
  } catch {
    // 저장이 막혀도 별표는 그대로 — 다음에 앱을 열 때 다시 보낸다
  }
}

/** 별표·해제 뒤 (BR-U6-D1) */
export function markBookmarksPending(storage: KeyValueStorage, now: Date): void {
  const at = now.toISOString();
  save(storage, { version: 1, updatedAt: at, sync: { state: "pending", since: at, attempts: 0 } });
}

/** 대기열이 보낼 값: 관심 공고 ID 전체(서버가 지워진 공고는 뺀다). 보낼 것이 없으면 null (BR-U6-D3) */
export function loadBookmarkChannel(storage: KeyValueStorage, now: Date): { value: string[]; stamp: string; sync: SyncState } | null {
  const ids = loadBookmarks(storage).map((b) => b.id);
  const rec = loadBookmarkSync(storage);
  if (rec) return { value: ids, stamp: rec.updatedAt, sync: rec.sync };
  if (ids.length === 0) return null;
  return { value: ids, stamp: INITIAL_STAMP, sync: { state: "pending", since: now.toISOString(), attempts: 0 } };
}

export function saveBookmarkSync(storage: KeyValueStorage, sync: SyncState): void {
  const rec = loadBookmarkSync(storage);
  save(storage, { version: 1, updatedAt: rec?.updatedAt ?? INITIAL_STAMP, sync });
}

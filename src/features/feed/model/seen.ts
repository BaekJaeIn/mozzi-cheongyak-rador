// 열어 본 공고 기록 — NEW 배지를 끄는 데 쓴다. 기기에만 (BR-U5-41~43)
import type { KeyValueStorage } from "@/features/device/identity-store";
import { SEEN_KEY } from "@/features/profile/model/storage";

export const SEEN_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
export const SEEN_MAX = 500;

export type SeenRecord = Record<string, string>;

/** 깨졌으면 빈 기록 (BR-U5-43) */
export function loadSeen(storage: KeyValueStorage): SeenRecord {
  try {
    const raw = storage.getItem(SEEN_KEY);
    if (raw === null) return {};
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null || (v as { version?: unknown }).version !== 1) return {};
    const items = (v as { items?: unknown }).items;
    if (typeof items !== "object" || items === null || Array.isArray(items)) return {};
    const out: SeenRecord = {};
    for (const [id, at] of Object.entries(items)) if (typeof at === "string" && !Number.isNaN(Date.parse(at))) out[id] = at;
    return out;
  } catch {
    return {};
  }
}

/** 14일 지난 기록을 지우고, 500개를 넘으면 오래된 것부터 지운다 */
export function pruneSeen(record: SeenRecord, now: Date): SeenRecord {
  const cutoff = now.getTime() - SEEN_KEEP_MS;
  const kept = Object.entries(record)
    .filter(([, at]) => Date.parse(at) >= cutoff)
    .sort(([ia, a], [ib, b]) => (a !== b ? (a > b ? -1 : 1) : ia < ib ? -1 : 1))
    .slice(0, SEEN_MAX);
  return Object.fromEntries(kept);
}

export function markSeen(storage: KeyValueStorage, id: string, now: Date): SeenRecord {
  const next = pruneSeen({ ...loadSeen(storage), [id]: now.toISOString() }, now);
  try {
    storage.setItem(SEEN_KEY, JSON.stringify({ version: 1, items: next }));
  } catch {
    // 기록을 못 남기면 NEW가 남아 있을 뿐이다
  }
  return next;
}

export function seenSet(record: SeenRecord): ReadonlySet<string> {
  return new Set(Object.keys(record));
}

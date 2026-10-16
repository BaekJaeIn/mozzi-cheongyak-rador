// 관심 공고 저장소 — 이 기기에만 (BR-U5-115~125, Q11=A)
import { type IsoDate, isIsoDate } from "@shared/domain/dates.ts";
import { noticeStatus } from "@shared/domain/retention.ts";
import type { KeyValueStorage } from "@/features/device/identity-store";
import type { NoticeSummary } from "@/features/notice/model/api-types";
import { BOOKMARKS_KEY, LocalSaveError } from "@/features/profile/model/storage";

export const MAX_BOOKMARKS = 100;
export const MAX_SNAPSHOT_SUPPLY_TYPES = 3;

export interface BookmarkSnapshot {
  title: string;
  complexName: string | null;
  districts: string[];
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  supplyTypes: string[];
}

export interface Bookmark {
  id: string;
  savedAt: string;
  snapshot: BookmarkSnapshot;
  /** 서버에서 지워짐 (BR-U5-120) */
  gone?: true;
}

export type ToggleResult = "added" | "removed" | "full";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isNullableDate = (v: unknown): v is IsoDate | null => v === null || isIsoDate(v);

function toSnapshot(v: unknown): BookmarkSnapshot | null {
  if (!isObject(v)) return null;
  if (typeof v.title !== "string" || !(v.complexName === null || typeof v.complexName === "string")) return null;
  if (!isStringArray(v.districts) || !isStringArray(v.supplyTypes)) return null;
  if (!isNullableDate(v.applyStart) || !isNullableDate(v.applyEnd)) return null;
  return {
    title: v.title,
    complexName: v.complexName,
    districts: v.districts,
    applyStart: v.applyStart,
    applyEnd: v.applyEnd,
    supplyTypes: v.supplyTypes.slice(0, MAX_SNAPSHOT_SUPPLY_TYPES),
  };
}

function toBookmark(v: unknown): Bookmark | null {
  if (!isObject(v) || typeof v.id !== "string" || v.id.length === 0 || typeof v.savedAt !== "string") return null;
  const snapshot = toSnapshot(v.snapshot);
  if (!snapshot) return null;
  return v.gone === true ? { id: v.id, savedAt: v.savedAt, snapshot, gone: true } : { id: v.id, savedAt: v.savedAt, snapshot };
}

/** 읽을 수 있는 항목만 살린다. 같은 ID는 처음 것만, 100개까지 (BR-U5-124) */
export function loadBookmarks(storage: KeyValueStorage): Bookmark[] {
  let parsed: unknown;
  try {
    const raw = storage.getItem(BOOKMARKS_KEY);
    if (raw === null) return [];
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const items = isObject(parsed) && parsed.version === 1 && Array.isArray(parsed.items) ? parsed.items : [];
  const seen = new Set<string>();
  const out: Bookmark[] = [];
  for (const raw of items) {
    const b = toBookmark(raw);
    if (!b || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
    if (out.length === MAX_BOOKMARKS) break;
  }
  return out;
}

function saveBookmarks(storage: KeyValueStorage, items: readonly Bookmark[]): void {
  try {
    storage.setItem(BOOKMARKS_KEY, JSON.stringify({ version: 1, items }));
  } catch {
    throw new LocalSaveError();
  }
}

export function snapshotOf(input: BookmarkSnapshot): BookmarkSnapshot {
  return { ...input, districts: [...input.districts], supplyTypes: input.supplyTypes.slice(0, MAX_SNAPSHOT_SUPPLY_TYPES) };
}

export function createBookmarkStore(storage: KeyValueStorage) {
  return {
    list: (): Bookmark[] => loadBookmarks(storage),
    has: (id: string): boolean => loadBookmarks(storage).some((b) => b.id === id),

    /** 저장/해제. 가득 차면 저장하지 않는다 (BR-U5-117·118). 기기 저장 실패는 LocalSaveError */
    toggle(id: string, snapshot: BookmarkSnapshot, now: Date): ToggleResult {
      const items = loadBookmarks(storage);
      if (items.some((b) => b.id === id)) {
        saveBookmarks(storage, items.filter((b) => b.id !== id));
        return "removed";
      }
      if (items.length >= MAX_BOOKMARKS) return "full";
      saveBookmarks(storage, [...items, { id, savedAt: now.toISOString(), snapshot: snapshotOf(snapshot) }]);
      return "added";
    },

    remove(id: string): void {
      const items = loadBookmarks(storage);
      if (items.some((b) => b.id === id)) saveBookmarks(storage, items.filter((b) => b.id !== id));
    },

    /** 서버 최신 정보로 화면용 정보를 고치고, 없는 공고는 gone (BR-U5-119·120) */
    refresh(summaries: readonly NoticeSummary[], missing: readonly string[]): Bookmark[] {
      const byId = new Map(summaries.map((s) => [s.id, s]));
      const gone = new Set(missing);
      const items = loadBookmarks(storage).map((b): Bookmark => {
        const s = byId.get(b.id);
        if (s) {
          return {
            id: b.id,
            savedAt: b.savedAt,
            snapshot: snapshotOf({
              title: s.title,
              complexName: s.complexName,
              districts: s.districts,
              applyStart: s.applyStart,
              applyEnd: s.applyEnd,
              supplyTypes: s.supplyTypes,
            }),
          };
        }
        return gone.has(b.id) ? { ...b, gone: true } : b;
      });
      saveBookmarks(storage, items);
      return items;
    },
  };
}

export type BookmarkStore = ReturnType<typeof createBookmarkStore>;

// ---------- 정렬 (BR-U5-121) ----------

function category(b: Bookmark, today: IsoDate): 0 | 1 | 2 {
  if (b.gone) return 2;
  return noticeStatus({ applyStart: b.snapshot.applyStart, applyEnd: b.snapshot.applyEnd }, today) === "closed" ? 1 : 0;
}

export function sortBookmarks(items: readonly Bookmark[], today: IsoDate): Bookmark[] {
  const cmpId = (a: Bookmark, b: Bookmark) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return [...items].sort((a, b) => {
    const ca = category(a, today);
    const cb = category(b, today);
    if (ca !== cb) return ca - cb;
    const ea = a.snapshot.applyEnd;
    const eb = b.snapshot.applyEnd;
    if (ca !== 2 && ea !== eb) {
      if (ea === null) return 1;
      if (eb === null) return -1;
      return ca === 0 ? (ea < eb ? -1 : 1) : ea > eb ? -1 : 1;
    }
    if (a.savedAt !== b.savedAt) return a.savedAt > b.savedAt ? -1 : 1;
    return cmpId(a, b);
  });
}

export function isClosedBookmark(b: Bookmark, today: IsoDate): boolean {
  return !b.gone && category(b, today) === 1;
}

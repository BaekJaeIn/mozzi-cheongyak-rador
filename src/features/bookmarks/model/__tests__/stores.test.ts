// 관심 공고·열어 본 기록·피드 저장본 예시 테스트 (BR-U5-41~55·115~125)
import { describe, expect, it } from "vitest";
import { memoryStorage } from "@/features/profile/model/__tests__/helpers";
import type { FeedItem, FeedResponse } from "@/features/notice/model/api-types";
import { clearFeedCache, loadFeedCache, redrawCachedFeed, saveFeedCache } from "@/features/feed/model/cache";
import { loadSeen, markSeen, pruneSeen, SEEN_MAX } from "@/features/feed/model/seen";
import { LocalSaveError } from "@/features/profile/model/storage";
import { type Bookmark, type BookmarkSnapshot, createBookmarkStore, loadBookmarks, MAX_BOOKMARKS, sortBookmarks } from "../store";

const NOW = new Date("2026-10-20T03:00:00Z");
const TODAY = "2026-10-20";

const snap = (over: Partial<BookmarkSnapshot> = {}): BookmarkSnapshot => ({
  title: "공고",
  complexName: "단지",
  districts: ["하남 교산"],
  applyStart: "2026-10-20",
  applyEnd: "2026-10-23",
  supplyTypes: ["고령자", "신혼부부", "일반", "청년"],
  ...over,
});

describe("BookmarkStore", () => {
  it("저장 → 해제, 공급유형은 3개까지", () => {
    const s = memoryStorage();
    const store = createBookmarkStore(s);
    expect(store.toggle("a", snap(), NOW)).toBe("added");
    expect(store.has("a")).toBe(true);
    expect(store.list()[0]!.snapshot.supplyTypes).toEqual(["고령자", "신혼부부", "일반"]);
    expect(store.toggle("a", snap(), NOW)).toBe("removed");
    expect(store.list()).toEqual([]);
  });

  it("100개가 차면 저장하지 않는다 (BR-U5-118)", () => {
    const store = createBookmarkStore(memoryStorage());
    for (let i = 0; i < MAX_BOOKMARKS; i++) expect(store.toggle(`n${i}`, snap(), NOW)).toBe("added");
    expect(store.toggle("extra", snap(), NOW)).toBe("full");
    expect(store.list()).toHaveLength(MAX_BOOKMARKS);
    expect(store.toggle("n0", snap(), NOW)).toBe("removed"); // 가득 차도 해제는 된다
  });

  it("깨진 항목은 버리고 읽을 수 있는 것만 살린다 (BR-U5-124)", () => {
    const good = { id: "a", savedAt: NOW.toISOString(), snapshot: snap() };
    const s = memoryStorage({
      "mz.bookmarks": JSON.stringify({ version: 1, items: [good, { id: 3 }, { ...good, snapshot: { title: 1 } }, good] }),
    });
    expect(loadBookmarks(s).map((b) => b.id)).toEqual(["a"]);
    expect(loadBookmarks(memoryStorage({ "mz.bookmarks": "{not json" }))).toEqual([]);
    expect(loadBookmarks(memoryStorage({ "mz.bookmarks": JSON.stringify({ version: 2, items: [good] }) }))).toEqual([]);
  });

  it("서버 최신 정보로 고치고, 없는 공고는 gone (BR-U5-119·120)", () => {
    const store = createBookmarkStore(memoryStorage());
    store.toggle("a", snap(), NOW);
    store.toggle("b", snap(), NOW);
    const items = store.refresh(
      [{ id: "a", title: "새 제목", complexName: null, districts: ["남양주 왕숙"], regions: [], applyStart: null, applyEnd: "2026-11-01", status: "upcoming", supplyTypes: ["일반"] }],
      ["b"],
    );
    expect(items[0]).toMatchObject({ id: "a", snapshot: { title: "새 제목", applyEnd: "2026-11-01", supplyTypes: ["일반"] } });
    expect(items[0]!.gone).toBeUndefined();
    expect(items[1]).toMatchObject({ id: "b", gone: true });
  });

  it("기기 저장 실패는 LocalSaveError", () => {
    const s = memoryStorage();
    s.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(() => createBookmarkStore(s).toggle("a", snap(), NOW)).toThrow(LocalSaveError);
  });

  it("정렬: 마감 가까운 순 → 마감일 없음 → 마감(최근 순) → 볼 수 없음 (BR-U5-121)", () => {
    const b = (id: string, over: Partial<BookmarkSnapshot>, extra: Partial<Bookmark> = {}): Bookmark => ({
      id,
      savedAt: "2026-10-01T00:00:00Z",
      snapshot: snap(over),
      ...extra,
    });
    const sorted = sortBookmarks(
      [
        b("gone", {}, { gone: true }),
        b("closed-old", { applyStart: "2026-09-01", applyEnd: "2026-09-05" }),
        b("no-end", { applyStart: "2026-10-27", applyEnd: null }),
        b("closed-new", { applyStart: "2026-10-01", applyEnd: "2026-10-10" }),
        b("soon", { applyEnd: "2026-10-21" }),
        b("later", { applyEnd: "2026-10-29" }),
      ],
      TODAY,
    );
    expect(sorted.map((x) => x.id)).toEqual(["soon", "later", "no-end", "closed-new", "closed-old", "gone"]);
  });
});

describe("열어 본 기록 (BR-U5-41~43)", () => {
  it("기록하고 14일 지난 것은 지운다", () => {
    const s = memoryStorage({
      "mz.seen": JSON.stringify({ version: 1, items: { old: "2026-10-01T00:00:00Z", recent: "2026-10-15T00:00:00Z" } }),
    });
    const record = markSeen(s, "new", NOW);
    expect(Object.keys(record).sort()).toEqual(["new", "recent"]);
    expect(loadSeen(s)).toEqual(record);
  });

  it("500개를 넘으면 오래된 것부터 지운다", () => {
    const record: Record<string, string> = {};
    for (let i = 0; i < SEEN_MAX + 20; i++) record[`n${i}`] = new Date(NOW.getTime() - i * 1000).toISOString();
    const pruned = pruneSeen(record, NOW);
    expect(Object.keys(pruned)).toHaveLength(SEEN_MAX);
    expect(pruned.n0).toBeDefined();
    expect(pruned[`n${SEEN_MAX + 19}`]).toBeUndefined();
  });

  it("깨졌으면 빈 기록", () => {
    expect(loadSeen(memoryStorage({ "mz.seen": "[]" }))).toEqual({});
    expect(loadSeen(memoryStorage({ "mz.seen": "x" }))).toEqual({});
  });
});

describe("피드 저장본 (BR-U5-50~55)", () => {
  const item = (id: string, applyStart: string | null, applyEnd: string | null, status: "open" | "upcoming"): FeedItem => ({
    id,
    title: id,
    complexName: null,
    districts: [{ id: "gyosan", name: "하남 교산" }],
    regions: [],
    tenure: "rent",
    applyStart,
    applyEnd,
    status,
    verdict: "eligible",
    score: 2,
    supplyTypes: [{ code: "senior", plain: "고령자" }],
    firstSeenAt: "2026-10-18T00:00:00Z",
  });
  const response: FeedResponse = {
    state: "ready",
    today: "2026-10-18",
    generatedAt: "2026-10-18T00:00:00Z",
    items: [item("a", "2026-10-15", "2026-10-19", "open"), item("b", "2026-10-20", "2026-10-22", "upcoming"), item("c", null, null, "upcoming")],
  };

  it("저장 → 읽기, no_profile은 저장하지 않는다", () => {
    const s = memoryStorage();
    saveFeedCache(s, response, NOW);
    expect(loadFeedCache(s)).toEqual({ savedAt: NOW.toISOString(), response });
    clearFeedCache(s);
    saveFeedCache(s, { ...response, state: "no_profile", items: [] }, NOW);
    expect(loadFeedCache(s)).toBeNull();
  });

  it("형식이 깨졌으면 버린다", () => {
    const bad = { version: 1, savedAt: "x", response: { ...response, items: [{ id: "a" }] } };
    expect(loadFeedCache(memoryStorage({ "mz.feed": JSON.stringify(bad) }))).toBeNull();
    expect(loadFeedCache(memoryStorage({ "mz.feed": JSON.stringify({ ...bad, version: 2 }) }))).toBeNull();
  });

  it("다시 그릴 때 마감된 것은 빼고 상태를 고친다, 순서는 그대로", () => {
    const out = redrawCachedFeed(response.items, TODAY);
    expect(out.map((i) => [i.id, i.status])).toEqual([
      ["b", "open"],
      ["c", "upcoming"],
    ]);
  });
});

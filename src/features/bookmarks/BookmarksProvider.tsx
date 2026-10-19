"use client";

// 관심 공고 상태 — 피드·상세·관심 공고 화면이 같은 목록을 본다 (frontend-components §3, BR-U5-115~124)
// - 기기(localStorage)에만 저장. 다른 탭에서 바꾸면 storage 이벤트로 다시 읽는다
// - 모두 지우기(U4) 뒤에는 프로필 상태가 바뀌므로 다시 읽는다
// - 짧은 안내("저장했어요")는 role="status" 한 곳에서 읽어 준다
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { NoticeSummary } from "@/features/notice/model/api-types";
import { useProfile } from "@/features/profile/ProfileProvider";
import { BOOKMARKS_KEY, LocalSaveError } from "@/features/profile/model/storage";
import { type Bookmark, type BookmarkSnapshot, createBookmarkStore, type ToggleResult } from "./model/store";

const TOAST_MS = 3000;

export const TOAST_TEXT = {
  added: "저장했어요",
  removed: "관심 공고에서 뺐어요",
  full: "관심 공고는 100개까지 저장할 수 있어요. 마감된 공고를 지워 주세요",
  deleted: "지웠어요",
  saveFailed: "이 휴대폰에 저장하지 못했어요",
} as const;

interface BookmarksValue {
  loaded: boolean;
  items: Bookmark[];
  has(id: string): boolean;
  toggle(id: string, snapshot: BookmarkSnapshot): ToggleResult | "failed";
  remove(id: string): void;
  refresh(summaries: readonly NoticeSummary[], missing: readonly string[]): void;
  announce(message: string): void;
}

const BookmarksContext = createContext<BookmarksValue | null>(null);

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const { stored } = useProfile();
  const [items, setItems] = useState<Bookmark[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const store = useCallback(() => createBookmarkStore(window.localStorage), []);
  const reload = useCallback(() => {
    setItems(store().list());
    setLoaded(true);
  }, [store]);

  useEffect(() => {
    // localStorage를 읽는 효과 — 프로필이 바뀌면(모두 지우기 포함) 다시 읽는다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload, stored]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === BOOKMARKS_KEY) reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const announce = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  const value = useMemo<BookmarksValue>(
    () => ({
      loaded,
      items,
      has: (id) => items.some((b) => b.id === id),
      toggle(id, snapshot) {
        try {
          const result = store().toggle(id, snapshot, new Date());
          reload();
          announce(TOAST_TEXT[result]);
          return result;
        } catch (error) {
          if (!(error instanceof LocalSaveError)) throw error;
          announce(TOAST_TEXT.saveFailed);
          return "failed";
        }
      },
      remove(id) {
        try {
          store().remove(id);
          reload();
          announce(TOAST_TEXT.deleted);
        } catch {
          announce(TOAST_TEXT.saveFailed);
        }
      },
      refresh(summaries, missing) {
        try {
          setItems(store().refresh(summaries, missing, stored?.profile.prefs.regions ?? []));
        } catch {
          // 고친 정보를 저장하지 못해도 화면은 저장된 정보로 보인다
        }
      },
      announce,
    }),
    [loaded, items, store, reload, announce, stored],
  );

  return (
    <BookmarksContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-20 flex justify-center px-4">
        <p role="status" className={toast ? "rounded-full bg-ink/90 px-5 py-3 text-body text-surface shadow-card" : "sr-only"}>
          {toast}
        </p>
      </div>
    </BookmarksContext.Provider>
  );
}

export function useBookmarks(): BookmarksValue {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error("BookmarksProvider 안에서만 쓸 수 있어요");
  return ctx;
}

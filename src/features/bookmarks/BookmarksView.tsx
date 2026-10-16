"use client";

// 관심 공고 (US-17, business-logic-model §6, BR-U5-115~125)
// 저장된 정보로 먼저 그리고, 서버 최신 정보로 고친다. 실패해도 저장된 정보 그대로
import { toKstDate } from "@shared/domain/dates.ts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { getApiClient } from "@/features/device/api-client";
import type { NoticeSummariesResponse } from "@/features/notice/model/api-types";
import { periodLabel } from "@/features/notice/model/display";
import { DdayBadge } from "@/features/notice/ui/badges";
import { listWithMore } from "@/features/notice/ui/format";
import { useProfile } from "@/features/profile/ProfileProvider";
import { useBookmarks } from "./BookmarksProvider";
import { type Bookmark, isClosedBookmark, MAX_BOOKMARKS, sortBookmarks } from "./model/store";

export const BOOKMARKS_TEXT = {
  empty: "별 버튼을 누르면 여기에 모아 볼 수 있어요",
  gone: "더 이상 볼 수 없는 공고",
  closed: "마감",
} as const;

export function BookmarksView() {
  const profile = useProfile();
  const router = useRouter();
  const { loaded, items, refresh } = useBookmarks();
  const refreshed = useRef(false);

  useEffect(() => {
    if (profile.loaded && !profile.stored) router.replace("/"); // 프로필이 없으면 처음 실행 안내로 (U4 규칙)
  }, [profile.loaded, profile.stored, router]);

  useEffect(() => {
    if (!loaded || refreshed.current || items.length === 0) return;
    refreshed.current = true;
    const ids = items.slice(0, MAX_BOOKMARKS).map((b) => b.id);
    void getApiClient()
      .request<NoticeSummariesResponse>(`/api/notices?ids=${ids.map(encodeURIComponent).join(",")}`)
      .then((r) => {
        if (r.ok) refresh(r.data.items, r.data.missing);
      });
  }, [loaded, items, refresh]);

  if (!loaded || !profile.loaded) {
    return (
      <p role="status" className="py-8 text-center text-body text-muted">
        준비하고 있어요…
      </p>
    );
  }

  const today = toKstDate(new Date());
  const sorted = sortBookmarks(items, today);
  return (
    <section className="flex flex-col gap-4" aria-labelledby="bookmarks-title">
      <div className="flex items-baseline justify-between gap-2">
        <h1 id="bookmarks-title" className="text-heading font-bold">
          관심 공고
        </h1>
        <p className="text-body text-muted">{items.length}개</p>
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-xl bg-surface p-6 text-body">{BOOKMARKS_TEXT.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((b) => (
            <li key={b.id}>
              <BookmarkItem bookmark={b} today={today} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BookmarkItem({ bookmark, today }: { bookmark: Bookmark; today: string }) {
  const { remove } = useBookmarks();
  const s = bookmark.snapshot;
  const name = s.complexName ?? s.title;
  const closed = isClosedBookmark(bookmark, today);
  const body = (
    <>
      <span className="flex flex-wrap items-center gap-2">
        {bookmark.gone ? (
          <span className="text-caption font-bold text-muted">{BOOKMARKS_TEXT.gone}</span>
        ) : closed ? (
          <span className="inline-flex min-h-8 items-center rounded-full border-2 border-ink px-3 text-caption font-bold">{BOOKMARKS_TEXT.closed}</span>
        ) : (
          <DdayBadge applyStart={s.applyStart} applyEnd={s.applyEnd} today={today} />
        )}
      </span>
      <span className="text-title font-bold text-ink">{name}</span>
      {s.districts.length > 0 && <span className="text-body text-muted">{listWithMore(s.districts, 2, "")}</span>}
      {s.supplyTypes.length > 0 && <span className="text-body">{listWithMore(s.supplyTypes, 2)}</span>}
      <span className="text-caption text-muted">접수 {periodLabel(s.applyStart, s.applyEnd, today)}</span>
    </>
  );
  return (
    <article className={`flex items-start gap-2 rounded-xl border-2 border-line p-4 ${closed || bookmark.gone ? "bg-canvas" : "bg-surface"}`}>
      {bookmark.gone ? (
        <div className="flex flex-1 flex-col gap-2">{body}</div>
      ) : (
        <Link href={`/notice/${bookmark.id}`} className="flex min-h-touch flex-1 flex-col gap-2">
          {body}
        </Link>
      )}
      <button
        type="button"
        onClick={() => remove(bookmark.id)}
        aria-label={`${name} 지우기`}
        className="min-h-touch shrink-0 rounded-xl border-2 border-line bg-surface px-3 text-body font-bold text-ink"
      >
        지우기
      </button>
    </article>
  );
}

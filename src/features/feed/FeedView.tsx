"use client";

// 맞춤 공고 피드 (US-12, business-logic-model §1, BR-U5-20~25·50~65)
// - 저장본이 있으면 먼저 그리고 새 응답을 받으면 바꾼다 (NFR-4.1)
// - 서버에 프로필이 없으면(no_profile) 동기화를 한 번 보낸 뒤 다시 받는다
import { toKstDate } from "@shared/domain/dates.ts";
import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ErrorMessage } from "@/features/app-chrome/ErrorMessage";
import { BookmarkButton } from "@/features/bookmarks/BookmarkButton";
import { getApiClient } from "@/features/device/api-client";
import type { FeedItem, FeedResponse } from "@/features/notice/model/api-types";
import { isNew, periodLabel } from "@/features/notice/model/display";
import { DdayBadge, NewBadge, VerdictBadge } from "@/features/notice/ui/badges";
import { feedItemSnapshot, kstTimeLabel, listWithMore } from "@/features/notice/ui/format";
import { useProfile } from "@/features/profile/ProfileProvider";
import { loadFeedCache, redrawCachedFeed, saveFeedCache } from "./model/cache";
import { loadSeen, seenSet } from "./model/seen";

export const FEED_TEXT = {
  loading: "공고를 불러오고 있어요…",
  refreshing: "새 공고를 확인하고 있어요",
  empty: "지금은 맞는 공고가 없어요. 새 공고가 나오면 알려 드릴게요",
  outdated: "최근 바꾼 내 정보가 아직 반영되지 않았어요. 잠시 뒤 다시 확인해 주세요",
  noProfile: "내 정보를 아직 보내지 못해 공고를 고르지 못했어요",
  offline: (at: string) => `인터넷 연결을 확인해 주세요. ${at}에 확인한 목록이에요`,
} as const;

type State =
  | { phase: "loading" }
  | { phase: "shown"; response: FeedResponse; today: string; source: "cache" | "server"; refreshing: boolean; savedAt: string | null; failed: boolean }
  | { phase: "no_profile" }
  | { phase: "error"; message: string };

type Action =
  | { type: "cache"; response: FeedResponse; savedAt: string; today: string }
  | { type: "fetching" }
  | { type: "server"; response: FeedResponse }
  | { type: "no_profile" }
  | { type: "failed"; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "cache":
      return { phase: "shown", response: action.response, today: action.today, source: "cache", refreshing: true, savedAt: action.savedAt, failed: false };
    case "fetching":
      return state.phase === "shown" ? { ...state, refreshing: true, failed: false } : state.phase === "loading" ? state : { phase: "loading" };
    case "server":
      return { phase: "shown", response: action.response, today: action.response.today, source: "server", refreshing: false, savedAt: null, failed: false };
    case "no_profile":
      return { phase: "no_profile" };
    case "failed":
      return state.phase === "shown" ? { ...state, refreshing: false, failed: true } : { phase: "error", message: action.message };
  }
}

export function FeedView() {
  const { resendAll } = useProfile();
  const [state, dispatch] = useReducer(reducer, { phase: "loading" });
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const triedSync = useRef(false);

  const load = useCallback(async () => {
    dispatch({ type: "fetching" });
    const client = getApiClient();
    let result = await client.request<FeedResponse>("/api/feed");
    if (result.ok && result.data.state === "no_profile" && !triedSync.current) {
      triedSync.current = true; // 1번만 (BR-U5-64)
      await resendAll();
      result = await client.request<FeedResponse>("/api/feed");
    }
    if (!result.ok) return dispatch({ type: "failed", message: result.error.message });
    if (result.data.state === "no_profile") return dispatch({ type: "no_profile" });
    saveFeedCache(window.localStorage, result.data, new Date());
    dispatch({ type: "server", response: result.data });
  }, [resendAll]);

  useEffect(() => {
    // 기기 저장본·열어 본 기록을 읽고(외부 저장소) 서버에서 받아 온다
    const storage = window.localStorage;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(seenSet(loadSeen(storage)));
    const cache = loadFeedCache(storage);
    if (cache) {
      const today = toKstDate(new Date());
      dispatch({ type: "cache", savedAt: cache.savedAt, today, response: { ...cache.response, items: redrawCachedFeed(cache.response.items, today) } });
    }
    void load();
  }, [load]);

  if (state.phase === "loading") {
    return (
      <p role="status" className="py-8 text-center text-body text-muted">
        {FEED_TEXT.loading}
      </p>
    );
  }
  if (state.phase === "error") return <ErrorMessage message={state.message} action={{ label: "다시 시도", onClick: () => void load() }} />;
  if (state.phase === "no_profile") {
    const retry = () => {
      triedSync.current = false;
      void load();
    };
    return <ErrorMessage message={FEED_TEXT.noProfile} action={{ label: "다시 시도", onClick: retry }} />;
  }

  const { response, today } = state;
  const now = new Date();
  return (
    <section className="flex flex-col gap-4" aria-labelledby="feed-title">
      <div className="flex items-baseline justify-between gap-2">
        <h1 id="feed-title" className="text-heading font-bold">
          맞춤 공고
        </h1>
        <p className="text-body text-muted">{response.items.length}건</p>
      </div>

      <div role="status" className="flex flex-col gap-3">
        {state.refreshing && <p className="text-caption text-muted">{FEED_TEXT.refreshing}</p>}
        {state.failed && state.savedAt && (
          <ErrorMessage message={FEED_TEXT.offline(kstTimeLabel(state.savedAt))} action={{ label: "다시 시도", onClick: () => void load() }} />
        )}
        {!state.refreshing && response.state === "outdated" && (
          <ErrorMessage message={FEED_TEXT.outdated} action={{ label: "다시 시도", onClick: () => void load() }} />
        )}
      </div>

      {response.items.length === 0 ? (
        <p className="rounded-xl bg-surface p-6 text-body">{FEED_TEXT.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {response.items.map((item) => (
            <li key={item.id}>
              <NoticeCard item={item} today={today} isNew={isNew(item.id, item.firstSeenAt, now, seen)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NoticeCard({ item, today, isNew: fresh }: { item: FeedItem; today: string; isNew: boolean }) {
  const name = item.complexName ?? item.title;
  return (
    <article className="flex items-start gap-2 rounded-xl border-2 border-line bg-surface p-4">
      <Link href={`/notice/${item.id}`} className="flex min-h-touch flex-1 flex-col gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={item.verdict} />
          {fresh && <NewBadge />}
          <DdayBadge applyStart={item.applyStart} applyEnd={item.applyEnd} today={today} />
        </span>
        <span className="text-title font-bold text-ink">{name}</span>
        {item.districts.length > 0 && <span className="text-body text-muted">{listWithMore(item.districts.map((d) => d.name), 2, "")}</span>}
        {item.supplyTypes.length > 0 && <span className="text-body">{listWithMore(item.supplyTypes.map((s) => s.plain), 2)}</span>}
        <span className="text-caption text-muted">접수 {periodLabel(item.applyStart, item.applyEnd, today)}</span>
      </Link>
      <BookmarkButton id={item.id} snapshot={feedItemSnapshot(item)} />
    </article>
  );
}

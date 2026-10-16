// 피드 저장본 — 먼저 그리고 새로 받으면 바꾼다 (BR-U5-50~55, Q6=A)
// 공고 정보와 판정 결과(충족·확인 필요)·점수만 담는다. 내 금액·프로필은 없다.
import { type IsoDate, isIsoDate } from "@shared/domain/dates.ts";
import { noticeStatus } from "@shared/domain/retention.ts";
import type { KeyValueStorage } from "@/features/device/identity-store";
import type { FeedItem, FeedResponse } from "@/features/notice/model/api-types";
import { FEED_CACHE_KEY } from "@/features/profile/model/storage";

export interface FeedCache {
  savedAt: string;
  response: FeedResponse;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNullableDate = (v: unknown) => v === null || isIsoDate(v);

function isFeedItem(v: unknown): v is FeedItem {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    (v.complexName === null || typeof v.complexName === "string") &&
    Array.isArray(v.districts) &&
    v.districts.every((d) => isObject(d) && typeof d.id === "string" && typeof d.name === "string") &&
    (v.tenure === "sale" || v.tenure === "rent") &&
    isNullableDate(v.applyStart) &&
    isNullableDate(v.applyEnd) &&
    (v.status === "open" || v.status === "upcoming") &&
    (v.verdict === "eligible" || v.verdict === "unknown") &&
    typeof v.score === "number" &&
    Array.isArray(v.supplyTypes) &&
    v.supplyTypes.every((s) => isObject(s) && typeof s.code === "string" && typeof s.plain === "string") &&
    typeof v.firstSeenAt === "string"
  );
}

/** 형식이 깨졌거나 버전이 다르면 null (BR-U5-55) */
export function loadFeedCache(storage: KeyValueStorage): FeedCache | null {
  try {
    const raw = storage.getItem(FEED_CACHE_KEY);
    if (raw === null) return null;
    const v: unknown = JSON.parse(raw);
    if (!isObject(v) || v.version !== 1 || typeof v.savedAt !== "string" || !isObject(v.response)) return null;
    const r = v.response;
    if ((r.state !== "ready" && r.state !== "outdated") || !isIsoDate(r.today) || typeof r.generatedAt !== "string") return null;
    if (!Array.isArray(r.items) || !r.items.every(isFeedItem)) return null;
    return { savedAt: v.savedAt, response: r as unknown as FeedResponse };
  } catch {
    return null;
  }
}

/** ready·outdated만 저장한다 (BR-U5-50). 저장 실패는 무시 — 다음에 받아 오면 된다 */
export function saveFeedCache(storage: KeyValueStorage, response: FeedResponse, now: Date): void {
  if (response.state === "no_profile") return;
  try {
    storage.setItem(FEED_CACHE_KEY, JSON.stringify({ version: 1, savedAt: now.toISOString(), response }));
  } catch {
    // 용량 부족 등
  }
}

export function clearFeedCache(storage: KeyValueStorage): void {
  try {
    storage.removeItem(FEED_CACHE_KEY);
  } catch {
    // 무시
  }
}

/** 기기의 오늘로 상태를 다시 계산하고 마감된 것은 뺀다. 순서는 그대로 (BR-U5-52) */
export function redrawCachedFeed(items: readonly FeedItem[], today: IsoDate): FeedItem[] {
  const out: FeedItem[] = [];
  for (const item of items) {
    const status = noticeStatus({ applyStart: item.applyStart, applyEnd: item.applyEnd }, today);
    if (status === "closed") continue;
    out.push(status === item.status ? item : { ...item, status });
  }
  return out;
}

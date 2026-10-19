// 화면 표기 도우미 — 목록 줄이기, 시각 표기
import { placeNames } from "@shared/feed/place.ts";
import type { BookmarkSnapshot } from "@/features/bookmarks/model/store";
import type { FeedItem } from "../model/api-types";

/** ["a","b","c"] → "a · b 외 1개" (BR-U5-22) */
export function listWithMore(items: readonly string[], max: number, unit = "개"): string {
  if (items.length <= max) return items.join(" · ");
  return `${items.slice(0, max).join(" · ")} 외 ${items.length - max}${unit}`;
}

const KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "10월 20일 오전 9:05" */
export function kstTimeLabel(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : KST_TIME.format(new Date(t));
}

export function feedItemSnapshot(item: FeedItem): BookmarkSnapshot {
  return {
    title: item.title,
    complexName: item.complexName,
    districts: placeNames(item.districts.map((d) => d.name), item.regions), // 위치 이름 (지구 또는 지역, 변경 2)
    applyStart: item.applyStart,
    applyEnd: item.applyEnd,
    supplyTypes: item.supplyTypes.map((s) => s.plain),
  };
}

// 발송 계획 — 피드와 같은 노출 규칙에서 이미 알린 공고를 뺀다 (BR-U6-03·05·06·10, P-U6-1)
// 변경 3: 마감 임박 관심 공고를 함께 싣는다 (BR-U6-D10·D20·D21)
import { addDays, type IsoDate } from "../domain/dates.ts";
import { buildFeed, type FeedRow } from "../feed/visible.ts";

export interface PlannedNotice {
  id: string;
  /** 단지명, 없으면 공고명 */
  name: string;
  verdict: "eligible" | "unknown";
}

/** 마감 임박 관심 공고 (변경 3) */
export interface DeadlineNotice {
  id: string;
  /** 단지명, 없으면 공고명 */
  name: string;
}

export interface DispatchItem {
  deviceId: string;
  /** 피드 정렬 순서 */
  notices: PlannedNotice[];
  counts: { eligible: number; unknown: number };
  /** 마감 임박 (변경 3). 비어 있으면 알림은 변경 3 전과 같다 */
  deadlines: DeadlineNotice[];
}

const NO_LABELS = new Map<string, { plain: string; formal: string }>();

/** 지금 이 기기의 피드에 보이는 공고 ID (기준선 BR-U6-10에도 쓴다) */
export function visibleNoticeIds(rows: readonly FeedRow[], today: IsoDate): string[] {
  return buildFeed(rows, today, NO_LABELS, []).map((i) => i.id);
}

/** 새 공고도 마감 임박도 없으면 null (BR-U6-05, 변경 3 BR-U6-D20) */
export function planDevice(
  deviceId: string,
  rows: readonly FeedRow[],
  notified: ReadonlySet<string>,
  today: IsoDate,
  deadlines: readonly DeadlineNotice[] = [],
): DispatchItem | null {
  const notices = buildFeed(rows, today, NO_LABELS, [])
    .filter((i) => !notified.has(i.id))
    .map((i): PlannedNotice => ({ id: i.id, name: i.complexName ?? i.title, verdict: i.verdict }));
  if (notices.length === 0 && deadlines.length === 0) return null;
  const eligible = notices.filter((n) => n.verdict === "eligible").length;
  return { deviceId, notices, counts: { eligible, unknown: notices.length - eligible }, deadlines: [...deadlines] };
}

export interface BookmarkedNotice {
  id: string;
  title: string;
  complexName: string | null;
  applyEnd: IsoDate | null;
}

/**
 * 마감 임박 고르기 (BR-U6-D10~D12) — DB dispatch_deadlines와 같은 규칙 (테스트 대조용 순수 함수).
 * 관심 공고 ∩ 마감 = 내일 − 마감 알림 기록, 스위치 끄면 빈 목록. 이름 순 → ID 순
 */
export function deadlineNotices(bookmarks: readonly BookmarkedNotice[], recorded: ReadonlySet<string>, today: IsoDate, enabled = true): DeadlineNotice[] {
  if (!enabled) return [];
  const tomorrow = addDays(today, 1);
  return bookmarks
    .filter((b) => b.applyEnd === tomorrow && !recorded.has(b.id))
    .map((b) => ({ id: b.id, name: b.complexName ?? b.title }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

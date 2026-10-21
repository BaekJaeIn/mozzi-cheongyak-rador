// 변경 3 전 사본 (P-U6-D1 비교용) — 고치지 말 것
// 발송 계획 — 피드와 같은 노출 규칙에서 이미 알린 공고를 뺀다 (BR-U6-03·05·06·10, P-U6-1)
import type { IsoDate } from "../../../domain/dates.ts";
import { buildFeed, type FeedRow } from "../../../feed/visible.ts";

export interface PlannedNotice {
  id: string;
  /** 단지명, 없으면 공고명 */
  name: string;
  verdict: "eligible" | "unknown";
}

export interface DispatchItem {
  deviceId: string;
  /** 피드 정렬 순서 */
  notices: PlannedNotice[];
  counts: { eligible: number; unknown: number };
}

const NO_LABELS = new Map<string, { plain: string; formal: string }>();

/** 지금 이 기기의 피드에 보이는 공고 ID (기준선 BR-U6-10에도 쓴다) */
export function visibleNoticeIds(rows: readonly FeedRow[], today: IsoDate): string[] {
  return buildFeed(rows, today, NO_LABELS, []).map((i) => i.id);
}

/** 알릴 공고가 없으면 null (BR-U6-05) */
export function planDevice(
  deviceId: string,
  rows: readonly FeedRow[],
  notified: ReadonlySet<string>,
  today: IsoDate,
): DispatchItem | null {
  const notices = buildFeed(rows, today, NO_LABELS, [])
    .filter((i) => !notified.has(i.id))
    .map((i): PlannedNotice => ({ id: i.id, name: i.complexName ?? i.title, verdict: i.verdict }));
  if (notices.length === 0) return null;
  const eligible = notices.filter((n) => n.verdict === "eligible").length;
  return { deviceId, notices, counts: { eligible, unknown: notices.length - eligible } };
}

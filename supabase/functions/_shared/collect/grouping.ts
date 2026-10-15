// 대표 공고 묶기 (BR-U3-31~34, U1 Q1=A, U3 Q3=A)
import type { CollectSource, NoticeGroup, NormalizedNotice, Schedule } from "./types.ts";
import { SCHEDULE_KEYS } from "./types.ts";

/** 공급 기관 원문 > 청약홈 (BR-U3-33) */
const SOURCE_PRIORITY: Record<CollectSource, number> = { lh_rental: 0, gh: 0, applyhome: 1 };

export function dedupKeyOf(n: Pick<NormalizedNotice, "source" | "sourceNoticeNo" | "districtIds" | "blockKey" | "schedule">): string {
  if (n.blockKey && n.districtIds.length > 0 && n.schedule.announcedAt) {
    return `${[...n.districtIds].sort().join("+")}|${n.blockKey}|${n.schedule.announcedAt}`;
  }
  return `${n.source}:${n.sourceNoticeNo}`;
}

function compareMembers(a: NormalizedNotice, b: NormalizedNotice): number {
  return (
    SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source] ||
    (a.sourceNoticeNo < b.sourceNoticeNo ? -1 : a.sourceNoticeNo > b.sourceNoticeNo ? 1 : 0) ||
    (a.source < b.source ? -1 : a.source > b.source ? 1 : 0)
  );
}

/** 해시가 같아도 순서와 무관하게 고르기 위한 비교 키 (raw 제외 전체 필드) */
function selectionKey(n: NormalizedNotice): string {
  // raw는 undefined로 바꿔 JSON에서 빠지게 한다
  return `${n.contentHash}|${JSON.stringify({ ...n, raw: undefined })}`;
}

/**
 * 같은 (소스, 번호)가 두 번 들어오면 하나만 남긴다 (입력 순서 무관).
 * PBT가 찾은 회귀: 처음에는 해시만 비교해, 해시가 같고 해시 밖 필드(단지명·시군구 등)가 다르면 먼저 온 쪽이 남았다.
 */
function dedupeSameSource(notices: readonly NormalizedNotice[]): NormalizedNotice[] {
  const byId = new Map<string, NormalizedNotice>();
  for (const n of notices) {
    const id = `${n.source}:${n.sourceNoticeNo}`;
    const prev = byId.get(id);
    if (!prev || selectionKey(n) < selectionKey(prev)) byId.set(id, n);
  }
  return [...byId.values()];
}

/** 입력 순서와 무관한 묶음 결과: 묶음은 키 순, 구성원은 대표 우선순위 순 */
export function groupNotices(notices: readonly NormalizedNotice[]): NoticeGroup[] {
  const groups = new Map<string, NormalizedNotice[]>();
  for (const n of dedupeSameSource(notices)) {
    const key = dedupKeyOf(n);
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dedupKey, members]) => ({ dedupKey, members: members.sort(compareMembers) }));
}

/** 대표의 일정을 쓰되, 빈 일정은 다른 원천에서 채운다 (BR-U3-33) */
export function mergedSchedule(group: NoticeGroup): Schedule {
  const out = { ...group.members[0]!.schedule };
  for (const key of SCHEDULE_KEYS) {
    if (out[key] !== null) continue;
    out[key] = group.members.find((m) => m.schedule[key] !== null)?.schedule[key] ?? null;
  }
  return out;
}

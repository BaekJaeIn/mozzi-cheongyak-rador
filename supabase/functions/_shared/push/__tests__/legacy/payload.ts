// 변경 3 전 사본 (P-U6-D1 비교용) — 고치지 말 것
// 알림 내용 — 문구·이동 주소·태그 (BR-U6-30~36·65). 공고 이름과 건수만 담는다 (NFR-U6-19)
import type { IsoDate } from "../../../domain/dates.ts";
import type { DispatchItem } from "./plan.ts";

export const PUSH_TITLE = "모찌네 청약 알리미";
export const NAME_MAX = 24;
export const MAX_PAYLOAD_BYTES = 2048;

export interface PushPayload {
  title: string;
  body: string;
  /** 같은 사이트 경로 */
  url: string;
  tag: string;
}

const VERDICT_TEXT = { eligible: "자격 충족", unknown: "확인 필요" } as const;

/** 24글자를 넘으면 23글자 + "…" (글자 단위, BR-U6-32) */
export function shortName(name: string): string {
  const chars = Array.from(name.trim());
  return chars.length > NAME_MAX ? `${chars.slice(0, NAME_MAX - 1).join("")}…` : chars.join("");
}

export function countsText(counts: DispatchItem["counts"]): string {
  const parts: string[] = [];
  if (counts.eligible > 0) parts.push(`자격 충족 ${counts.eligible}`);
  if (counts.unknown > 0) parts.push(`확인 필요 ${counts.unknown}`);
  return parts.join(" · ");
}

export function buildPayload(item: DispatchItem, today: IsoDate): PushPayload {
  const tag = `daily-${today}`;
  const total = item.notices.length;
  if (total === 1) {
    const n = item.notices[0]!;
    return { title: PUSH_TITLE, body: `${shortName(n.name)} · ${VERDICT_TEXT[n.verdict]} — 눌러서 확인해 보세요`, url: `/notice/${n.id}`, tag };
  }
  return { title: PUSH_TITLE, body: `새로 맞는 공고 ${total}건이 있어요 (${countsText(item.counts)})`, url: "/", tag };
}

export function testPayload(): PushPayload {
  return { title: PUSH_TITLE, body: "알림이 잘 와요 — 새 공고가 있으면 이렇게 알려 드려요", url: "/settings", tag: "test" };
}

export function encodePayload(payload: PushPayload): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error("알림 내용이 2KB를 넘어요");
  return bytes;
}

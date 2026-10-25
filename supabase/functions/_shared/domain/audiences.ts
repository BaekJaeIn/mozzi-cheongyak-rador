// 공고 신청 대상 (변경 4 U2 domain-entities "변경 요청 4", BR-U2-E10~E15) — 값은 U3가 채운다
import type { HouseholdKind } from "./profile.ts";

export type NoticeAudience =
  | "dormitory" // 기업체 기숙사
  | "startup" // 창업자·창업특화
  | "artist" // 예술인·연극인·문화예술인
  | "student" // 대학생·공공기숙사
  | "youth" // 청년 전용
  | "disabled" // 장애인 전용·자립
  | "low_income" // 수급자·차상위·한부모 등 소득 계층 전용
  | "senior" // 고령자·어르신
  | "newlywed"; // 신혼부부·신생아·예비신혼

/** 표 순서 — 막힌 대상이 여럿이면 앞의 것을 사유로 쓴다 (BR-U2-E12) */
export const NOTICE_AUDIENCES: readonly NoticeAudience[] = ["dormitory", "startup", "artist", "student", "youth", "disabled", "low_income", "senior", "newlywed"];

/** 가구 종류가 신청할 수 있는 대상 (Q4=A) */
export const AUDIENCE_ALLOWED: Readonly<Record<HouseholdKind, ReadonlySet<NoticeAudience>>> = {
  senior: new Set<NoticeAudience>(["senior"]),
  newlywed: new Set<NoticeAudience>(["newlywed"]),
};

export function isNoticeAudience(v: unknown): v is NoticeAudience {
  return typeof v === "string" && (NOTICE_AUDIENCES as readonly string[]).includes(v);
}

/** 대상이 정해졌고 그중 가구 종류가 쓸 수 있는 것이 하나도 없으면 막힘 (BR-U2-E10, Q2=A). 막힌 대상 중 표 순서 첫 번째, 아니면 null */
export function audienceBlocked(kind: HouseholdKind, audiences: readonly NoticeAudience[]): NoticeAudience | null {
  if (audiences.length === 0 || audiences.some((a) => AUDIENCE_ALLOWED[kind].has(a))) return null;
  return NOTICE_AUDIENCES.find((a) => audiences.includes(a)) ?? null;
}

/** DB `notices.audiences` 읽기 — 형식이 틀린 값은 버리고 표 순서·중복 없이 */
export function parseAudiences(value: unknown): NoticeAudience[] {
  if (!Array.isArray(value)) return [];
  return NOTICE_AUDIENCES.filter((a) => value.includes(a));
}

// 공고 표시 값 — D-day, 접수 기간, NEW, 타임라인, 면적·세대수 (BR-U5-23·30~43·75~81)
import { diffDays, type IsoDate } from "@shared/domain/dates.ts";
import { noticeStatus } from "@shared/domain/retention.ts";
import type { CriterionKey } from "@shared/eligibility/types.ts";
import type { Schedule, UnitInfo } from "./api-types";

// ---------- D-day (BR-U5-30~37) ----------

export interface DdayLabel {
  text: string;
  /** 빨간색 강조 (글자에도 정보가 있으므로 색에만 의존하지 않는다, BR-U5-38) */
  urgent: boolean;
}

export const URGENT_DAYS = 3;

export function ddayLabel(applyStart: IsoDate | null, applyEnd: IsoDate | null, today: IsoDate): DdayLabel {
  const status = noticeStatus({ applyStart, applyEnd }, today);
  if (status === "closed") return { text: "접수 마감", urgent: false };
  if (status === "open") {
    if (applyEnd === today) return { text: "오늘 마감", urgent: true };
    if (applyStart === today) return { text: "오늘 접수 시작", urgent: false };
    if (applyEnd) {
      const d = diffDays(today, applyEnd);
      return { text: `마감까지 D-${d}`, urgent: d <= URGENT_DAYS };
    }
    return { text: "접수 중 (마감일 미정)", urgent: false };
  }
  if (applyStart) return { text: `접수까지 D-${diffDays(today, applyStart)}`, urgent: false };
  return { text: "일정 미정", urgent: false };
}

// ---------- 날짜 표기 (BR-U5-23) ----------

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "10월 20일(월)", 연도가 오늘과 다르면 "2027년 1월 5일(화)" */
export function dateLabel(date: IsoDate, today: IsoDate): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const year = date.slice(0, 4) === today.slice(0, 4) ? "" : `${y}년 `;
  return `${year}${m}월 ${d}일(${weekday})`;
}

export function periodLabel(applyStart: IsoDate | null, applyEnd: IsoDate | null, today: IsoDate): string {
  if (!applyStart && !applyEnd) return "접수 일정 미정";
  const part = (x: IsoDate | null) => (x ? dateLabel(x, today) : "미정");
  return `${part(applyStart)} ~ ${part(applyEnd)}`;
}

// ---------- NEW (BR-U5-40) ----------

export const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isNew(id: string, firstSeenAt: string, now: Date, seen: ReadonlySet<string>): boolean {
  if (seen.has(id)) return false;
  const first = Date.parse(firstSeenAt);
  if (Number.isNaN(first)) return false;
  const age = now.getTime() - first;
  return age >= 0 ? age < NEW_WINDOW_MS : true; // 기기 시계가 늦어도 새 공고는 새것
}

// ---------- 타임라인 (BR-U5-75~77) ----------

export type TimelineKey = "announced" | "applyStart" | "applyEnd" | "result" | "contract";
export type TimelineState = "past" | "today" | "future" | "unknown";

export interface TimelineStep {
  key: TimelineKey;
  label: string;
  date: IsoDate | null;
  /** 계약 기간 끝 (있을 때만) */
  endDate: IsoDate | null;
  state: TimelineState;
}

export interface Timeline {
  steps: TimelineStep[];
  /** "오늘" 표시를 넣을 위치 0~5 (그 단계 앞). 오늘인 단계가 있으면 null — 그 단계에 표시 */
  todayIndex: number | null;
}

export function timeline(schedule: Schedule, today: IsoDate): Timeline {
  const raw: [TimelineKey, string, IsoDate | null, IsoDate | null][] = [
    ["announced", "모집공고", schedule.announcedAt, null],
    ["applyStart", "접수 시작", schedule.applyStart, null],
    ["applyEnd", "접수 마감", schedule.applyEnd, null],
    ["result", "당첨 발표", schedule.resultAt, null],
    ["contract", "계약", schedule.contractStart, schedule.contractEnd],
  ];
  const steps = raw.map(([key, label, date, endDate]): TimelineStep => {
    const state: TimelineState = !date ? "unknown" : date < today ? "past" : date === today ? "today" : "future";
    return { key, label, date, endDate, state };
  });
  if (steps.some((s) => s.state === "today")) return { steps, todayIndex: null };
  let last = -1;
  steps.forEach((s, i) => {
    if (s.date && s.date <= today) last = i;
  });
  return { steps, todayIndex: last + 1 };
}

// ---------- 면적·세대수 (BR-U5-78~81) ----------

export const PYEONG_PER_M2 = 0.3025;

export function pyeongOf(m2: number): number {
  const p = m2 * PYEONG_PER_M2;
  return p < 1 ? Math.round(p * 10) / 10 : Math.round(p);
}

function m2Text(m2: number): string {
  return Number.isInteger(m2) ? String(m2) : String(Math.round(m2 * 100) / 100);
}

/** "전용 59㎡ (약 18평)", 없으면 "면적 미정" (Q9=A) */
export function areaLabel(m2: number | null): string {
  if (m2 === null || !Number.isFinite(m2)) return "면적 미정";
  return `전용 ${m2Text(m2)}㎡ (약 ${pyeongOf(m2)}평)`;
}

/** 짧은 면적 "59㎡" (판정 묶음의 면적 나열) */
export function shortAreaLabel(m2: number | null): string {
  return m2 === null ? "면적 미정" : `${m2Text(m2)}㎡`;
}

export function compareArea(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

export interface UnitRows {
  rows: UnitInfo[];
  total: string;
}

export function unitRows(units: readonly UnitInfo[]): UnitRows {
  const rows = [...units].sort(
    (a, b) =>
      compareArea(a.exclusiveAreaM2, b.exclusiveAreaM2) ||
      (a.label ?? "").localeCompare(b.label ?? "", "ko") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const known = rows.filter((u) => u.supplyCount !== null);
  const sum = known.reduce((acc, u) => acc + (u.supplyCount ?? 0), 0);
  const total =
    known.length === 0 ? "세대수 미정" : `${sum.toLocaleString("ko-KR")}세대${known.length < rows.length ? " 이상" : ""}`;
  return { rows, total };
}

export function supplyCountLabel(count: number | null): string {
  return count === null ? "-" : `${count.toLocaleString("ko-KR")}세대`;
}

// ---------- 조건 이름 (business-rules §9) ----------

export const CRITERION_NAMES: Readonly<Record<CriterionKey, string>> = {
  type: "공급 유형",
  age: "나이",
  homeless: "무주택",
  income: "소득",
  asset: "자산",
  car: "자동차",
  savings: "청약통장",
  residence: "사는 곳",
  household: "세대 구성",
  welfare: "복지 대상",
};

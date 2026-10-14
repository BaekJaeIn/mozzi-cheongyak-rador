// 보관 기간 판단과 공고 상태 (BR-U1-13, BR-U1-14, domain-entities E3 파생값)
import { diffDays, type IsoDate, toKstDate } from "./dates.ts";

export const DEVICE_RETENTION_DAYS = 180;
export const NOTICE_RETENTION_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 마지막 접속이 180일보다 오래됐으면 true (정확히 180일은 아직 보관). */
export function isDeviceExpired(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > DEVICE_RETENTION_DAYS * DAY_MS;
}

export interface NoticeDates {
  applyEnd?: IsoDate | null;
  announcedAt?: IsoDate | null;
  firstSeenAt: Date;
}

/** 보관 기준일: 마감일 ?? 모집공고일 ?? 첫 수집일(한국 날짜). */
export function noticeRetentionBaseDate(notice: NoticeDates): IsoDate {
  return notice.applyEnd ?? notice.announcedAt ?? toKstDate(notice.firstSeenAt);
}

/** 기준일로부터 365일이 지났으면 true (정확히 365일째는 아직 보관). */
export function isNoticeExpired(notice: NoticeDates, today: IsoDate): boolean {
  return diffDays(noticeRetentionBaseDate(notice), today) > NOTICE_RETENTION_DAYS;
}

export type NoticeStatus = "upcoming" | "open" | "closed";

export interface NoticeSchedule {
  applyStart?: IsoDate | null;
  applyEnd?: IsoDate | null;
}

/**
 * 오늘 기준 접수 상태.
 * - 마감일이 지났으면 closed
 * - 시작일이 있고 오늘이 시작일 이후면 open
 * - 그 밖(시작일 없음 포함)은 upcoming — 마감일이 없으면 절대 closed가 되지 않는다 (놓치지 않기)
 */
export function noticeStatus(schedule: NoticeSchedule, today: IsoDate): NoticeStatus {
  if (schedule.applyEnd && diffDays(schedule.applyEnd, today) > 0) return "closed";
  if (schedule.applyStart && diffDays(schedule.applyStart, today) >= 0) return "open";
  return "upcoming";
}

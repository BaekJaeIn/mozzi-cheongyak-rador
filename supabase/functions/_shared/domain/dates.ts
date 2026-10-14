// 날짜 계산 도우미. 일정은 'YYYY-MM-DD' 문자열(한국 날짜)로 다룬다.

export type IsoDate = string; // YYYY-MM-DD

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function toEpochDay(date: IsoDate): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/** b - a (일). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date((toEpochDay(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** 시각을 한국 날짜로 바꾼다. */
export function toKstDate(instant: Date): IsoDate {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

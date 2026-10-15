// 원천 날짜 문자열 → 한국 날짜 (BR-U3-10)
// "20260819", "2026.07.14", "2026-07-14", "2026/7/14", "2026. 10. 6.", "2026.07.20 10:00", "2026-07-14(월)" 등
import { type IsoDate, isIsoDate } from "../domain/dates.ts";
import { SCHEDULE_KEYS, type RawDates, type Schedule } from "./types.ts";

const COMPACT = /^(\d{4})(\d{2})(\d{2})(?!\d)/;
const SEPARATED = /^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/;

export function parseSourceDate(value: unknown): IsoDate | null {
  // 원천 값은 문자열·숫자뿐이다. 객체 등은 String()이 예외를 낼 수 있어 보지 않는다 (PBT seed 980816069)
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  const m = COMPACT.exec(text) ?? SEPARATED.exec(text);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

export function parseSchedule(dates: RawDates): Schedule {
  const out = {} as Schedule;
  for (const key of SCHEDULE_KEYS) out[key] = parseSourceDate(dates[key]);
  return out;
}

/** 범위 문자열 "2026.07.20 10:00 ~ 2026.07.21 17:00" → [시작, 끝] */
export function parseDateRange(text: string | null | undefined): [IsoDate | null, IsoDate | null] {
  if (!text) return [null, null];
  const [start, end] = text.split("~");
  return [parseSourceDate(start), parseSourceDate(end)];
}

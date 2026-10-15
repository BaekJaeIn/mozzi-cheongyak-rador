// 수집 범위 (BR-U3-40, U3 Q4=A): 마감일이 오늘 이후·당일이거나 모르면 처리
import { diffDays, type IsoDate } from "../domain/dates.ts";
import type { Schedule } from "./types.ts";

export function inScope(schedule: Pick<Schedule, "applyEnd">, today: IsoDate): boolean {
  return schedule.applyEnd === null || diffDays(today, schedule.applyEnd) >= 0;
}

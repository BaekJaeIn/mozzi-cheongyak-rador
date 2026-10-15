// 알림 시각 표기 (BR-U4-74): 0시~23시, 오전/오후
export const DEFAULT_NOTIFY_HOUR = 9;
export const HOURS: readonly number[] = Array.from({ length: 24 }, (_, h) => h);

/** 0 → "오전 12시", 9 → "오전 9시", 12 → "오후 12시", 23 → "오후 11시" */
export function hourLabel(hour: number): string {
  const half = hour < 12 ? "오전" : "오후";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${half} ${h}시`;
}

export function isValidHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23;
}

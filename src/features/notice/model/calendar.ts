// 캘린더에 추가 — 접수 기간 종일 일정 1개 (BR-U5-105~111, Q10=A)
// iPhone·iPad: .ics (RFC 5545), 그 밖: Google 캘린더 추가 링크
import { addDays, type IsoDate } from "@shared/domain/dates.ts";

export interface CalendarEvent {
  noticeId: string;
  /** "[청약 접수] …" */
  title: string;
  /** 포함 범위 */
  start: IsoDate;
  end: IsoDate;
  description: string;
  url: string | null;
}

export type CalendarAvailability =
  | { kind: "ready"; event: CalendarEvent }
  | { kind: "no_dates" } // 비활성 "일정이 정해지면 넣을 수 있어요"
  | { kind: "closed" }; // 버튼 숨김

export const NO_DATES_TEXT = "일정이 정해지면 넣을 수 있어요";

export function calendarEvent(input: {
  id: string;
  title: string;
  complexName: string | null;
  applyStart: IsoDate | null;
  applyEnd: IsoDate | null;
  status: "upcoming" | "open" | "closed";
  url: string | null;
}): CalendarAvailability {
  if (input.status === "closed") return { kind: "closed" };
  if (!input.applyStart || !input.applyEnd || input.applyEnd < input.applyStart) return { kind: "no_dates" };
  return {
    kind: "ready",
    event: {
      noticeId: input.id,
      title: `[청약 접수] ${input.complexName ?? input.title}`,
      start: input.applyStart,
      end: input.applyEnd,
      description: input.url ? `${input.title}\n원문: ${input.url}` : input.title,
      url: input.url,
    },
  };
}

// ---------- .ics ----------

const compact = (d: IsoDate) => d.replaceAll("-", "");

/** RFC 5545 TEXT 이스케이프: \ ; , 줄바꿈 */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

export function unescapeIcsText(text: string): string {
  return text.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

const encoder = new TextEncoder();
export const ICS_LINE_OCTETS = 75;

/** 한 줄 75바이트를 넘으면 CRLF + 공백으로 접는다. UTF-8 글자 가운데를 자르지 않는다 */
export function foldIcsLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = ICS_LINE_OCTETS;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = " ";
      bytes = 1;
      limit = ICS_LINE_OCTETS;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out;
}

export function unfoldIcs(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").split("\r\n");
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 미리 알림 날: 마감 전날, 시작일 = 마감일이면 그날 (BR-U5-107) */
export function alarmDate(event: Pick<CalendarEvent, "start" | "end">): IsoDate {
  return event.start === event.end ? event.start : addDays(event.end, -1);
}

export function buildIcs(event: CalendarEvent, now: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mozzi-cheongyak//ko",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.noticeId}@mozzi-cheongyak`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${compact(event.start)}`,
    `DTEND;VALUE=DATE:${compact(addDays(event.end, 1))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    ...(event.url ? [`URL:${event.url}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(event.title)}`,
    // 오전 9시 KST = 같은 날 00:00 UTC
    `TRIGGER;VALUE=DATE-TIME:${compact(alarmDate(event))}T000000Z`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(foldIcsLine).join("\r\n")}\r\n`;
}

// ---------- Google 캘린더 ----------

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compact(event.start)}/${compact(addDays(event.end, 1))}`,
    details: event.description,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** iPhone·iPad(iPadOS는 Mac처럼 보이지만 터치가 있음) → ics */
export function calendarTarget(userAgent: string, maxTouchPoints: number): "ics" | "google" {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ics";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ics";
  return "google";
}

export function icsFileName(noticeId: string): string {
  return `cheongyak-${noticeId.replace(/[^0-9a-zA-Z]/g, "").slice(0, 8)}.ics`;
}

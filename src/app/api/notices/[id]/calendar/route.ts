import { noticeCalendarRoute } from "@/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 캘린더 파일(.ics) — 공고 정보만, 기기 인증 없음 (BR-U5-133)
export const GET = noticeCalendarRoute;

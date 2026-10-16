import { noticeDetailRoute } from "@/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 공고 상세 + 이 기기의 판정 (BR-U5-131). 공고 ID는 핸들러가 주소에서 읽는다
export const GET = noticeDetailRoute;

import { pushKeyRoute } from "@/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// VAPID 공개 키 (공개 값, 인증 없음)
export const GET = pushKeyRoute;

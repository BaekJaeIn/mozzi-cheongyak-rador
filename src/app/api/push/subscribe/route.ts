import { pushSubscribeRoute } from "@/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 구독 저장 + 첫 구독 기준선 (BR-U6-50~55)
export const POST = pushSubscribeRoute;

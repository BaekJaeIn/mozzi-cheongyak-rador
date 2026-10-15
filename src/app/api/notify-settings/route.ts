import { notifySettingsRoute } from "@/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 알림 시각·켜기/끄기 (BR-U4-101)
export const PUT = notifySettingsRoute;

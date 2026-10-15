import { saveProfileRoute } from "@/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 내 정보 저장 + 이 기기 판정 재계산 (BR-U4-100)
export const PUT = saveProfileRoute;

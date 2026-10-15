import { deleteDeviceRoute, deviceRepository } from "@/server/deps";
import { createRegisterHandler } from "@/server/handlers/register-device";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createRegisterHandler(deviceRepository);

// U4 내 정보 모두 지우기 (BR-U4-102)
export const DELETE = deleteDeviceRoute;

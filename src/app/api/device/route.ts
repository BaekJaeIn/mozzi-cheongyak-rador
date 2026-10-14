import { deviceRepository } from "@/server/deps";
import { createRegisterHandler } from "@/server/handlers/register-device";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createRegisterHandler(deviceRepository);

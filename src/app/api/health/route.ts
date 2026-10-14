import { pingDb } from "@/server/deps";
import { createHealthHandler } from "@/server/handlers/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createHealthHandler(pingDb);

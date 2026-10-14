// 서버 전용 Supabase 클라이언트 (L7, P-S1). 브라우저로 나가지 않는다.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "../env";

/** Repository가 쓰는 최소 기능 (테스트에서 가짜 객체로 대체 가능) */
export type DbClient = Pick<SupabaseClient, "from" | "rpc">;

let client: SupabaseClient | null = null;

export function getDb(): DbClient {
  if (!client) {
    const env = getServerEnv();
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export class DbError extends Error {
  constructor(operation: string, cause: { message?: string; code?: string } | null) {
    super(`DB 작업 실패: ${operation}${cause?.code ? ` (${cause.code})` : ""}`);
    this.name = "DbError";
  }
}

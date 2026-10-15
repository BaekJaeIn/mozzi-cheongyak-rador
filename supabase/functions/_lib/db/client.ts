// Edge Function용 Supabase 클라이언트 (L-U3-7). Node와 같은 버전 고정
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";

export type DbClient = Pick<SupabaseClient, "from" | "rpc">;

export function createDb(url: string, serviceRoleKey: string): DbClient {
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class DbError extends Error {
  constructor(operation: string, cause: { message?: string; code?: string } | null) {
    super(`DB 작업 실패: ${operation}${cause?.code ? ` (${cause.code})` : ""}`);
    this.name = "DbError";
  }
}

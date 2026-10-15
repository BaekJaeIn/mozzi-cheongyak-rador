// Edge Function 호출 인증 (P-U3-S1) — pg_cron이 Vault의 CRON_SECRET을 Bearer로 보낸다
import { constantTimeEqual } from "../security/token.ts";

/** 서버 키가 16자 미만이거나 헤더가 다르면 거절 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authorization) return false;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match !== null && constantTimeEqual(match[1]!, secret);
}

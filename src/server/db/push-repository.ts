// U6 구독·시험 알림 저장소 (Node). DB 함수 호출은 _shared/push/store-rpc.ts와 같은 코드
import "server-only";
import type { PushTarget } from "@shared/push/send.ts";
import { type RpcClient, savePushSubscription, tryTestPush } from "@shared/push/store-rpc.ts";
import { type DbClient, DbError } from "./client";

export function createPushRepository(db: DbClient) {
  const rpc = db as unknown as RpcClient;
  return {
    save: (input: Parameters<typeof savePushSubscription>[1]) => savePushSubscription(rpc, input),
    tryTest: (deviceId: string) => tryTestPush(rpc, deviceId),

    async list(deviceId: string): Promise<PushTarget[]> {
      const { data, error } = await db.from("push_subscriptions").select("endpoint, p256dh, auth").eq("device_id", deviceId).order("created_at");
      if (error) throw new DbError("push_subscriptions.list", error);
      return (data ?? []) as PushTarget[];
    },

    /** 시험 알림 결과: 알림 기록은 남기지 않고 구독 상태만 (BR-U6-67) */
    async record(deviceId: string, result: { success: string[]; failed: string[]; gone: string[] }): Promise<void> {
      const { error } = await db.rpc("record_push_result", {
        p_device: deviceId,
        p_notice_ids: [],
        p_success: result.success,
        p_failed: result.failed,
        p_gone: result.gone,
      });
      if (error) throw new DbError("record_push_result", error);
    },
  };
}

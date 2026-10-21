// DispatchStore — DB 함수(0008·0014) 호출 구현. Deno(dispatch)·Node(구독·시험 API)가 함께 쓴다.
// 클라이언트는 supabase-js의 rpc 모양만 받는다 (런타임별 import를 여기서 하지 않는다).
import type { IsoDate } from "../domain/dates.ts";
import type { Tenure, Verdict } from "../db/types.ts";
import type { FeedRow } from "../feed/visible.ts";
import type { ClaimResult, DeviceRows, DispatchCandidate, DispatchStore, RecordInput } from "./dispatch.ts";

export interface RpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
}

export class PushDbError extends Error {
  constructor(operation: string, cause: { code?: string } | null) {
    super(`DB 작업 실패: ${operation}${cause?.code ? ` (${cause.code})` : ""}`);
    this.name = "PushDbError";
  }
}

async function call(db: RpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new PushDbError(fn, error);
  return data;
}

interface RowJson {
  verdict: Verdict;
  in_district: boolean;
  score: number | string | null;
  detail: unknown;
  notice: {
    id: string;
    title: string;
    complex_name: string | null;
    tenure: Tenure;
    apply_start: string | null;
    apply_end: string | null;
    first_seen_at: string;
  };
  districts: { id: string; name: string; sort_order: number }[];
}

export function toFeedRow(r: RowJson): FeedRow {
  return {
    verdict: r.verdict,
    inDistrict: r.in_district,
    score: r.score === null ? null : Number(r.score),
    detail: r.detail,
    notice: {
      id: r.notice.id,
      title: r.notice.title,
      complexName: r.notice.complex_name,
      tenure: r.notice.tenure,
      applyStart: r.notice.apply_start,
      applyEnd: r.notice.apply_end,
      firstSeenAt: new Date(r.notice.first_seen_at).toISOString(),
    },
    districts: (r.districts ?? []).map((d) => ({ id: d.id, name: d.name, sortOrder: d.sort_order })),
  };
}

export function createRpcDispatchStore(db: RpcClient, countNotices: () => Promise<number>): DispatchStore {
  return {
    async candidates(hour, today) {
      const data = (await call(db, "dispatch_candidates", { p_hour: hour, p_today: today })) as {
        device_id: string;
        profile_version: number | null;
        subscriptions: { endpoint: string; p256dh: string; auth: string }[];
      }[];
      return (data ?? []).map((c): DispatchCandidate => ({ deviceId: c.device_id, profileVersion: c.profile_version, subscriptions: c.subscriptions }));
    },

    async deviceRows(deviceIds, today) {
      const data = (await call(db, "dispatch_device_rows", { p_device_ids: deviceIds, p_today: today })) as Record<
        string,
        { rows: RowJson[]; notified: string[]; count: number; min_version: number | null }
      >;
      // 마감 임박 관심 공고 (변경 3, 0014)
      const deadlines = (await call(db, "dispatch_deadlines", { p_device_ids: deviceIds, p_today: today })) as Record<
        string,
        { id: string; title: string; complex_name: string | null }[]
      >;
      const out = new Map<string, DeviceRows>();
      for (const [id, v] of Object.entries(data ?? {})) {
        out.set(id, {
          rows: v.rows.map(toFeedRow),
          notified: v.notified,
          stats: { count: v.count, minProfileVersion: v.min_version },
          deadlines: (deadlines?.[id] ?? []).map((d) => ({ id: d.id, name: d.complex_name ?? d.title })),
        });
      }
      return out;
    },

    countNotices,

    async claim(deviceId: string, today: IsoDate): Promise<ClaimResult> {
      const data = (await call(db, "claim_daily_push", { p_device: deviceId, p_today: today })) as { claimed: boolean; previous?: string | null };
      return data?.claimed ? { claimed: true, previous: data.previous ?? null } : { claimed: false };
    },

    async release(deviceId, today, previous) {
      await call(db, "release_daily_push", { p_device: deviceId, p_today: today, p_previous: previous });
    },

    async record(deviceId: string, input: RecordInput) {
      await call(db, "record_push_result", {
        p_device: deviceId,
        p_notice_ids: input.noticeIds,
        p_success: input.success,
        p_failed: input.failed,
        p_gone: input.gone,
      });
      if (input.deadlineIds && input.deadlineIds.length > 0) {
        await call(db, "record_deadline_push", { p_device: deviceId, p_notice_ids: input.deadlineIds });
      }
    },
  };
}

/** 구독 저장 + 첫 구독 기준선 (BR-U6-10·53·54) */
export async function savePushSubscription(
  db: RpcClient,
  input: { deviceId: string; endpoint: string; p256dh: string; auth: string; baselineIds: readonly string[] },
): Promise<{ saved: boolean; baselined: boolean }> {
  const data = (await call(db, "save_push_subscription", {
    p_device: input.deviceId,
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_baseline_ids: input.baselineIds,
  })) as { saved: boolean; baselined?: boolean };
  return { saved: !!data?.saved, baselined: !!data?.baselined };
}

export async function tryTestPush(db: RpcClient, deviceId: string): Promise<boolean> {
  return (await call(db, "try_test_push", { p_device: deviceId })) === true;
}

/** 관심 공고 목록 바꾸기 (변경 3 BR-U6-D1·D5). 저장된 개수 */
export async function replaceDeviceBookmarks(db: RpcClient, deviceId: string, ids: readonly string[]): Promise<number> {
  return Number(await call(db, "replace_device_bookmarks", { p_device: deviceId, p_ids: ids }));
}

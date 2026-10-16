// 매시 발송 실행기 (S5, business-logic-model §1) — DB·푸시 서비스는 포트로 주입
// 대상 → 묶어 읽기 → 오래된 판정 다시 계산 → 기기 5대씩 (몫 잡기 → 보내기 → 기록 | 되돌리기) → 집계
// 멱등(P-1·2), 기기별 격리(P-3), 시간 예산(P-5), 묶어 읽기(P-9), 동시 5(P-10)
import { type IsoDate, toKstDate } from "../domain/dates.ts";
import { type FeedRow, type JudgementStats, needsRecompute } from "../feed/visible.ts";
import type { Logger } from "../log/logger.ts";
import { buildPayload } from "./payload.ts";
import { planDevice } from "./plan.ts";
import { DAILY_TTL_SECONDS, type PushTarget, type PushTransport, type SendOutcome, sendPush, settleDevice } from "./send.ts";
import type { VapidSigner } from "./vapid.ts";

export interface DispatchCandidate {
  deviceId: string;
  profileVersion: number | null;
  subscriptions: PushTarget[];
}

export interface DeviceRows {
  rows: FeedRow[];
  notified: string[];
  stats: JudgementStats;
}

export type ClaimResult = { claimed: true; previous: IsoDate | null } | { claimed: false };

export interface RecordInput {
  noticeIds: string[];
  success: string[];
  failed: string[];
  gone: string[];
}

export interface DispatchStore {
  candidates(hour: number, today: IsoDate): Promise<DispatchCandidate[]>;
  deviceRows(deviceIds: readonly string[], today: IsoDate): Promise<Map<string, DeviceRows>>;
  countNotices(): Promise<number>;
  claim(deviceId: string, today: IsoDate): Promise<ClaimResult>;
  release(deviceId: string, today: IsoDate, previous: IsoDate | null): Promise<void>;
  record(deviceId: string, input: RecordInput): Promise<void>;
}

export interface DispatchDeps {
  store: DispatchStore;
  vapid: VapidSigner;
  transport: PushTransport;
  recompute: (deviceId: string, today: IsoDate) => Promise<{ status: string }>;
  log: Logger;
  /** 실행 시각(ms) — 시간 예산 계산 */
  nowMs: () => number;
  sleep?: (ms: number) => Promise<void>;
  concurrency?: number;
  budgetMs?: number;
  batchSize?: number;
  /** 나눠 부르기 (infrastructure-design §4): 기기 ID 해시 % count === index 인 기기만. 없으면 전부 */
  part?: { index: number; count: number };
}

export interface DispatchSummary {
  hour: number;
  today: IsoDate;
  devices: number;
  sent: number;
  skippedEmpty: number;
  skippedClaimed: number;
  skippedBudget: number;
  failed: number;
  removedSubscriptions: number;
  recomputed: number;
  timeBudgetExceeded: boolean;
}

export const CONCURRENCY = 5;
export const TIME_BUDGET_MS = 45_000;
export const BATCH_SIZE = 100;
/** 한 번 호출에서 이보다 많으면 나눠 부르라고 경고 (암호화 1,000건 ≈ 1.8초, Edge CPU 2초 한도) */
export const SPLIT_WARN_DEVICES = 400;

/** 기기 ID → 0 이상 정수 (FNV-1a 32비트) — 나눠 부르기용 */
export function partOf(deviceId: string, count: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < deviceId.length; i++) {
    h ^= deviceId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % count;
}

/** 한국 시(0~23) */
export function kstHour(now: Date): number {
  return (now.getUTCHours() + 9) % 24;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function readRows(store: DispatchStore, ids: readonly string[], today: IsoDate, size: number): Promise<Map<string, DeviceRows>> {
  const all = new Map<string, DeviceRows>();
  for (const part of chunks(ids, size)) for (const [k, v] of await store.deviceRows(part, today)) all.set(k, v);
  return all;
}

export async function runDispatch(deps: DispatchDeps, now: Date): Promise<DispatchSummary> {
  const started = deps.nowMs();
  const hour = kstHour(now);
  const today = toKstDate(now);
  const budget = deps.budgetMs ?? TIME_BUDGET_MS;
  const size = deps.batchSize ?? BATCH_SIZE;
  const summary: DispatchSummary = {
    hour,
    today,
    devices: 0,
    sent: 0,
    skippedEmpty: 0,
    skippedClaimed: 0,
    skippedBudget: 0,
    failed: 0,
    removedSubscriptions: 0,
    recomputed: 0,
    timeBudgetExceeded: false,
  };

  const part = deps.part;
  const candidates = (await deps.store.candidates(hour, today)).filter((c) => !part || part.count <= 1 || partOf(c.deviceId, part.count) === part.index);
  summary.devices = candidates.length;
  if (candidates.length === 0) return summary;
  if (candidates.length > SPLIT_WARN_DEVICES) deps.log.warn("dispatch.too_many", { devices: candidates.length, hint: "cron을 part별로 나눠 부르세요" });

  // 묶어 읽기 (P-9) → 오래된 판정만 다시 계산 (BR-U6-04, P-11)
  const rows = await readRows(deps.store, candidates.map((c) => c.deviceId), today, size);
  let noticeCount: number | null = null;
  const stale: string[] = [];
  for (const c of candidates) {
    const r = rows.get(c.deviceId);
    if (!r || c.profileVersion === null) continue;
    if (r.stats.count === 0 && noticeCount === null) noticeCount = await deps.store.countNotices();
    if (needsRecompute(r.stats, c.profileVersion, noticeCount ?? 0)) stale.push(c.deviceId);
  }
  const refreshed: string[] = [];
  for (const id of stale) {
    try {
      const { status } = await deps.recompute(id, today);
      if (status === "saved") refreshed.push(id);
    } catch (error) {
      deps.log.warn("dispatch.recompute.failed", { deviceId: id, error: error instanceof Error ? error.name : "unknown" });
    }
  }
  summary.recomputed = refreshed.length;
  if (refreshed.length > 0) for (const [k, v] of await readRows(deps.store, refreshed, today, size)) rows.set(k, v);

  const nowSeconds = Math.floor(now.getTime() / 1000);

  async function processDevice(c: DispatchCandidate): Promise<void> {
    if (deps.nowMs() - started > budget) {
      summary.skippedBudget += 1;
      summary.timeBudgetExceeded = true;
      return;
    }
    const r = rows.get(c.deviceId);
    const item = r ? planDevice(c.deviceId, r.rows, new Set(r.notified), today) : null;
    if (!item) {
      summary.skippedEmpty += 1; // 몫을 잡지 않는다 (BR-U6-05)
      return;
    }
    let claim: ClaimResult = { claimed: false };
    try {
      claim = await deps.store.claim(c.deviceId, today);
      if (!claim.claimed) {
        summary.skippedClaimed += 1;
        return;
      }
      const payload = buildPayload(item, today);
      const results: { endpoint: string; outcome: SendOutcome }[] = [];
      for (const sub of c.subscriptions) {
        const outcome = await sendPush(sub, payload, { vapid: deps.vapid, transport: deps.transport, nowSeconds, ttl: DAILY_TTL_SECONDS, sleep: deps.sleep });
        if (outcome.kind === "rejected") deps.log.warn("push.rejected", { deviceId: c.deviceId, status: outcome.status });
        results.push({ endpoint: sub.endpoint, outcome });
      }
      const settled = settleDevice(results);
      summary.removedSubscriptions += settled.gone.length;
      if (!settled.delivered) await deps.store.release(c.deviceId, today, claim.previous);
      try {
        await deps.store.record(c.deviceId, {
          noticeIds: settled.delivered ? item.notices.map((n) => n.id) : [],
          success: settled.success,
          failed: settled.failed,
          gone: settled.gone,
        });
      } catch (error) {
        // 기록 실패 → 그 공고는 다음 날 다시 알림 (놓치지 않기, P-7)
        deps.log.error("dispatch.record.failed", { deviceId: c.deviceId, error: error instanceof Error ? error.name : "unknown" });
      }
      if (settled.delivered) summary.sent += 1;
      else summary.failed += 1;
      deps.log.info("dispatch.device", { deviceId: c.deviceId, delivered: settled.delivered, notices: item.notices.length });
    } catch (error) {
      summary.failed += 1;
      deps.log.error("dispatch.device.failed", { deviceId: c.deviceId, error: error instanceof Error ? error.name : "unknown" });
      if (claim.claimed) await deps.store.release(c.deviceId, today, claim.previous).catch(() => undefined);
    }
  }

  // 동시 처리 (P-10)
  let next = 0;
  const workers = Array.from({ length: Math.min(deps.concurrency ?? CONCURRENCY, candidates.length) }, async () => {
    while (next < candidates.length) await processDevice(candidates[next++]!);
  });
  await Promise.all(workers);
  if (summary.timeBudgetExceeded) deps.log.warn("dispatch.time_budget", { skipped: summary.skippedBudget });
  return summary;
}

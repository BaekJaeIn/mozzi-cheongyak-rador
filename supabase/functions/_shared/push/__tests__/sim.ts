// 발송 시뮬레이터 — 메모리 DispatchStore + 가짜 푸시 서비스 (P-U6-2·3·7, P-13)
// DB 함수의 약속(몫 잡기 원자성, 기록 유일, 되돌리기 조건)을 그대로 흉내 낸다.
import type { IsoDate } from "../../domain/dates.ts";
import type { FeedRow } from "../../feed/visible.ts";
import type { Logger } from "../../log/logger.ts";
import type { ClaimResult, DeviceRows, DispatchCandidate, DispatchStore, RecordInput } from "../dispatch.ts";
import type { PushTransport } from "../send.ts";
import { type BookmarkedNotice, deadlineNotices } from "../plan.ts";

export interface SimDevice {
  notifyHour: number;
  enabled: boolean;
  lastPushOn: IsoDate | null;
  profileVersion: number | null;
  rows: FeedRow[];
}

export interface SimSubscription {
  deviceId: string;
  p256dh: string;
  auth: string;
  failingSince: string | null;
}

export class MemoryDispatchStore implements DispatchStore {
  devices = new Map<string, SimDevice>();
  subscriptions = new Map<string, SimSubscription>();
  /** `${device}|${notice}` → kind */
  log = new Map<string, "sent" | "baseline">();
  /** 기록 호출 (속성 검사용) */
  records: { deviceId: string; today: IsoDate | null; input: RecordInput }[] = [];
  currentToday: IsoDate | null = null;
  failRecord = false;
  /** 변경 3: 기기 → 관심 공고 (0014 device_bookmarks), 마감 알림 기록, 마감 알림 끈 기기 */
  bookmarks = new Map<string, BookmarkedNotice[]>();
  deadlineLog = new Set<string>();
  deadlineOff = new Set<string>();

  async candidates(hour: number, today: IsoDate): Promise<DispatchCandidate[]> {
    this.currentToday = today;
    const out: DispatchCandidate[] = [];
    for (const [deviceId, d] of this.devices) {
      const subs = [...this.subscriptions].filter(([, s]) => s.deviceId === deviceId);
      if (!d.enabled || d.notifyHour !== hour || subs.length === 0 || d.lastPushOn === today) continue;
      out.push({ deviceId, profileVersion: d.profileVersion, subscriptions: subs.map(([endpoint, s]) => ({ endpoint, p256dh: s.p256dh, auth: s.auth })) });
    }
    return out.sort((a, b) => (a.deviceId < b.deviceId ? -1 : 1));
  }

  async deviceRows(ids: readonly string[], today: IsoDate): Promise<Map<string, DeviceRows>> {
    const out = new Map<string, DeviceRows>();
    for (const id of ids) {
      const d = this.devices.get(id);
      if (!d) continue;
      const notified = [...this.log.keys()].filter((k) => k.startsWith(`${id}|`)).map((k) => k.slice(id.length + 1));
      const recorded = new Set([...this.deadlineLog].filter((k) => k.startsWith(`${id}|`)).map((k) => k.slice(id.length + 1)));
      const deadlines = deadlineNotices(this.bookmarks.get(id) ?? [], recorded, today, !this.deadlineOff.has(id)); // DB dispatch_deadlines와 같은 규칙
      out.set(id, { rows: d.rows, notified, stats: { count: d.rows.length, minProfileVersion: d.rows.length ? d.profileVersion : null }, deadlines });
    }
    return out;
  }

  async countNotices(): Promise<number> {
    return 0;
  }

  /** 원자적: 검사와 바꾸기 사이에 await가 없다 */
  async claim(deviceId: string, today: IsoDate): Promise<ClaimResult> {
    const d = this.devices.get(deviceId);
    if (!d || d.lastPushOn === today) return { claimed: false };
    const previous = d.lastPushOn;
    d.lastPushOn = today;
    return { claimed: true, previous };
  }

  async release(deviceId: string, today: IsoDate, previous: IsoDate | null): Promise<void> {
    const d = this.devices.get(deviceId);
    if (d && d.lastPushOn === today) d.lastPushOn = previous;
  }

  async record(deviceId: string, input: RecordInput): Promise<void> {
    if (this.failRecord) throw new Error("db down");
    this.records.push({ deviceId, today: this.currentToday, input });
    for (const n of input.noticeIds) if (!this.log.has(`${deviceId}|${n}`)) this.log.set(`${deviceId}|${n}`, "sent");
    for (const n of input.deadlineIds ?? []) this.deadlineLog.add(`${deviceId}|${n}`);
    for (const e of input.success) {
      const s = this.subscriptions.get(e);
      if (s) s.failingSince = null;
    }
    for (const e of input.failed) {
      const s = this.subscriptions.get(e);
      if (s && s.failingSince === null) s.failingSince = "now";
    }
    for (const e of input.gone) this.subscriptions.delete(e);
  }

  /** 첫 구독 기준선 (BR-U6-10) */
  baseline(deviceId: string, noticeIds: readonly string[]): void {
    for (const n of noticeIds) if (!this.log.has(`${deviceId}|${n}`)) this.log.set(`${deviceId}|${n}`, "baseline");
  }
}

export interface FakePushService {
  transport: PushTransport;
  calls: { endpoint: string; ok: boolean }[];
  /** endpoint → 돌려줄 상태 (없으면 201) */
  status: Map<string, number | "network">;
}

export function fakePushService(delayMs = 0): FakePushService {
  const calls: { endpoint: string; ok: boolean }[] = [];
  const status = new Map<string, number | "network">();
  const transport: PushTransport = async (url) => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const s = status.get(url) ?? 201;
    calls.push({ endpoint: url, ok: s === 201 });
    if (s === "network") throw new TypeError("network");
    return new Response(null, { status: s });
  };
  return { transport, calls, status };
}

export const silentLog: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

/** 테스트용 브라우저 키 (RFC 8291 부록 A의 ua 키) */
export const UA_KEYS = {
  p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
};

export function feedRow(id: string, verdict: FeedRow["verdict"], applyStart: IsoDate | null, applyEnd: IsoDate | null, name: string | null = null): FeedRow {
  return {
    verdict,
    inDistrict: true,
    score: 1,
    detail: { units: [] },
    notice: { id, title: `${id} 공고`, complexName: name, tenure: "rent", applyStart, applyEnd, firstSeenAt: "2026-10-18T00:00:00.000Z" },
    districts: [],
  };
}

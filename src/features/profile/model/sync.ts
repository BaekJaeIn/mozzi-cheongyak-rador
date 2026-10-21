// 프로필·알림 설정·관심 공고 ID(변경 3 U6 BR-U6-D1~D3) 동기화 대기열 (domain-entities §4, BR-U4-62~69)
// - 기기가 원본, 서버는 사본. 대기 중이면 기기의 최신 값 1개를 보낸다 (마지막 저장이 이김)
// - 동시에 한 번만 보낸다. 보내는 중에 새로 저장되면 끝난 뒤 한 번 더 보낸다
// - 네트워크·408·5xx → pending 유지(attempts+1), 400·413 → failed, 성공 → synced
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import type { KeyValueStorage } from "@/features/device/identity-store";
import { loadBookmarkChannel, loadBookmarkSync, markBookmarksPending, saveBookmarkSync } from "@/features/bookmarks/model/sync";
import {
  loadStoredNotify,
  loadStoredProfile,
  type NotifySettings,
  saveStoredNotify,
  saveStoredProfile,
  type SyncState,
} from "./storage";

export type ApiOutcome = { ok: true } | { ok: false; status: number };

export interface SyncApi {
  putProfile(profile: HouseholdProfile): Promise<ApiOutcome>;
  putNotify(settings: NotifySettings): Promise<ApiOutcome>;
  putBookmarks(ids: readonly string[]): Promise<ApiOutcome>;
}

export type FlushResult = "nothing" | "synced" | "offline" | "rejected";

export interface FlushSummary {
  profile: FlushResult;
  notify: FlushResult;
  bookmarks: FlushResult;
}

export interface ProfileSync {
  flush(): Promise<FlushSummary>;
  /** 기기 재등록 때: 서버가 비었으므로 모두 다시 보낸다 (BR-U4-67) */
  markAllPending(): void;
}

/** 서버가 형식을 거절한 응답 — 다시 보내도 같다 */
export function isRejected(status: number): boolean {
  return status === 400 || status === 413;
}

interface Channel<V> {
  load(): { value: V; stamp: string; sync: SyncState } | null;
  save(sync: SyncState): void;
  send(value: V): Promise<ApiOutcome>;
}

/** 한 항목(프로필 또는 알림 설정)을 보낸다. 보내는 동안 새로 저장되면(stamp가 바뀌면) 다시 보낸다 */
async function flushChannel<V>(ch: Channel<V>, now: () => Date): Promise<FlushResult> {
  let result: FlushResult = "nothing";
  for (let round = 0; round < 5; round++) {
    const current = ch.load();
    if (!current || current.sync.state !== "pending") return result;
    const outcome = await ch.send(current.value);
    const after = ch.load();
    if (!after || after.stamp !== current.stamp) {
      // 보내는 중에 새로 저장되었다(또는 지워졌다) — 그 결과는 덮어쓰지 않고 새 값을 다시 본다
      result = outcome.ok ? "synced" : result;
      continue;
    }
    if (outcome.ok) {
      ch.save({ state: "synced", at: now().toISOString() });
      return "synced";
    }
    if (isRejected(outcome.status)) {
      ch.save({ state: "failed", code: "BAD_REQUEST" });
      return "rejected";
    }
    const attempts = after.sync.state === "pending" ? after.sync.attempts + 1 : 1;
    ch.save({ state: "pending", since: after.sync.state === "pending" ? after.sync.since : now().toISOString(), attempts });
    return "offline";
  }
  return result;
}

export function createProfileSync(deps: { storage: KeyValueStorage; api: SyncApi; now?: () => Date }): ProfileSync {
  const now = deps.now ?? (() => new Date());
  const { storage, api } = deps;
  let inflight: Promise<FlushSummary> | null = null;

  const profileChannel: Channel<HouseholdProfile> = {
    load() {
      const s = loadStoredProfile(storage);
      return s ? { value: s.profile, stamp: s.savedAt, sync: s.sync } : null;
    },
    save(sync) {
      const s = loadStoredProfile(storage);
      if (s) saveStoredProfile(storage, { ...s, sync });
    },
    send: (p) => api.putProfile(p),
  };

  const notifyChannel: Channel<NotifySettings> = {
    load() {
      const s = loadStoredNotify(storage);
      if (!s) return null;
      const deadline = s.deadlineEnabled === undefined ? {} : { deadlineEnabled: s.deadlineEnabled };
      return { value: { hour: s.hour, enabled: s.enabled, ...deadline }, stamp: s.updatedAt, sync: s.sync };
    },
    save(sync) {
      const s = loadStoredNotify(storage);
      if (s) saveStoredNotify(storage, { ...s, sync });
    },
    send: (n) => api.putNotify(n),
  };

  const bookmarksChannel: Channel<string[]> = {
    load: () => loadBookmarkChannel(storage, now()),
    save: (sync) => saveBookmarkSync(storage, sync),
    send: (ids) => api.putBookmarks(ids),
  };

  async function run(): Promise<FlushSummary> {
    const profile = await flushChannel(profileChannel, now);
    const notify = await flushChannel(notifyChannel, now);
    const bookmarks = await flushChannel(bookmarksChannel, now);
    return { profile, notify, bookmarks };
  }

  let queued: Promise<FlushSummary> | null = null;
  const start = (): Promise<FlushSummary> => {
    inflight = run().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  return {
    // 보내는 중에 다시 부르면 끝난 뒤 한 번 더 돈다 — 이미 지나간 항목(예: 다시 보내기로 표시한 프로필)을 놓치지 않게 (변경 3)
    flush() {
      if (!inflight) return start();
      queued ??= inflight.then(() => {
        queued = null;
        return inflight ?? start();
      });
      return queued;
    },
    markAllPending() {
      const at = now().toISOString();
      const p = loadStoredProfile(storage);
      if (p) saveStoredProfile(storage, { ...p, sync: { state: "pending", since: at, attempts: 0 } });
      const n = loadStoredNotify(storage);
      if (n) saveStoredNotify(storage, { ...n, sync: { state: "pending", since: at, attempts: 0 } });
      if (loadBookmarkSync(storage)) markBookmarksPending(storage, now());
    },
  };
}

// 테스트용 메모리 Repository — DB 함수와 같은 규칙(프로필 버전 확인, P-U2-R3)을 구현한다
import type { Judgement, StoredProfile } from "../db/types.ts";
import type { JudgementRepository, ProfileRepository, ReplaceResult } from "../db/repositories.ts";
import type { IncomeThreshold } from "../eligibility/income-table.ts";
import type { NoticeForJudgement } from "../eligibility/types.ts";
import type { ProfileStorageFields } from "../security/profile-codec.ts";

export interface MemoryStore {
  profiles: Map<string, StoredProfile>;
  notices: NoticeForJudgement[];
  thresholds: IncomeThreshold[];
  judgements: Map<string, { profileVersion: number; rows: Judgement[] }>;
}

export function createMemoryStore(init: Partial<MemoryStore> = {}): MemoryStore {
  return {
    profiles: init.profiles ?? new Map(),
    notices: init.notices ?? [],
    thresholds: init.thresholds ?? [],
    judgements: init.judgements ?? new Map(),
  };
}

export function memoryRepos(store: MemoryStore) {
  const profiles: ProfileRepository = {
    async save(deviceId, fields: ProfileStorageFields) {
      const version = (store.profiles.get(deviceId)?.profileVersion ?? 0) + 1;
      store.profiles.set(deviceId, { deviceId, ...fields, profileVersion: version, updatedAt: new Date(0) });
      return version;
    },
    async get(deviceId) {
      return store.profiles.get(deviceId) ?? null;
    },
    async listDeviceIdsWithProfile() {
      return [...store.profiles.keys()];
    },
  };
  const judgements: JudgementRepository = {
    async replaceForDevice(deviceId, profileVersion, rows): Promise<ReplaceResult> {
      const current = store.profiles.get(deviceId)?.profileVersion;
      if (current === undefined || profileVersion < current) return "stale";
      const noticeIds = new Set(store.notices.map((n) => n.id));
      store.judgements.set(deviceId, { profileVersion, rows: rows.filter((r) => noticeIds.has(r.noticeId)) });
      return "saved";
    },
  };
  return {
    profiles,
    judgements,
    notices: { listRetainedWithUnits: async () => store.notices.map((n) => structuredClone(n)) },
    reference: { loadIncomeThresholds: async () => [...store.thresholds] },
  };
}

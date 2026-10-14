// Repository 인터페이스 (계약 K2, CG-1)
// 구현: Node → src/server/db/, Deno → supabase/functions/_lib/db/ (U3에서 생성)
// U1은 기기·기준 데이터 부분을 구현하고, 나머지 메서드는 표시한 Unit에서 구현한다.
import type { District, Judgement, Notice, StoredProfile, SupplyTypeLabel } from "./types.ts";

/** register_device RPC 결과 (BR-U1-03, P-S4) */
export type RegisterResult = "created" | "existing" | "conflict" | "rate_limited";

export interface DeviceAuthRecord {
  tokenHash: string;
  lastSeenAt: Date;
}

export interface DeviceRepository {
  /** U1 */
  register(deviceId: string, tokenHash: string): Promise<RegisterResult>;
  /** U1 — 기기가 없으면 null */
  findAuth(deviceId: string): Promise<DeviceAuthRecord | null>;
  /** U1 — lastSeenAt 갱신 */
  touch(deviceId: string, now: Date): Promise<void>;
  /** U1 — 기기와 연결된 모든 데이터 삭제. 삭제했으면 true, 원래 없었으면 false */
  deleteAll(deviceId: string): Promise<boolean>;
}

export interface ProfileRepository {
  /** U4 — 저장 후 새 profileVersion 반환 (RPC save_device_profile) */
  save(profile: Omit<StoredProfile, "profileVersion" | "updatedAt">): Promise<number>;
  /** U2·U4 */
  get(deviceId: string): Promise<StoredProfile | null>;
}

export interface ReferenceDataRepository {
  /** U1 */
  listDistricts(): Promise<District[]>;
  /** U1 */
  listSupplyTypeLabels(): Promise<SupplyTypeLabel[]>;
}

export interface NoticeRepository {
  /** U5 */
  getById(id: string): Promise<Notice | null>;
}

export interface JudgementRepository {
  /** U2 — RPC replace_judgements_for_device */
  replaceForDevice(deviceId: string, judgements: Judgement[]): Promise<void>;
  /** U2 — RPC replace_judgements_for_notices */
  replaceForNotices(noticeIds: string[], judgements: Judgement[]): Promise<void>;
}

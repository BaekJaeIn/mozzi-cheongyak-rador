// Repository 인터페이스 (계약 K2, CG-1)
// 구현: Node → src/server/db/, Deno → supabase/functions/_lib/db/ (U3에서 생성)
import type { NoticeForJudgement } from "../eligibility/types.ts";
import type { IncomeThreshold } from "../eligibility/income-table.ts";
import type { ProfileStorageFields } from "../security/profile-codec.ts";
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
  /** U4 — 알림 시각(0~23)·켜기/끄기 (BR-U4-101) */
  updateNotifySettings(deviceId: string, settings: { hour: number; enabled: boolean }): Promise<void>;
}

export interface ProfileRepository {
  /** U2(U4 사용) — RPC save_device_profile, 새 profileVersion 반환 */
  save(deviceId: string, fields: ProfileStorageFields): Promise<number>;
  /** U2 */
  get(deviceId: string): Promise<StoredProfile | null>;
  /** U2 — 프로필이 있는 기기 목록 (전체 재계산용) */
  listDeviceIdsWithProfile(): Promise<string[]>;
}

export interface ReferenceDataRepository {
  /** U1 */
  listDistricts(): Promise<District[]>;
  /** U1 */
  listSupplyTypeLabels(): Promise<SupplyTypeLabel[]>;
  /** U2 — 소득 기준표 (재계산 1회 1번, NFR-U2-04) */
  loadIncomeThresholds(): Promise<IncomeThreshold[]>;
}

export interface NoticeRepository {
  /** U5 */
  getById(id: string): Promise<Notice | null>;
  /** U2 — 보관 중인 공고 + 주택형 + 지구 ID (P-U2-P2) */
  listRetainedWithUnits(): Promise<NoticeForJudgement[]>;
}

/** 판정 저장 결과: 오래된 프로필 버전으로 계산했으면 stale (P-U2-R3) */
export type ReplaceResult = "saved" | "stale";

export interface JudgementRepository {
  /** U2 — RPC replace_judgements_for_device(device, profileVersion, rows) */
  replaceForDevice(deviceId: string, profileVersion: number, judgements: Judgement[]): Promise<ReplaceResult>;
}

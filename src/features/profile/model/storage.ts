// 기기 저장 (domain-entities §3, Q7=A 암호화 없음). localStorage를 KeyValueStorage로 주입받는다.
import type { HouseholdProfile } from "@shared/domain/profile.ts";
import { parseProfile } from "@shared/domain/profile-migrate.ts";
import { DEVICE_STORAGE_KEY, type KeyValueStorage } from "@/features/device/identity-store";
import { DEFAULT_NOTIFY_HOUR, isValidHour } from "./hour";
import { isStepId, type StepId } from "./steps";
import type { WizardAnswers } from "./types";

export const PROFILE_KEY = "mz.profile";
export const DRAFT_KEY = "mz.profile.draft";
export const NOTIFY_KEY = "mz.notify";
export const DISPLAY_KEY = "mz.display";
/** U5 관심 공고 — 모두 지우기에서 함께 지운다 (BR-U4-94) */
export const BOOKMARKS_KEY = "mz.bookmarks";
/** U5 열어 본 공고·피드 저장본 — 모두 지우기에서 함께 지운다 (U5 BR-U5-42·53) */
export const SEEN_KEY = "mz.seen";
export const FEED_CACHE_KEY = "mz.feed";

export type SyncState =
  | { state: "synced"; at: string }
  | { state: "pending"; since: string; attempts: number }
  | { state: "failed"; code: "BAD_REQUEST" };

export interface StoredProfile {
  version: 1;
  profile: HouseholdProfile;
  savedAt: string;
  sync: SyncState;
}

export interface WizardDraft {
  version: 1;
  answers: WizardAnswers;
  stepId: StepId;
  updatedAt: string;
}

export interface NotifySettings {
  hour: number;
  enabled: boolean;
}

export interface StoredNotify extends NotifySettings {
  version: 1;
  updatedAt: string;
  sync: SyncState;
}

export type DisplayMode = "normal" | "easy";

export class LocalSaveError extends Error {
  constructor() {
    super("이 휴대폰에 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.");
    this.name = "LocalSaveError";
  }
}

function readJson(storage: KeyValueStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(storage: KeyValueStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    throw new LocalSaveError();
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isSyncState(v: unknown): v is SyncState {
  if (!isObject(v)) return false;
  if (v.state === "synced") return typeof v.at === "string";
  if (v.state === "pending") return typeof v.since === "string" && typeof v.attempts === "number";
  return v.state === "failed" && v.code === "BAD_REQUEST";
}

// ---------- 프로필 ----------

/** 없거나 깨졌으면 null (깨진 값은 지우지 않는다 — 다음 저장이 덮어씀) */
export function loadStoredProfile(storage: KeyValueStorage): StoredProfile | null {
  const v = readJson(storage, PROFILE_KEY);
  if (!isObject(v) || v.version !== 1 || typeof v.savedAt !== "string" || !isSyncState(v.sync)) return null;
  const checked = parseProfile(v.profile); // 변경 2 전에 저장한 버전 1도 옮겨 읽는다 (BR-U2-C6)
  return checked.ok ? { version: 1, profile: checked.value, savedAt: v.savedAt, sync: v.sync } : null;
}

export function saveStoredProfile(storage: KeyValueStorage, value: StoredProfile): void {
  writeJson(storage, PROFILE_KEY, value);
}

/** 새로 저장: 동기화 대기 (BR-U4-62) */
export function commitProfile(storage: KeyValueStorage, profile: HouseholdProfile, now: Date): StoredProfile {
  const at = now.toISOString();
  const stored: StoredProfile = { version: 1, profile, savedAt: at, sync: { state: "pending", since: at, attempts: 0 } };
  saveStoredProfile(storage, stored);
  return stored;
}

// ---------- 초안 ----------

export function loadDraft(storage: KeyValueStorage): WizardDraft | null {
  const v = readJson(storage, DRAFT_KEY);
  if (!isObject(v) || v.version !== 1 || !isObject(v.answers) || !isStepId(v.stepId) || typeof v.updatedAt !== "string") {
    if (storage.getItem(DRAFT_KEY) !== null) storage.removeItem(DRAFT_KEY); // 깨진 초안은 지우고 처음부터
    return null;
  }
  return { version: 1, answers: v.answers as WizardAnswers, stepId: v.stepId, updatedAt: v.updatedAt };
}

export function saveDraft(storage: KeyValueStorage, answers: WizardAnswers, stepId: StepId, now: Date): void {
  writeJson(storage, DRAFT_KEY, { version: 1, answers, stepId, updatedAt: now.toISOString() } satisfies WizardDraft);
}

export function clearDraft(storage: KeyValueStorage): void {
  storage.removeItem(DRAFT_KEY);
}

// ---------- 알림 설정 ----------

export const DEFAULT_NOTIFY: NotifySettings = { hour: DEFAULT_NOTIFY_HOUR, enabled: true };

/** 없으면 null — 서버 기본값과 같으므로 보낼 것이 없다 */
export function loadStoredNotify(storage: KeyValueStorage): StoredNotify | null {
  const v = readJson(storage, NOTIFY_KEY);
  if (!isObject(v) || v.version !== 1 || !isValidHour(v.hour) || typeof v.enabled !== "boolean") return null;
  if (typeof v.updatedAt !== "string" || !isSyncState(v.sync)) return null;
  return { version: 1, hour: v.hour, enabled: v.enabled, updatedAt: v.updatedAt, sync: v.sync };
}

export function saveStoredNotify(storage: KeyValueStorage, value: StoredNotify): void {
  writeJson(storage, NOTIFY_KEY, value);
}

export function commitNotify(storage: KeyValueStorage, settings: NotifySettings, now: Date): StoredNotify {
  const at = now.toISOString();
  const stored: StoredNotify = { version: 1, ...settings, updatedAt: at, sync: { state: "pending", since: at, attempts: 0 } };
  saveStoredNotify(storage, stored);
  return stored;
}

// ---------- 화면 모드 ----------

export function loadDisplayMode(storage: KeyValueStorage): DisplayMode {
  try {
    return storage.getItem(DISPLAY_KEY) === "easy" ? "easy" : "normal";
  } catch {
    return "normal";
  }
}

export function saveDisplayMode(storage: KeyValueStorage, mode: DisplayMode): void {
  try {
    storage.setItem(DISPLAY_KEY, mode);
  } catch {
    // 저장이 막혀도 이번 화면에는 적용된다
  }
}

// ---------- 모두 지우기 (BR-U4-94) ----------

/** 프로필·초안·알림 설정·관심 공고·열어 본 공고·피드 저장본·기기 ID를 지운다. 화면 모드는 남긴다 */
export function clearAllPersonal(storage: KeyValueStorage): void {
  for (const key of [PROFILE_KEY, DRAFT_KEY, NOTIFY_KEY, BOOKMARKS_KEY, SEEN_KEY, FEED_CACHE_KEY, DEVICE_STORAGE_KEY]) {
    storage.removeItem(key);
  }
}
